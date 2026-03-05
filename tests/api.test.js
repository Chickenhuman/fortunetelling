import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const TEST_PORT = 3100 + Math.floor(Math.random() * 500);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess = null;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  for (let i = 0; i < 40; i += 1) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`테스트 서버가 비정상 종료되었습니다. code=${serverProcess.exitCode}`);
    }

    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Ignore connection errors while booting.
    }

    await sleep(100);
  }

  throw new Error("테스트 서버 시작 대기 시간이 초과되었습니다.");
}

test.before(async () => {
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      AI_PROVIDER: "mock"
    },
    stdio: "ignore"
  });

  await waitForServerReady();
});

test.after(async () => {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill("SIGTERM");

  for (let i = 0; i < 20; i += 1) {
    if (serverProcess.exitCode !== null) {
      return;
    }
    await sleep(50);
  }

  serverProcess.kill("SIGKILL");
});

test("POST /api/analyze returns success payload", async () => {
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      profile: {
        name: "테스터",
        gender: "male",
        birthDate: "1995-02-14",
        calendarType: "solar",
        birthTimeUnknown: false,
        birthTime: "오시"
      },
      type: "overall"
    })
  });

  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.data.meta.provider, "string");
  assert.equal(typeof payload.data.pillars.year.stem, "string");
  assert.equal(typeof payload.data.report.title, "string");
});

test("POST /api/analyze returns standardized validation error", async () => {
  const response = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      profile: {
        name: "테스터",
        gender: "male",
        birthDate: "1888-01-01",
        calendarType: "solar",
        birthTimeUnknown: true,
        birthTime: ""
      },
      type: "overall"
    })
  });

  assert.equal(response.status, 400);

  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
  assert.equal(payload.error.retryable, false);
  assert.equal(typeof payload.error.message, "string");
});

test("unknown path returns standardized NOT_FOUND error", async () => {
  const response = await fetch(`${BASE_URL}/not-found`);
  assert.equal(response.status, 404);

  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "NOT_FOUND");
  assert.equal(payload.error.retryable, false);
});
