import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasFlag, parseEnvFile } from "./lib/env-file.mjs";

const argv = process.argv.slice(2);
const finalMode = hasFlag(argv, "--final") || process.env.SUBMISSION_FINAL === "1";
const tracks = ["mongodb", "arize", "elastic", "fivetran", "gitlab", "dynatrace"];
const trackLabels = {
  mongodb: "MongoDB",
  arize: "Arize",
  elastic: "Elastic",
  fivetran: "Fivetran",
  gitlab: "GitLab",
  dynatrace: "Dynatrace",
};

const root = resolve(".");
const findings = {
  ok: true,
  finalMode,
  checks: [],
  warnings: [],
  blockers: [],
};

const productionExample = read("deploy/production.env.example");
const productionEnv = parseEnvFile(productionExample);
const selectedTrack = productionEnv.HACKATHON_TRACK ?? "";
const selectedTrackLabel = trackLabels[selectedTrack] ?? selectedTrack;

check("MIT license file exists", exists("LICENSE") && read("LICENSE").includes("MIT License"));
check("Root package declares MIT license", json("package.json").license === "MIT");
check("Root package remains private as an npm workspace", json("package.json").private === true);
check("Smoke A2A script is registered", Boolean(json("package.json").scripts?.["smoke:a2a"]));
check("Submission guide exists", exists("SUBMISSION.md"));
check("Google Agent Platform registration guide exists", exists("integrations/google-agent-platform/a2a-registration.md"));

const submission = read("SUBMISSION.md");
check("Submission guide includes hosted project URL", submission.includes("https://bazaarlens.xyz"));
check("Submission guide includes code repository URL", submission.includes("https://github.com/aryan877/bazaarlens"));
check("Submission guide includes license artifact", submission.includes("LICENSE"));
check("Production env example selects a valid Devpost track", tracks.includes(selectedTrack));
check(`Submission guide names ${selectedTrackLabel} as selected track`, new RegExp(`Selected track\\s*\\|\\s*${escapeRegExp(selectedTrackLabel)}`, "i").test(submission));
check("Submission guide documents public selected-track proof", submission.includes("selectedTrackReadiness"));

const a2aSmoke = read("scripts/smoke-a2a.mjs");
check("A2A smoke validates public submission profile", a2aSmoke.includes("/.well-known/bazaarlens-submission.json"));
check("A2A smoke validates selected-track readiness", a2aSmoke.includes("selectedTrackReadiness"));
check("A2A smoke validates selected-track MCP proof", a2aSmoke.includes("mcpServer") && a2aSmoke.includes("qualificationEvidence"));
check("A2A smoke validates Agent Platform surfaces", a2aSmoke.includes("agentPlatform") && a2aSmoke.includes("a2aHttpJsonUrl"));
check("A2A smoke validates Agent Builder import details", a2aSmoke.includes("googleCloudAgentBuilder") && a2aSmoke.includes("openApiToolSchemaUrl"));
check("A2A smoke validates no MongoDB connection strings leak", a2aSmoke.includes("mongodb://"));

if (selectedTrack === "mongodb") {
  check("Production env example enables MongoDB agent memory for MongoDB track", productionEnv.AGENT_MEMORY_ENABLED === "true");
}
check("Production env example uses Google Gemini model", /^GOOGLE_VERTEX_MODEL=gemini-3\.5-flash$/m.test(productionExample));
check("Production env example requires A2A key", /^A2A_AGENT_KEY=replace-with-32-plus-character-a2a-agent-key$/m.test(productionExample));

const readme = read("README.md");
check("README documents Google Agent Platform A2A registration", readme.includes("Gemini Enterprise") && readme.includes("A2A"));
check("README documents partner track selector", readme.includes("HACKATHON_TRACK"));
check("README documents MCP evidence provider selector", readme.includes("AGENT_EVIDENCE_PROVIDERS"));

const sourceText = [
  read("apps/api/src/modules/a2a/a2a.service.ts"),
  read("apps/api/src/modules/mcp/mcp-connectors.ts"),
  read("apps/api/src/shared/env.ts"),
].join("\n");
check("Source exposes all six Devpost partner tracks", ["mongodb", "arize", "elastic", "fivetran", "gitlab", "dynatrace"].every((track) => sourceText.includes(`"${track}"`)));
check("Source exposes the selected Devpost track", sourceText.includes(`"${selectedTrack}"`));
check("Source does not mention old product name", !/\bproxy shop\b/i.test(sourceText));

warnIf(
  "Repository is private during development; make it public or grant judge access before Devpost review.",
  submission.includes("private during development") || submission.includes("private_until_devpost_submission"),
);
warnIf("Demo video is still pending.", submission.includes("Demo video | Pending") || submission.includes("demoVideoUrl: null"));

if (finalMode) {
  blockUnless(
    "Final submission requires public/judge-access repository status in SUBMISSION.md.",
    !submission.includes("private during development") && !submission.includes("private_until_devpost_submission"),
  );
  blockUnless("Final submission requires demo video URL to be filled.", !submission.includes("Demo video | Pending") && !submission.includes("demoVideoUrl: null"));
}

findings.ok = findings.blockers.length === 0;
console.log(JSON.stringify(findings, null, 2));
process.exit(findings.ok ? 0 : 1);

function check(name, passed) {
  findings.checks.push({ name, passed: Boolean(passed) });
  if (!passed) findings.blockers.push(name);
}

function warnIf(message, condition) {
  if (condition) findings.warnings.push(message);
}

function blockUnless(message, passed) {
  if (!passed) findings.blockers.push(message);
}

function exists(path) {
  return existsSync(resolve(root, path));
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
