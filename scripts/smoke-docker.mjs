const apiUrl = process.env.API_URL ?? "http://localhost:8787";

const productPage = {
  url: "https://www.amazon.in/example/dp/B000000",
  merchant: "amazon",
  title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
  price: { amount: 1299, currency: "INR", raw: "₹1,299" },
  mrp: { amount: 4490, currency: "INR", raw: "₹4,490" },
  discountText: "71% off",
  rating: 4.0,
  reviewCount: 184236,
  seller: "Appario Retail Private Ltd",
  availability: "In stock",
  delivery: "Tomorrow by 10 PM",
  returnPolicy: "7 days service centre replacement",
  selectedSize: null,
  images: [],
  breadcrumbs: ["Electronics", "Headphones", "True Wireless"],
  visibleText: "In stock. 7 days service centre replacement. Seller Appario Retail Private Ltd.",
  extractedAt: new Date().toISOString(),
};

async function main() {
  await waitForHealth();
  const email = `smoke-${Date.now()}@bazaarlens.app`;
  const auth = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "password123", name: "Smoke Test" }),
  });

  const token = auth.accessToken;
  const analysis = await request("/agent/analyze", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      page: productPage,
      intent: {
        query: "Should I buy this under ₹1,500?",
        budget: 1500,
        userContext: "I care about seller trust and return window.",
      },
    }),
  });

  assert(analysis.sessionId, "analyze should return sessionId");
  assert(analysis.decision?.model, "analyze should return model name");
  assert(analysis.decision?.reasons?.length, "analyze should return reasons");

  await expectRequestFailure("/agent/approval", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId: analysis.sessionId,
      action: tamperedAction(analysis.decision.action),
      approved: true,
    }),
  }, 400);

  const approval = await request("/agent/approval", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId: analysis.sessionId,
      action: analysis.decision.action,
      approved: true,
    }),
  });
  assert(approval.command?.command, "approval should return a browser command");

  const history = await request("/agent/history", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert(Array.isArray(history) && history.length >= 1, "history should include the analyzed session");

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiUrl,
        email,
        verdict: analysis.decision.verdict,
        model: analysis.decision.model,
        command: approval.command.command,
        tamperGuard: true,
        historyCount: history.length,
      },
      null,
      2,
    ),
  );
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const { body: health, response } = await requestWithResponse("/health/ready");
      assert(response.headers.get("x-ratelimit-limit"), "readiness should include rate-limit headers");
      if (health.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error("API did not become healthy");
}

async function request(path, options = {}) {
  const { body } = await requestWithResponse(path, options);
  return body;
}

async function requestWithResponse(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${text || response.statusText}`);
  }
  return {
    body: JSON.parse(text),
    response,
  };
}

async function expectRequestFailure(path, options = {}, expectedStatus) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected ${expectedStatus}, got ${response.status}: ${text || response.statusText}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tamperedAction(action) {
  return {
    ...action,
    type: action.type === "add_to_cart" ? "wishlist" : "add_to_cart",
    label: "Tampered browser action",
    requiresApproval: true,
    payload: {},
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
