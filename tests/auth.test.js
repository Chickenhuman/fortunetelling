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
const TEST_PORT = 3600 + Math.floor(Math.random() * 500);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_TOKEN_SECRET = "test-secret-key";

let serverProcess = null;
let testDataDir = "";
let accessToken = "";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  for (let i = 0; i < 50; i += 1) {
    if (serverProcess?.exitCode !== null && serverProcess?.exitCode !== undefined) {
      throw new Error(`테스트 서버가 비정상 종료되었습니다. code=${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore connection errors while server starts.
    }

    await sleep(100);
  }

  throw new Error("테스트 서버 시작 대기 시간이 초과되었습니다.");
}

test.before(async () => {
  testDataDir = await mkdtemp(path.join(tmpdir(), "fortune-auth-"));

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

test("POST /api/auth/signup creates an account", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "user@example.com",
      password: "password1234",
      displayName: "홍길동"
    })
  });

  assert.equal(response.status, 201);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.data.user.email, "user@example.com");
  assert.equal(payload.data.user.displayName, "홍길동");
  assert.equal(typeof payload.data.accessToken, "string");
  assert.equal(payload.data.tokenType, "Bearer");
  accessToken = payload.data.accessToken;
});

test("POST /api/auth/signup rejects duplicate email", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "user@example.com",
      password: "password1234"
    })
  });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AUTH_EMAIL_ALREADY_EXISTS");
});

test("POST /api/auth/login returns access token", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "user@example.com",
      password: "password1234"
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.data.user.email, "user@example.com");
  assert.equal(typeof payload.data.accessToken, "string");
  accessToken = payload.data.accessToken;
});

test("POST /api/auth/login rejects invalid credentials", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: "user@example.com",
      password: "wrong-password"
    })
  });

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AUTH_INVALID_CREDENTIALS");
});

test("GET /api/auth/me returns authenticated user", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.user.email, "user@example.com");
});

test("GET /api/auth/me rejects missing token", async () => {
  const response = await fetch(`${BASE_URL}/api/auth/me`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "AUTH_TOKEN_REQUIRED");
});
