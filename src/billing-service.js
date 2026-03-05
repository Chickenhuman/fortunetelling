import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors.js";

const DEFAULT_DATA_DIR = "data";
const BILLING_STORE_FILE = "billing.json";

const CREDIT_PLANS = [
  {
    id: "credit_starter",
    title: "스타터 30",
    credits: 30,
    priceKrw: 4900
  },
  {
    id: "credit_plus",
    title: "플러스 70",
    credits: 70,
    priceKrw: 9900
  },
  {
    id: "credit_pro",
    title: "프로 160",
    credits: 160,
    priceKrw: 19900
  }
];

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

function resolveBillingStorePath(env = process.env) {
  return path.join(resolveDataDir(env), BILLING_STORE_FILE);
}

function emptyStore() {
  return {
    wallets: [],
    payments: [],
    transactions: []
  };
}

function ensureStoreShape(raw) {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const wallets = Array.isArray(raw.wallets) ? raw.wallets : [];
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];

  return {
    wallets,
    payments,
    transactions
  };
}

async function loadBillingStore(env = process.env) {
  const filePath = resolveBillingStorePath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return ensureStoreShape(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return emptyStore();
    }

    throw new AppError({
      code: "BILLING_STORE_READ_FAILED",
      message: "결제 저장소를 읽을 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

async function saveBillingStore(store, env = process.env) {
  const filePath = resolveBillingStorePath(env);
  const dirPath = path.dirname(filePath);

  try {
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    throw new AppError({
      code: "BILLING_STORE_WRITE_FAILED",
      message: "결제 정보를 저장할 수 없습니다.",
      statusCode: 500,
      retryable: true,
      cause: error
    });
  }
}

function getPlanOrThrow(planId) {
  const trimmed = normalizeText(planId);
  if (!trimmed) {
    throw new AppError({
      code: "BILLING_PLAN_REQUIRED",
      message: "결제할 요금제 ID가 필요합니다.",
      statusCode: 400,
      retryable: false
    });
  }

  const plan = CREDIT_PLANS.find((candidate) => candidate.id === trimmed);
  if (!plan) {
    throw new AppError({
      code: "BILLING_PLAN_NOT_FOUND",
      message: "선택한 요금제를 찾을 수 없습니다.",
      statusCode: 404,
      retryable: false
    });
  }

  return plan;
}

function getOrCreateWallet(store, user) {
  const existing = store.wallets.find((wallet) => wallet.userId === user.id);
  if (existing) {
    return existing;
  }

  const nowIso = new Date().toISOString();
  const wallet = {
    userId: user.id,
    credits: 0,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  store.wallets.push(wallet);
  return wallet;
}

function publicPayment(payment) {
  return {
    id: payment.id,
    userId: payment.userId,
    planId: payment.planId,
    planTitle: payment.planTitle,
    status: payment.status,
    amountKrw: payment.amountKrw,
    credits: payment.credits,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt || null
  };
}

function publicTransaction(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    creditsDelta: transaction.creditsDelta,
    reason: transaction.reason,
    paymentId: transaction.paymentId || null,
    createdAt: transaction.createdAt
  };
}

export function listCreditPlans() {
  return CREDIT_PLANS.map((plan) => ({ ...plan }));
}

export async function createCheckout({ user, planId, env = process.env }) {
  const plan = getPlanOrThrow(planId);
  const store = await loadBillingStore(env);
  const nowIso = new Date().toISOString();

  const payment = {
    id: randomUUID(),
    userId: user.id,
    planId: plan.id,
    planTitle: plan.title,
    status: "created",
    amountKrw: plan.priceKrw,
    credits: plan.credits,
    createdAt: nowIso,
    paidAt: null
  };

  store.payments.push(payment);
  await saveBillingStore(store, env);

  return {
    payment: publicPayment(payment),
    checkoutToken: payment.id
  };
}

export async function confirmCheckout({ user, paymentId, env = process.env }) {
  const trimmedPaymentId = normalizeText(paymentId);
  if (!trimmedPaymentId) {
    throw new AppError({
      code: "BILLING_PAYMENT_ID_REQUIRED",
      message: "결제 ID가 필요합니다.",
      statusCode: 400,
      retryable: false
    });
  }

  const store = await loadBillingStore(env);
  const payment = store.payments.find((candidate) => candidate.id === trimmedPaymentId);

  if (!payment || payment.userId !== user.id) {
    throw new AppError({
      code: "BILLING_PAYMENT_NOT_FOUND",
      message: "결제 정보를 찾을 수 없습니다.",
      statusCode: 404,
      retryable: false
    });
  }

  if (payment.status === "paid") {
    const wallet = getOrCreateWallet(store, user);
    return {
      payment: publicPayment(payment),
      wallet: {
        credits: wallet.credits,
        updatedAt: wallet.updatedAt
      },
      alreadyPaid: true
    };
  }

  if (payment.status !== "created") {
    throw new AppError({
      code: "BILLING_PAYMENT_NOT_CONFIRMABLE",
      message: "현재 상태에서는 결제를 확정할 수 없습니다.",
      statusCode: 409,
      retryable: false
    });
  }

  const wallet = getOrCreateWallet(store, user);
  const nowIso = new Date().toISOString();

  payment.status = "paid";
  payment.paidAt = nowIso;

  wallet.credits += payment.credits;
  wallet.updatedAt = nowIso;

  const transaction = {
    id: randomUUID(),
    userId: user.id,
    type: "credit_purchase",
    creditsDelta: payment.credits,
    reason: `${payment.planTitle} 결제`,
    paymentId: payment.id,
    createdAt: nowIso
  };

  store.transactions.push(transaction);
  await saveBillingStore(store, env);

  return {
    payment: publicPayment(payment),
    wallet: {
      credits: wallet.credits,
      updatedAt: wallet.updatedAt
    },
    transaction: publicTransaction(transaction),
    alreadyPaid: false
  };
}

export async function getBillingSummary({ user, env = process.env }) {
  const store = await loadBillingStore(env);
  const wallet = getOrCreateWallet(store, user);
  const userPayments = store.payments
    .filter((payment) => payment.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map(publicPayment);

  const userTransactions = store.transactions
    .filter((transaction) => transaction.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map(publicTransaction);

  return {
    wallet: {
      credits: wallet.credits,
      updatedAt: wallet.updatedAt
    },
    payments: userPayments,
    transactions: userTransactions
  };
}
