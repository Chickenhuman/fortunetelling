import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { AppError } from "./errors.js";

const DEFAULT_DATA_DIR = "data";
const USER_STORE_FILE = "users.json";
const DEFAULT_TOKEN_SECRET = "dev-insecure-token-secret-change-me";
const ACCESS_TOKEN_TTL_SEC = 60 * 60 * 24 * 7;
const HASH_ITERATIONS = 120000;
const HASH_KEY_LEN = 32;
const HASH_DIGEST = "sha256";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongEnoughPassword(value) {
  return typeof value === "string" && value.length >= 8;
}

function resolveDataDir(env = process.env) {
  const configured = normalizeText(env.DATA_DIR);
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), DEFAULT_DATA_DIR);
}

function resolveUserStorePath(env = process.env) {
  return path.join(resolveDataDir(env), USER_STORE_FILE);
}

function resolveTokenSecret(env = process.env) {
  const configured = normalizeText(env.AUTH_TOKEN_SECRET);
  return configured || DEFAULT_TOKEN_SECRET;
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signHmac(data, secret) {
  return createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createAccessToken(payload, secret) {
  const encodedHeader = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signHmac(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyAccessToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "인증 토큰이 올바르지 않습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = signHmac(`${encodedHeader}.${encodedPayload}`, secret);

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "인증 토큰 검증에 실패했습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  let payload = null;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "인증 토큰 형식이 올바르지 않습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new AppError({
      code: "AUTH_TOKEN_EXPIRED",
      message: "인증 토큰이 만료되었습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "인증 토큰 사용자 정보가 올바르지 않습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  return payload;
}

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LEN, HASH_DIGEST).toString(
    "hex"
  );

  return `pbkdf2$${HASH_ITERATIONS}$${HASH_DIGEST}$${salt}$${hash}`;
}

function verifyPasswordHash(password, hashedValue) {
  const [scheme, iterText, digest, salt, expectedHash] = String(hashedValue).split("$");
  if (
    scheme !== "pbkdf2" ||
    !iterText ||
    !digest ||
    !salt ||
    !expectedHash ||
    Number.isNaN(Number(iterText))
  ) {
    return false;
  }

  const iterations = Number(iterText);
  const actualHash = pbkdf2Sync(password, salt, iterations, HASH_KEY_LEN, digest).toString("hex");

  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function loadUsers(env = process.env) {
  const filePath = resolveUserStorePath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed?.users)) {
      return parsed.users;
    }

    throw new AppError({
      code: "AUTH_STORE_INVALID",
      message: "사용자 저장소 형식이 올바르지 않습니다.",
      statusCode: 500,
      retryable: false
    });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError({
      code: "AUTH_STORE_READ_FAILED",
      message: "사용자 저장소를 읽을 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

async function saveUsers(users, env = process.env) {
  const filePath = resolveUserStorePath(env);
  const dirPath = path.dirname(filePath);

  try {
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, JSON.stringify({ users }, null, 2), "utf8");
  } catch (error) {
    throw new AppError({
      code: "AUTH_STORE_WRITE_FAILED",
      message: "사용자 정보를 저장할 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

function issueToken(user, env = process.env) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    iat: nowSec,
    exp: nowSec + ACCESS_TOKEN_TTL_SEC
  };

  const accessToken = createAccessToken(payload, resolveTokenSecret(env));
  return {
    accessToken,
    tokenType: "Bearer",
    expiresInSec: ACCESS_TOKEN_TTL_SEC
  };
}

function ensureValidAuthInput({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!isValidEmail(normalizedEmail)) {
    throw new AppError({
      code: "AUTH_INVALID_EMAIL",
      message: "이메일 형식이 올바르지 않습니다.",
      statusCode: 400,
      retryable: false
    });
  }

  if (!isStrongEnoughPassword(normalizedPassword)) {
    throw new AppError({
      code: "AUTH_WEAK_PASSWORD",
      message: "비밀번호는 8자 이상이어야 합니다.",
      statusCode: 400,
      retryable: false
    });
  }

  return {
    email: normalizedEmail,
    password: normalizedPassword
  };
}

export function extractBearerToken(authorization) {
  const raw = normalizeText(authorization);
  if (!raw) {
    throw new AppError({
      code: "AUTH_TOKEN_REQUIRED",
      message: "인증 토큰이 필요합니다.",
      statusCode: 401,
      retryable: false
    });
  }

  if (!raw.toLowerCase().startsWith("bearer ")) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "Authorization 헤더 형식이 올바르지 않습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  const token = raw.slice(7).trim();
  if (!token) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "인증 토큰이 비어 있습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  return token;
}

export async function signup(payload, env = process.env) {
  const input = payload && typeof payload === "object" ? payload : {};
  const validInput = ensureValidAuthInput({ email: input.email, password: input.password });
  const displayName = input.displayName;
  const normalizedName = normalizeText(displayName);
  const users = await loadUsers(env);

  if (users.some((user) => user.email === validInput.email)) {
    throw new AppError({
      code: "AUTH_EMAIL_ALREADY_EXISTS",
      message: "이미 가입된 이메일입니다.",
      statusCode: 409,
      retryable: false
    });
  }

  const nowIso = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: validInput.email,
    displayName: normalizedName || validInput.email.split("@")[0] || "사용자",
    passwordHash: createPasswordHash(validInput.password),
    createdAt: nowIso,
    updatedAt: nowIso
  };

  users.push(user);
  await saveUsers(users, env);

  return {
    user: sanitizeUser(user),
    ...issueToken(user, env)
  };
}

export async function login(payload, env = process.env) {
  const input = payload && typeof payload === "object" ? payload : {};
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedPassword = typeof input.password === "string" ? input.password : "";
  const users = await loadUsers(env);

  const user = users.find((candidate) => candidate.email === normalizedEmail);
  if (!user || !verifyPasswordHash(normalizedPassword, user.passwordHash)) {
    throw new AppError({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      statusCode: 401,
      retryable: false
    });
  }

  return {
    user: sanitizeUser(user),
    ...issueToken(user, env)
  };
}

export async function getMe(authorization, env = process.env) {
  const token = extractBearerToken(authorization);
  const payload = verifyAccessToken(token, resolveTokenSecret(env));
  const users = await loadUsers(env);
  const user = users.find((candidate) => candidate.id === payload.sub);

  if (!user) {
    throw new AppError({
      code: "AUTH_INVALID_TOKEN",
      message: "사용자를 찾을 수 없는 토큰입니다.",
      statusCode: 401,
      retryable: false
    });
  }

  return {
    user: sanitizeUser(user)
  };
}
