import { spawnSync } from "node:child_process";
import { createServerImageDeployPlan, parseServerImageDeployOptions, remoteBashCommand } from "./lib/server-image-deploy.mjs";

const options = parseServerImageDeployOptions();
const plan = createServerImageDeployPlan(options);

if (options.dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        host: options.host,
        deployDir: options.deployDir,
        platform: options.platform,
        apiImage: options.apiImage,
        webImage: options.webImage,
        apiUrl: options.apiUrl,
        googleClientConfigured: Boolean(options.googleClientId),
        bundlePath: options.bundlePath,
        releaseName: plan.releaseName,
        remoteBundle: plan.remoteBundle,
        preflightCommand: plan.preflightCommand,
        preflightScript: plan.preflightScript,
        buildCommands: options.skipBuild ? [] : plan.buildCommands,
        saveCommand: plan.saveCommand,
        scpCommand: plan.scpCommand,
        composeScpCommand: plan.composeScpCommand,
        remoteScript: plan.remoteScript,
        healthScript: plan.healthScript,
        smokeCommands: options.skipSmoke ? [] : plan.smokeCommands,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

run(plan.preflightCommand);

if (!options.skipBuild) {
  for (const command of plan.buildCommands) {
    run(command);
  }
}

run(["sh", "-lc", plan.saveCommand]);
run(plan.scpCommand);
run(plan.composeScpCommand);
run(remoteBashCommand(options.host, plan.remoteScript));
run(remoteBashCommand(options.host, plan.healthScript));

if (!options.skipSmoke) {
  for (const command of plan.smokeCommands) {
    run(command, {
      env: {
        API_URL: options.apiUrl,
      },
    });
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      host: options.host,
      deployDir: options.deployDir,
      apiImage: options.apiImage,
      webImage: options.webImage,
      apiUrl: options.apiUrl,
      googleClientConfigured: Boolean(options.googleClientId),
      releaseName: plan.releaseName,
      smokeRan: !options.skipSmoke,
    },
    null,
    2,
  ),
);

function run(command, options = {}) {
  console.log(`\n==> ${command.join(" ")}`);
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
