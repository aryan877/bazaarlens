import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createServerImageDeployPlan, parseServerImageDeployOptions, remoteBashCommand, shellQuote } from "./lib/server-image-deploy.mjs";

describe("server image deploy plan", () => {
  it("uses BazaarLens server defaults", () => {
    const options = parseServerImageDeployOptions([], {});
    const plan = createServerImageDeployPlan(options);

    expect(options).toMatchObject({
      host: "hackathon-server",
      deployDir: "/opt/bazaarlens",
      platform: "linux/amd64",
      apiImage: "bazaarlens-api:server-amd64",
      webImage: "bazaarlens-web:server-amd64",
      apiUrl: "https://api.bazaarlens.xyz",
    });
    expect(plan.remoteBundle).toBe("/opt/bazaarlens/releases/bazaarlens-images-amd64.tar.gz");
    expect(plan.preflightCommand).toEqual([
      "ssh",
      "-o",
      "BatchMode=yes",
      "hackathon-server",
      `bash -lc ${shellQuote(plan.preflightScript)}`,
    ]);
    expect(plan.preflightScript).toContain("GOOGLE_VERTEX_API_KEY or GOOGLE_VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT");
    expect(plan.preflightScript).toContain("BazaarLens server deploy requires NODE_ENV=production");
    expect(plan.preflightScript).toContain("Project-based Google Vertex deploy requires GOOGLE_APPLICATION_CREDENTIALS");
    expect(plan.preflightScript).toContain("Google application credentials file is missing on host");
    expect(plan.preflightScript).toContain("MongoDB track requires AGENT_MEMORY_MCP_HTTP_URL or MONGODB_MEMORY_CONNECTION_STRING");
    expect(plan.preflightScript).toContain("GITLAB_PROJECT_ID");
    expect(plan.composeScpCommand).toEqual([
      "scp",
      "deploy/docker-compose.server.yml",
      "hackathon-server:/opt/bazaarlens/docker-compose.yml.next",
    ]);
    expect(plan.remoteScript).toContain("docker-compose.yml.next");
    expect(plan.remoteScript).toContain("up -d --no-deps --force-recreate api web");
    expect(plan.healthScript).toContain("bazaarlens-server-api");
    expect(plan.healthScript).toContain("bazaarlens-server-web");
  });

  it("threads public web build args and smoke API URL through the plan", () => {
    const options = parseServerImageDeployOptions(
      ["--api-url", "https://api.example.com/", "--google-client-id", "123.apps.googleusercontent.com"],
      {},
    );
    const plan = createServerImageDeployPlan(options);
    const webBuild = plan.buildCommands[1];

    expect(options.apiUrl).toBe("https://api.example.com");
    expect(webBuild).toContain("VITE_API_URL=https://api.example.com");
    expect(webBuild).toContain("VITE_GOOGLE_CLIENT_ID=123.apps.googleusercontent.com");
    expect(plan.smokeCommands).toEqual([
      ["pnpm", "smoke:live:web"],
      ["pnpm", "smoke:a2a"],
      ["node", "scripts/smoke-docker.mjs"],
    ]);
  });

  it("allows dry-run flags to skip build and smoke work", () => {
    const options = parseServerImageDeployOptions(["--dry-run", "--skip-build", "--skip-smoke"], {});

    expect(options.dryRun).toBe(true);
    expect(options.skipBuild).toBe(true);
    expect(options.skipSmoke).toBe(true);
  });

  it("quotes shell values safely", () => {
    expect(shellQuote("/opt/bazaarlens")).toBe("'/opt/bazaarlens'");
    expect(shellQuote("value'with'quotes")).toBe("'value'\\''with'\\''quotes'");
  });

  it("quotes remote bash scripts as one SSH command argument", () => {
    expect(remoteBashCommand("example-host", "echo 'ok'")).toEqual([
      "ssh",
      "-o",
      "BatchMode=yes",
      "example-host",
      "bash -lc 'echo '\\''ok'\\'''",
    ]);
  });

  it("passes remote preflight for project ADC when the host credential file exists", () => {
    const dir = fixtureDeployDir(`
      NODE_ENV=production
      API_PUBLIC_URL=https://api.bazaarlens.xyz
      CORS_ORIGIN=https://bazaarlens.xyz
      DATABASE_URL=postgresql://user:password@postgres:5432/bazaarlens
      JWT_SECRET=a-production-jwt-secret-with-more-than-32-chars
      A2A_AGENT_KEY=a-32-plus-character-a2a-agent-key
      HACKATHON_TRACK=mongodb
      GOOGLE_VERTEX_PROJECT=bazaarlens-gcp-project
      GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/bazaarlens/google-application-credentials.json
      GOOGLE_APPLICATION_CREDENTIALS_HOST_DIR=./secrets
      AGENT_MEMORY_ENABLED=true
      MONGODB_MEMORY_CONNECTION_STRING=mongodb://mongo:27017/bazaarlens_agent
    `);
    mkdirSync(join(dir, "secrets"));
    writeFileSync(join(dir, "secrets", "google-application-credentials.json"), "{}");

    try {
      const result = runPreflight(dir);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("BazaarLens remote deploy preflight passed for HACKATHON_TRACK=mongodb");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails remote preflight for project ADC when the host credential file is missing", () => {
    const dir = fixtureDeployDir(`
      NODE_ENV=production
      API_PUBLIC_URL=https://api.bazaarlens.xyz
      CORS_ORIGIN=https://bazaarlens.xyz
      DATABASE_URL=postgresql://user:password@postgres:5432/bazaarlens
      JWT_SECRET=a-production-jwt-secret-with-more-than-32-chars
      A2A_AGENT_KEY=a-32-plus-character-a2a-agent-key
      HACKATHON_TRACK=mongodb
      GOOGLE_VERTEX_PROJECT=bazaarlens-gcp-project
      GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/bazaarlens/google-application-credentials.json
      GOOGLE_APPLICATION_CREDENTIALS_HOST_DIR=./secrets
      AGENT_MEMORY_ENABLED=true
      MONGODB_MEMORY_CONNECTION_STRING=mongodb://mongo:27017/bazaarlens_agent
    `);

    try {
      const result = runPreflight(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Google application credentials file is missing on host");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("mounts optional Google ADC credentials into production API containers", () => {
    const productionCompose = readFileSync("docker-compose.prod.yml", "utf8");
    const serverCompose = readFileSync("deploy/docker-compose.server.yml", "utf8");

    for (const compose of [productionCompose, serverCompose]) {
      expect(compose).toContain("GOOGLE_APPLICATION_CREDENTIALS: ${GOOGLE_APPLICATION_CREDENTIALS:-}");
      expect(compose).toContain(":/run/secrets/bazaarlens:ro");
    }
  });
});

function fixtureDeployDir(envText) {
  const dir = mkdtempSync(join(tmpdir(), "bazaarlens-preflight-"));
  writeFileSync(
    join(dir, ".env"),
    envText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n"),
  );
  return dir;
}

function runPreflight(dir) {
  const options = parseServerImageDeployOptions(["--dir", dir], {});
  const plan = createServerImageDeployPlan(options);
  return spawnSync("bash", ["-lc", plan.preflightScript], { encoding: "utf8" });
}
