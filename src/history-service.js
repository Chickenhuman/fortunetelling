import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";

const DEFAULT_DATA_DIR = "data";
const HISTORY_STORE_FILE = "histories.json";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveDataDir(env = process.env) {
  const configured = normalizeText(env.DATA_DIR);
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), DEFAULT_DATA_DIR);
}

function resolveHistoryStorePath(env = process.env) {
  return path.join(resolveDataDir(env), HISTORY_STORE_FILE);
}

async function loadHistories(env = process.env) {
  const filePath = resolveHistoryStorePath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed?.histories)) {
      return parsed.histories;
    }

    throw new AppError({
      code: "HISTORY_STORE_INVALID",
      message: "히스토리 저장소 형식이 올바르지 않습니다.",
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
      code: "HISTORY_STORE_READ_FAILED",
      message: "히스토리 저장소를 읽을 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

async function saveHistories(histories, env = process.env) {
  const filePath = resolveHistoryStorePath(env);
  const dirPath = path.dirname(filePath);

  try {
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, JSON.stringify({ histories }, null, 2), "utf8");
  } catch (error) {
    throw new AppError({
      code: "HISTORY_STORE_WRITE_FAILED",
      message: "히스토리 정보를 저장할 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

function createHistorySummary(history) {
  return {
    id: history.id,
    userId: history.userId,
    createdAt: history.createdAt,
    type: history.type,
    profile: {
      name: history.profile.name,
      gender: history.profile.gender,
      birthDate: history.profile.birthDate,
      calendarType: history.profile.calendarType,
      birthTimeUnknown: history.profile.birthTimeUnknown,
      birthTime: history.profile.birthTime
    },
    report: {
      title: history.analysis.report.title,
      headline: history.analysis.report.headline
    }
  };
}

function createHistoryDetail(history) {
  return {
    id: history.id,
    userId: history.userId,
    createdAt: history.createdAt,
    type: history.type,
    profile: history.profile,
    analysis: history.analysis
  };
}

export async function createHistory({
  user,
  profile,
  type,
  analysis,
  env = process.env
}) {
  const histories = await loadHistories(env);
  const nowIso = new Date().toISOString();

  const history = {
    id: randomUUID(),
    userId: user.id,
    createdAt: nowIso,
    type,
    profile,
    analysis
  };

  histories.push(history);
  await saveHistories(histories, env);

  return createHistoryDetail(history);
}

export async function listHistoriesByUser({ user, limit = 20, env = process.env }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const histories = await loadHistories(env);

  const userHistories = histories
    .filter((history) => history.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, safeLimit)
    .map(createHistorySummary);

  return {
    items: userHistories,
    total: userHistories.length
  };
}

export async function getHistoryById({ user, historyId, env = process.env }) {
  const trimmedId = normalizeText(historyId);
  if (!trimmedId) {
    throw new AppError({
      code: "HISTORY_ID_REQUIRED",
      message: "히스토리 ID가 필요합니다.",
      statusCode: 400,
      retryable: false
    });
  }

  const histories = await loadHistories(env);
  const history = histories.find((candidate) => candidate.id === trimmedId);

  if (!history || history.userId !== user.id) {
    throw new AppError({
      code: "HISTORY_NOT_FOUND",
      message: "히스토리 정보를 찾을 수 없습니다.",
      statusCode: 404,
      retryable: false
    });
  }

  return createHistoryDetail(history);
}
