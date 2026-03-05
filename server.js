import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateAnalyzePayload } from "./src/validation.js";
import { analyzeFortune } from "./src/fortune-service.js";
import { AppError, isAppError } from "./src/errors.js";
import { signup, login, getMe } from "./src/auth-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const INDEX_FILE = path.join(__dirname, "index");

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, { statusCode, code, message, retryable }) {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      retryable
    }
  });
}

async function readJsonBody(req) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > 1024 * 1024) {
      throw new AppError({
        code: "REQUEST_BODY_TOO_LARGE",
        message: "요청 본문이 너무 큽니다.",
        statusCode: 413
      });
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new AppError({
      code: "EMPTY_REQUEST_BODY",
      message: "요청 본문이 비어 있습니다.",
      statusCode: 400
    });
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError({
      code: "INVALID_JSON",
      message: "JSON 형식이 올바르지 않습니다.",
      statusCode: 400
    });
  }
}

function toAppError(error) {
  if (isAppError(error)) {
    return error;
  }

  return new AppError({
    code: "INTERNAL_SERVER_ERROR",
    message: "서버 오류가 발생했습니다.",
    statusCode: 500,
    retryable: true,
    cause: error
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index")) {
      const html = await readFile(INDEX_FILE, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(html);
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const body = await readJsonBody(req);
      let validated = null;

      try {
        validated = validateAnalyzePayload(body);
      } catch (error) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "요청 값이 올바르지 않습니다.",
          statusCode: 400,
          retryable: false,
          cause: error
        });
      }

      const analysis = await analyzeFortune(validated);

      sendJson(res, 200, {
        ok: true,
        data: analysis
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await readJsonBody(req);
      const result = await signup(body);

      sendJson(res, 201, {
        ok: true,
        data: result
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const result = await login(body);

      sendJson(res, 200, {
        ok: true,
        data: result
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const result = await getMe(req.headers.authorization);

      sendJson(res, 200, {
        ok: true,
        data: result
      });
      return;
    }

    sendError(res, {
      code: "NOT_FOUND",
      message: "요청한 경로를 찾을 수 없습니다.",
      retryable: false,
      statusCode: 404
    });
  } catch (error) {
    const appError = toAppError(error);
    const causeMessage =
      appError.cause instanceof Error ? ` | cause: ${appError.cause.message}` : "";

    // 개인정보 저장 금지 정책: 요청 원문은 로그로 남기지 않는다.
    console.error(
      `[${new Date().toISOString()}] API error: ${appError.code} ${appError.message}${causeMessage}`
    );

    sendError(res, {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      statusCode: appError.statusCode
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
