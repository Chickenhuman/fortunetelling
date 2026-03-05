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
const TEST_PORT = 5100 + Math.floor(Math.random() * 300);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_TOKEN_SECRET = "ads-test-secret";

let serverProcess = null;
let testDataDir = "";
let freeUserToken = "";
let paidUserToken = "";
let paidPlanId = "";

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

async function makePaidUser(token) {
  const plansResponse = await fetch(`${BASE_URL}/api/billing/plans`);
  assert.equal(plansResponse.status, 200);
  const plansPayload = await plansResponse.json();
  paidPlanId = plansPayload.data.plans[0].id;

  const checkoutResponse = await fetch(`${BASE_URL}/api/billing/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      planId: paidPlanId
    })
  });

  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await checkoutResponse.json();
  const paymentId = checkoutPayload.data.payment.id;

  const confirmResponse = await fetch(`${BASE_URL}/api/billing/checkout/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      paymentId
    })
  });

  assert.equal(confirmResponse.status, 200);
}

test.before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "fortune-ads-"));

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
  freeUserToken = await signupAndGetToken("ads-free-user@example.com");
  paidUserToken = await signupAndGetToken("ads-paid-user@example.com");
  await makePaidUser(paidUserToken);
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

test("GET /api/ads/placement returns ad for guest tier", async () => {
  const response = await fetch(`${BASE_URL}/api/ads/placement?surface=result`);
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.tier, "guest");
  assert.equal(payload.data.policy.showAds, true);
  assert.equal(payload.data.creative.network, "house");
});

test("GET /api/ads/placement returns ad for free member tier", async () => {
  const response = await fetch(`${BASE_URL}/api/ads/placement?surface=input`, {
    headers: {
      Authorization: `Bearer ${freeUserToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.tier, "free");
  assert.equal(payload.data.policy.showAds, true);
  assert.equal(payload.data.creative.slotId, "input_top_banner");
});

test("GET /api/ads/placement hides ad for paid tier", async () => {
  const response = await fetch(`${BASE_URL}/api/ads/placement?surface=billing`, {
    headers: {
      Authorization: `Bearer ${paidUserToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.tier, "premium");
  assert.equal(payload.data.policy.showAds, false);
  assert.equal(payload.data.creative, null);
});

test("GET /api/ads/placement validates surface", async () => {
  const response = await fetch(`${BASE_URL}/api/ads/placement?surface=unknown`);
  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AD_INVALID_SURFACE");
});
