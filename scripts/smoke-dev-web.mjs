const webUrl = stripTrailingSlash(process.env.WEB_URL ?? "http://localhost:3000");
const apiUrl = stripTrailingSlash(process.env.API_URL ?? "http://localhost:8787");

const html = await readText(`${webUrl}/`);
assert(html.includes('<div id="root"></div>'), "dev web root should serve the React app shell");
assert(html.includes("<title>BazaarLens</title>"), "dev web root should use the BazaarLens title");
assert(html.includes("/src/main.tsx"), "dev web root should be served by Vite");

const readiness = await readJson(`${apiUrl}/health/ready`);
assert(readiness.ok === true, "API readiness should be ok");
assert(readiness.checks?.database === "ok", "API readiness should include database ok");

console.log(
  JSON.stringify(
    {
      ok: true,
      webUrl,
      apiUrl,
      apiReadiness: readiness.checks,
      mode: "vite-dev",
    },
    null,
    2,
  ),
);

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

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
