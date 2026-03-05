import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const TEST_PORT = 4700 + Math.floor(Math.random() * 300);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_TOKEN_SECRET = "billing-test-secret";

let serverProcess = null;
let testDataDir = "";
let userOneToken = "";
let userTwoToken = "";
let createdPaymentId = "";
let createdPlanId = "";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  for (let i = 0; i < 60; i += 1) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`테스트 서버가 비정상 종료되었습니다. code=${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore while server is starting.
    }

    await sleep(100);
  }

  throw new Error("테스트 서버 시작 대기 시간이 초과되었습니다.");
}

async function signupAndGetToken(email) {
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password: "password1234"
    })
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  return payload.data.accessToken;
}

test.before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "fortune-billing-"));

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      AI_PROVIDER: "mock",
      DATA_DIR: testDataDir,
      AUTH_TOKEN_SECRET: TEST_TOKEN_SECRET
    },
    stdio: "ignore"
  });

  await waitForServerReady();
  userOneToken = await signupAndGetToken("billing-user-1@example.com");
  userTwoToken = await signupAndGetToken("billing-user-2@example.com");
});

test.after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    for (let i = 0; i < 20; i += 1) {
      if (serverProcess.exitCode !== null) {
        break;
      }
      await sleep(50);
    }
    if (serverProcess.exitCode === null) {
      serverProcess.kill("SIGKILL");
    }
  }

  if (testDataDir) {
    await rm(testDataDir, { recursive: true, force: true });
  }
});

test("GET /api/billing/plans returns credit plans", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/plans`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.data.plans), true);
  assert.equal(payload.data.plans.length >= 1, true);
  createdPlanId = payload.data.plans[0].id;
});

test("POST /api/billing/checkout creates payment record", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userOneToken}`
    },
    body: JSON.stringify({
      planId: createdPlanId
    })
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.payment.planId, createdPlanId);
  assert.equal(payload.data.payment.status, "created");
  assert.equal(typeof payload.data.payment.id, "string");
  createdPaymentId = payload.data.payment.id;
});

test("POST /api/billing/checkout/confirm adds credits", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userOneToken}`
    },
    body: JSON.stringify({
      paymentId: createdPaymentId
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.payment.status, "paid");
  assert.equal(payload.data.alreadyPaid, false);
  assert.equal(payload.data.wallet.credits >= payload.data.payment.credits, true);
});

test("confirm endpoint is idempotent for paid payment", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userOneToken}`
    },
    body: JSON.stringify({
      paymentId: createdPaymentId
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.alreadyPaid, true);
});

test("GET /api/billing/me returns wallet and transactions", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/me`, {
    headers: {
      Authorization: `Bearer ${userOneToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.wallet.credits > 0, true);
  assert.equal(payload.data.payments.length >= 1, true);
  assert.equal(payload.data.transactions.length >= 1, true);
});

test("other user cannot confirm another user's payment", async () => {
  const response = await fetch(`${BASE_URL}/api/billing/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userTwoToken}`
    },
    body: JSON.stringify({
      paymentId: createdPaymentId
    })
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "BILLING_PAYMENT_NOT_FOUND");
});
