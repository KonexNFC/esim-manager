// ─── Usage Sync Service ───────────────────────────────────────────────────────
// Syncs eSIM usage from the active provider.
// Call syncAllActiveEsims() from a cron job for periodic background sync.

import { db } from '../storage';
import { orders, esims, providerSyncLogs } from '@shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { getActiveProvider } from '../providers/adapters';
import { sendLowDataAlert, sendExpiryReminder } from './notifications';

const LOW_DATA_THRESHOLD_PCT = 0.2;
const EXPIRY_REMINDER_DAYS = 2;

export async function syncEsimUsage(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order?.providerEsimId) return;

  const provider = getActiveProvider();

  try {
    const sync = await provider.syncEsim(order.providerEsimId);

    // Update orders table
    await db.update(orders).set({
      esimStatus: sync.activationStatus,
      dataTotalMb: sync.dataTotalMb,
      dataUsedMb: sync.dataUsedMb,
      dataRemainingMb: sync.dataRemainingMb,
      daysRemaining: sync.daysRemaining,
      expiresAt: sync.expiresAt,
      lastSyncedAt: sync.lastSyncedAt,
    }).where(eq(orders.id, orderId));

    // Also update esims table if record exists
    const [esimRecord] = await db.select().from(esims).where(eq(esims.orderId, orderId));
    if (esimRecord) {
      await db.update(esims).set({
        activationStatus: sync.activationStatus,
        dataTotalMb: sync.dataTotalMb,
        dataUsedMb: sync.dataUsedMb,
        dataRemainingMb: sync.dataRemainingMb,
        daysRemaining: sync.daysRemaining,
        expiresAt: sync.expiresAt,
        lastSyncedAt: sync.lastSyncedAt,
        ...(sync.qrCodeUrl ? { qrCodeUrl: sync.qrCodeUrl } : {}),
        ...(sync.manualCode ? { manualCode: sync.manualCode } : {}),
      }).where(eq(esims.id, esimRecord.id));
    }

    await db.insert(providerSyncLogs).values({
      orderId,
      esimId: esimRecord?.id ?? undefined,
      syncType: 'usage',
      providerName: provider.name,
      requestSummary: `syncEsim ${order.providerEsimId}`,
      responseSummary: `status=${sync.activationStatus} used=${sync.dataUsedMb}MB remaining=${sync.dataRemainingMb}MB days=${sync.daysRemaining}`,
      status: 'ok',
    });

    // Lifecycle alerts
    const usagePct = sync.dataTotalMb > 0 ? (sync.dataUsedMb / sync.dataTotalMb) : 0;

    if (sync.activationStatus === 'active' && usagePct >= (1 - LOW_DATA_THRESHOLD_PCT)) {
      await sendLowDataAlert(order.email, orderId, sync.dataRemainingMb);
    }
    if (sync.activationStatus === 'active' && sync.daysRemaining <= EXPIRY_REMINDER_DAYS) {
      await sendExpiryReminder(order.email, orderId, sync.daysRemaining);
    }
  } catch (err: any) {
    console.error(`[UsageSync] Failed for order ${orderId}:`, err.message);
    await db.insert(providerSyncLogs).values({
      orderId,
      syncType: 'usage',
      providerName: provider.name,
      requestSummary: `syncEsim ${order.providerEsimId}`,
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
    .where(isNotNull(orders.providerEsimId));

  console.log(`[UsageSync] Syncing ${activeOrders.length} eSIMs...`);
  await Promise.allSettled(activeOrders.map(o => syncEsimUsage(o.id)));
  console.log(`[UsageSync] Done`);
}

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

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
