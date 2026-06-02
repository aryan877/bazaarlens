const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
const apiUrl = process.env.API_URL ?? "http://localhost:8787";

async function main() {
  const [webHtml, apiHealth, apiReadiness] = await Promise.all([
    readText(webUrl),
    readJson(`${apiUrl}/health`),
    readJson(`${apiUrl}/health/ready`),
  ]);

  assert(webHtml.includes('<div id="root"></div>'), "web root should serve the Vite app shell");
  assert(webHtml.includes("/assets/"), "web root should reference compiled assets");
  assert(apiHealth.ok === true, "API health should be ok");
  assert(apiHealth.service === "bazaarlens-api", "API health should identify the BazaarLens API");
  assert(apiReadiness.ok === true, "API readiness should be ok");
  assert(apiReadiness.checks?.database === "ok", "API readiness should include a database check");

  console.log(
    JSON.stringify(
      {
        ok: true,
        webUrl,
        apiUrl,
        apiService: apiHealth.service,
        database: apiReadiness.checks.database,
      },
      null,
      2,
    ),
  );
}

async function readText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}: ${response.statusText}`);
  return response.text();
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}: ${await response.text()}`);
  return response.json();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
