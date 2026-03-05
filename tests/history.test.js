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
const TEST_PORT = 4300 + Math.floor(Math.random() * 500);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_TOKEN_SECRET = "history-test-secret-key";

let serverProcess = null;
let testDataDir = "";
let userOneToken = "";
let userTwoToken = "";
let historyId = "";

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
      // Ignore connection errors while booting.
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
  testDataDir = await mkdtemp(path.join(tmpdir(), "fortune-history-"));

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
  userOneToken = await signupAndGetToken("history-user-1@example.com");
  userTwoToken = await signupAndGetToken("history-user-2@example.com");
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

test("POST /api/history/analyze stores analysis history", async () => {
  const response = await fetch(`${BASE_URL}/api/history/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userOneToken}`
    },
    body: JSON.stringify({
      profile: {
        name: "히스토리 사용자",
        gender: "female",
        birthDate: "1998-11-30",
        calendarType: "solar",
        birthTimeUnknown: false,
        birthTime: "유시"
      },
      type: "overall"
    })
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.profile.name, "히스토리 사용자");
  assert.equal(typeof payload.data.analysis.report.title, "string");
  assert.equal(typeof payload.data.id, "string");
  historyId = payload.data.id;
});

test("GET /api/history returns list for authenticated user", async () => {
  const response = await fetch(`${BASE_URL}/api/history?limit=10`, {
    headers: {
      Authorization: `Bearer ${userOneToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(Array.isArray(payload.data.items), true);
  assert.equal(payload.data.items.length >= 1, true);
  assert.equal(payload.data.items[0].id, historyId);
});

test("GET /api/history/:id returns detail for owner", async () => {
  const response = await fetch(`${BASE_URL}/api/history/${historyId}`, {
    headers: {
      Authorization: `Bearer ${userOneToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.id, historyId);
  assert.equal(typeof payload.data.analysis.report.summary, "string");
});

test("GET /api/history/:id rejects access from other user", async () => {
  const response = await fetch(`${BASE_URL}/api/history/${historyId}`, {
    headers: {
      Authorization: `Bearer ${userTwoToken}`
    }
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "HISTORY_NOT_FOUND");
});

test("GET /api/history requires access token", async () => {
  const response = await fetch(`${BASE_URL}/api/history`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AUTH_TOKEN_REQUIRED");
});
