import { and, eq, isNull, lte } from 'drizzle-orm';
import { esimReadyNotifications } from '@shared/schema';
import { db } from '../storage';
import { sendEsimReadyEmail, type EsimReadyData } from './notifications';

export function notificationRetryDelay(attempt: number): number {
  return Math.min(60_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 10), 3_600_000);
}

/**
 * Keep the row lock until acceptance is recorded, so overlapping instances
 * cannot deliver the same notification. A process exit rolls back and releases
 * the lock automatically; there is no stale "processing" flag to repair.
 *
 * Delivery is at-least-once: a provider acceptance followed by a lost DB commit
 * is ambiguous. SendGrid has no idempotent send API; never mark sent before send.
 * Transport calls have bounded timeouts so an outage cannot hold the lock forever.
 */
export async function deliverNextEsimNotification(
  database: Pick<typeof db, 'transaction'> = db,
  send: (payload: EsimReadyData) => Promise<void> = sendEsimReadyEmail,
  now = new Date(),
): Promise<boolean> {
  return database.transaction(async tx => {
    const [notification] = await tx.select().from(esimReadyNotifications)
      .where(and(isNull(esimReadyNotifications.sentAt), lte(esimReadyNotifications.nextAttemptAt, now)))
      .orderBy(esimReadyNotifications.nextAttemptAt)
      .limit(1).for('update', { skipLocked: true });
    if (!notification) return false;

    const attempts = notification.attempts + 1;
    let accepted = false;
    try {
      await send(notification.payload);
      accepted = true;
    } catch {
      // Never log email bodies, QR credentials, or provider responses here.
      console.warn('[eSIM email] Delivery failed; notification retained for retry');
    }
    await tx.update(esimReadyNotifications).set({
      attempts,
      ...(accepted
        ? { sentAt: new Date() }
        : { nextAttemptAt: new Date(now.getTime() + notificationRetryDelay(attempts)) }),
    }).where(eq(esimReadyNotifications.orderId, notification.orderId));
    return true;
  });
}

let running = false;
export async function runEsimNotificationJob(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Bound each sweep; SKIP LOCKED also allows multiple application instances.
    for (let i = 0; i < 20; i++) {
      if (!await deliverNextEsimNotification()) break;
    }
  } catch {
    console.warn('[eSIM email] Queue unavailable; will retry on the next sweep');
  } finally {
    running = false;
  }
}

let started = false;
export function startEsimNotificationScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => { void runEsimNotificationJob(); }, 5_000).unref();
  setInterval(() => { void runEsimNotificationJob(); }, 30_000).unref();
}
