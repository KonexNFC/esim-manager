// ─── Provider Wallet Monitoring ──────────────────────────────────────────────
// Polls safe, read-only supplier endpoints. It never creates eSIM orders.

import { eq } from "drizzle-orm";
import { db } from "../storage";
import { providers, type Provider } from "@shared/schema";
import { esimgo } from "../providers/esimgo";
import { esimAccess } from "../providers/esimAccess";
import { zendit } from "../providers/zendit";
import { airalo } from "../providers/airalo";
import { sendProviderWalletLowBalanceAlert } from "./notifications";

export type WalletStatus = "ok" | "low" | "error" | "not_supported" | "not_configured";

export interface ProviderWalletSnapshot {
  status: WalletStatus;
  amount: number | null;
  currency: string | null;
  threshold: number | null;
  checkedAt: string;
  error?: string;
  lastAlertAt?: string;
}

type ProviderMetadata = Record<string, unknown> & { wallet?: ProviderWalletSnapshot };
export interface ProviderBalanceCheckResult {
  providerKey: string;
  status: WalletStatus;
  amount: number | null;
  currency: string | null;
  threshold: number | null;
  error?: string;
}

const DEFAULT_THRESHOLDS: Record<string, number> = { USD: 25, GBP: 20 };
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
let schedulerStarted = false;
let balanceCheckInFlight: Promise<ProviderBalanceCheckResult[]> | null = null;

export function getProviderBalanceThreshold(currency: string): number {
  const normalized = currency.toUpperCase();
  const configured = Number(process.env[`PROVIDER_LOW_BALANCE_${normalized}`]);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : (DEFAULT_THRESHOLDS[normalized] ?? 25);
}

function asMetadata(value: unknown): ProviderMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function isProviderWalletAlertDue(previous: ProviderWalletSnapshot | undefined, now: Date): boolean {
  if (previous?.status !== "low" || !previous.lastAlertAt) return true;
  const lastAlertAt = new Date(previous.lastAlertAt).getTime();
  return !Number.isFinite(lastAlertAt) || now.getTime() - lastAlertAt >= ALERT_COOLDOWN_MS;
}

async function readProviderBalance(key: string): Promise<
  | { kind: "balance"; amount: number; currency: string }
  | { kind: "not_supported" }
  | { kind: "not_configured" }
> {
  switch (key.toLowerCase()) {
    case "esimgo":
      if (!esimgo.isConfigured()) return { kind: "not_configured" };
      return { kind: "balance", ...(await esimgo.getWalletBalance()) };
    case "esimaccess":
      if (!esimAccess.isConfigured()) return { kind: "not_configured" };
      return { kind: "balance", ...(await esimAccess.getWalletBalance()) };
    case "zendit":
      if (!zendit.isConfigured()) return { kind: "not_configured" };
      return { kind: "balance", ...(await zendit.getWalletBalance()) };
    case "airalo":
      if (!airalo.isConfigured()) return { kind: "not_configured" };
      await airalo.checkConnection();
      return { kind: "not_supported" };
    default:
      return { kind: "not_supported" };
  }
}

type ProviderBalanceRead = Awaited<ReturnType<typeof readProviderBalance>>;

async function checkProviderBalance(
  provider: Provider,
  sendAlerts: boolean,
  readBalance: () => Promise<ProviderBalanceRead>,
): Promise<ProviderBalanceCheckResult> {
  const now = new Date();
  const metadata = asMetadata(provider.metadata);
  const previous = metadata.wallet;
  let snapshot: ProviderWalletSnapshot;

  try {
    const balance = await readBalance();
    if (balance.kind === "balance") {
      const threshold = getProviderBalanceThreshold(balance.currency);
      const status: WalletStatus = balance.amount <= threshold ? "low" : "ok";
      const amount = Number(balance.amount.toFixed(2));
      const currency = balance.currency.toUpperCase();
      snapshot = {
        status,
        amount,
        currency,
        threshold,
        checkedAt: now.toISOString(),
      };
      if (status === "low") {
        if (isProviderWalletAlertDue(previous, now)) {
          if (sendAlerts) {
            try {
              await sendProviderWalletLowBalanceAlert({
                providerName: provider.name,
                balance: amount,
                currency,
                threshold,
              });
              snapshot.lastAlertAt = now.toISOString();
            } catch (alertError: any) {
              // Keep the low status and retry on the next interval if delivery fails.
              snapshot.error = `Alert delivery failed: ${String(alertError?.message ?? alertError).slice(0, 200)}`;
              console.error(`[Provider balance] Low-balance alert for ${provider.name} failed:`, alertError.message);
            }
          } else {
            console.warn(`[Provider balance] ${provider.name} is low: ${currency} ${amount.toFixed(2)}`);
            snapshot.lastAlertAt = now.toISOString();
          }
        } else if (previous?.lastAlertAt) {
          snapshot.lastAlertAt = previous.lastAlertAt;
        }
      }
    } else {
      snapshot = {
        status: balance.kind,
        amount: null,
        currency: null,
        threshold: null,
        checkedAt: now.toISOString(),
      };
    }
  } catch (error: any) {
    snapshot = {
      status: "error",
      amount: null,
      currency: null,
      threshold: null,
      checkedAt: now.toISOString(),
      error: String(error?.message ?? error).slice(0, 300),
    };
  }

  await db
    .update(providers)
    .set({ metadata: { ...metadata, wallet: snapshot }, updatedAt: now })
    .where(eq(providers.key, provider.key));

  return {
    providerKey: provider.key,
    status: snapshot.status,
    amount: snapshot.amount,
    currency: snapshot.currency,
    threshold: snapshot.threshold,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  };
}

/**
 * Check every registered provider once. Concurrent callers share the same run so
 * a manual admin refresh cannot overlap the periodic job.
 */
export async function checkAllProviderBalances(options: { sendAlerts?: boolean } = {}): Promise<ProviderBalanceCheckResult[]> {
  if (balanceCheckInFlight) return balanceCheckInFlight;
  const sendAlerts = options.sendAlerts ?? process.env.NODE_ENV === "production";
  balanceCheckInFlight = (async () => {
    const rows = await db.select().from(providers);
    // Some early seed paths used different letter casing for eSIM Access.
    // Keep both legacy rows visible, but make just one supplier API call.
    const cachedReads = new Map<string, Promise<ProviderBalanceRead>>();
    const readOnce = (key: string) => {
      const canonicalKey = key.toLowerCase();
      const existing = cachedReads.get(canonicalKey);
      if (existing) return existing;
      const read = readProviderBalance(key);
      cachedReads.set(canonicalKey, read);
      return read;
    };
    const results: ProviderBalanceCheckResult[] = [];
    for (const provider of rows) {
      results.push(await checkProviderBalance(provider, sendAlerts, () => readOnce(provider.key)));
    }
    return results;
  })().finally(() => {
    balanceCheckInFlight = null;
  });
  return balanceCheckInFlight;
}

/** Start periodic balance monitoring after the server has completed booting. */
export function startProviderBalanceScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const intervalMs = 15 * 60 * 1000;
  const run = async (source: "initial" | "scheduled") => {
    try {
      const results = await checkAllProviderBalances();
      const low = results.filter(result => result.status === "low").map(result => result.providerKey);
      console.log(`[Provider balance] ${source} check complete (${results.length} providers${low.length ? `; low: ${low.join(", ")}` : ""})`);
    } catch (error: any) {
      console.error(`[Provider balance] ${source} check failed:`, error.message);
    }
  };

  setTimeout(() => void run("initial"), 10_000);
  setInterval(() => void run("scheduled"), intervalMs);
  console.log("[Provider balance] Scheduler registered (first run in 10s, then every 15min)");
}