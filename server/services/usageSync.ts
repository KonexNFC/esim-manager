// ─── Usage Sync Service ───────────────────────────────────────────────────────
// Syncs eSIM usage from the active provider.
// Call syncAllActiveEsims() from a cron job for periodic background sync.

import { db } from '../storage';
import { orders, providerSyncLogs } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getActiveProvider } from '../providers/adapters';
import { sendLowDataAlert, sendExpiryReminder } from './notifications';

const LOW_DATA_THRESHOLD_PCT = 0.2; // alert at 20%
const EXPIRY_REMINDER_DAYS = 2;

export async function syncEsimUsage(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.providerEsimId) return;

  const provider = getActiveProvider();

  try {
    const usage = await provider.getEsimStatus(order.providerEsimId);

    await db.update(orders).set({
      esimStatus: usage.activationStatus,
      dataTotalMb: usage.dataTotalMb,
      dataUsedMb: usage.dataUsedMb,
      dataRemainingMb: usage.dataRemainingMb,
      daysRemaining: usage.daysRemaining,
      expiresAt: usage.expiresAt,
      lastSyncedAt: usage.lastSyncedAt,
    }).where(eq(orders.id, orderId));

    await db.insert(providerSyncLogs).values({
      orderId,
      syncType: 'usage',
      providerName: provider.name,
      requestSummary: `getEsimStatus ${order.providerEsimId}`,
      responseSummary: `used=${usage.dataUsedMb}MB remaining=${usage.dataRemainingMb}MB days=${usage.daysRemaining}`,
      status: 'ok',
    });

    // Lifecycle alerts
    const usagePct = usage.dataTotalMb > 0
      ? (usage.dataUsedMb / usage.dataTotalMb)
      : 0;

    if (usage.activationStatus === 'active' && usagePct >= (1 - LOW_DATA_THRESHOLD_PCT)) {
      await sendLowDataAlert(order.email, orderId, usage.dataRemainingMb);
    }

    if (usage.activationStatus === 'active' && usage.daysRemaining <= EXPIRY_REMINDER_DAYS) {
      await sendExpiryReminder(order.email, orderId, usage.daysRemaining);
    }
  } catch (err: any) {
    console.error(`[UsageSync] Failed for order ${orderId}:`, err.message);

    await db.insert(providerSyncLogs).values({
      orderId,
      syncType: 'usage',
      providerName: provider.name,
      requestSummary: `getEsimStatus ${order.providerEsimId}`,
      responseSummary: err.message,
      status: 'error',
    });
  }
}

export async function syncUserEsims(userId: string): Promise<void> {
  const userOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), isNotNull(orders.providerEsimId)));

  await Promise.allSettled(userOrders.map(o => syncEsimUsage(o.id)));
}

export async function syncAllActiveEsims(): Promise<void> {
  const activeOrders = await db
    .select()
    .from(orders)
    .where(and(isNotNull(orders.providerEsimId)));

  console.log(`[UsageSync] Syncing ${activeOrders.length} eSIMs...`);
  await Promise.allSettled(activeOrders.map(o => syncEsimUsage(o.id)));
  console.log(`[UsageSync] Done`);
}

// ─── Lifecycle helpers (for cron triggers) ────────────────────────────────────

export async function findEsimsLowOnData(thresholdPct = 0.2) {
  const all = await db.select().from(orders).where(isNotNull(orders.providerEsimId));
  return all.filter(o =>
    o.dataTotalMb && o.dataTotalMb > 0 &&
    (o.dataRemainingMb || 0) / o.dataTotalMb < thresholdPct
  );
}

export async function findEsimsExpiringSoon(days = 2) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  const all = await db.select().from(orders).where(isNotNull(orders.expiresAt));
  return all.filter(o => o.expiresAt && o.expiresAt <= cutoff && o.esimStatus === 'active');
}

export async function findExpiredEsims() {
  const now = new Date();
  const all = await db.select().from(orders).where(isNotNull(orders.expiresAt));
  return all.filter(o => o.expiresAt && o.expiresAt < now && o.esimStatus !== 'expired');
}
