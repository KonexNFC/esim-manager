import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../storage';
import { orders, esims, esimReadyNotifications } from '@shared/schema';
import { completeInitialFulfillment, markPurchasePending, fulfillWithFallbackChain } from './fulfillment';
import { deliverNextEsimNotification, notificationRetryDelay, runEsimNotificationJob } from './esimNotificationOutbox';
import { sendEsimReadyEmail } from './notifications';

const payload = {
  email: 'outbox-test@example.invalid', orderId: 'outbox-test',
  qrCodeUrl: 'https://supplier.invalid/qr?signature=a%2Fb',
  iccid: 'test-iccid', destination: 'Test',
};

test('notification retry delay grows and stays capped at one hour', () => {
  assert.equal(notificationRetryDelay(1), 60_000);
  assert.equal(notificationRetryDelay(2), 120_000);
  assert.equal(notificationRetryDelay(100), 3_600_000);
});

test('both mail providers failing rejects instead of treating console output as delivery', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await assert.rejects(sendEsimReadyEmail(payload), /not accepted/);
});

test('SendGrid failure followed by Resend acceptance is successful', async t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'test-placeholder';
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  });
  let sent = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('SendGrid unavailable');
    sent++;
    return new Response('{}', { status: 200 });
  });
  await sendEsimReadyEmail(payload);
  assert.equal(sent, 1);
});

test('queue failures are contained and the running flag resets', async t => {
  let calls = 0;
  t.mock.method(console, 'warn', () => {});
  t.mock.method(db, 'transaction', async () => { calls++; throw new Error('database offline'); });
  await runEsimNotificationJob();
  await runEsimNotificationJob();
  assert.equal(calls, 2);
});

// Opt-in real PostgreSQL coverage; creates only an isolated test schema, never
// sends mail or purchases an eSIM. Run: ESIM_OUTBOX_DB_TEST=1 npm test
test('transactional fulfillment and restart-safe notification delivery', {
  skip: process.env.ESIM_OUTBOX_DB_TEST !== '1',
}, async t => {
  const schema = `outbox_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  const isolated = drizzle(pool);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  t.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  for (const name of ['orders', 'esims']) {
    await admin.query(`CREATE TABLE "${schema}"."${name}" (LIKE public."${name}" INCLUDING ALL)`);
  }
  // This isolated fixture also works before the separate email-outbox migration.
  await pool.query(`CREATE TABLE esim_ready_notifications (
    order_id varchar PRIMARY KEY REFERENCES orders(id), payload jsonb NOT NULL,
    attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamp NOT NULL DEFAULT now(),
    sent_at timestamp, created_at timestamp NOT NULL DEFAULT now()
  )`);
  const [order] = await isolated.insert(orders).values({
    id: payload.orderId, email: payload.email, totalPrice: 10, status: 'fulfilling',
  }).returning();
  const plan = {
    countryCode: 'GB', dataAmountGb: 1, validityDays: 7, providerRef: 'test',
    name: 'Test plan', destination: 'Test', region: 'Test', dataAmount: '1 GB', validity: '7 Days',
  };
  const result = {
    providerEsimId: 'test-esim', qrCodeUrl: payload.qrCodeUrl, iccid: payload.iccid,
    activationStatus: 'issued' as const, dataTotalMb: 1024, dataUsedMb: 0, dataRemainingMb: 1024,
  };
  const complete = () => completeInitialFulfillment(order, null, plan, result, 'Test', 'test');

  t.mock.method(db, 'update', (table: any) => isolated.update(table));
  // Exercise the real executor's pre-call transition before completing the
  // returned purchase result. No supplier or email network calls are made.
  let purchases = 0;
  const issued = await fulfillWithFallbackChain(
    order.id, order, [{ r: 1, k: 'test', c: 'test', w: 5 }],
    { countryCode: 'GB', dataAmountGb: 1, validityDays: 7, customerEmail: payload.email },
    { email: payload.email }, 'GB', null, {
      assertOffer: async () => {},
      eligibility: async () => ({ eligible: true }) as any,
      adapter: () => ({
        name: 'test',
        purchaseEsim: async () => {
          assert.equal((await isolated.select().from(orders))[0].status, 'fulfillment_pending');
          purchases++;
          return result;
        },
      }) as any,
      log: async () => {},
      record: async () => {},
      pause: async () => {},
      beforePurchase: markPurchasePending,
      afterRejection: async () => assert.fail('successful purchase must not be rejected'),
    },
  );
  assert.deepEqual(issued.result, result);
  assert.equal(purchases, 1);
  assert.equal((await isolated.select().from(orders))[0].status, 'fulfillment_pending');
  // Model a restart after the supplier accepts but before credentials are saved:
  // neither startup's "fulfilling" scan nor the paid-order claim can repurchase.
  const restartPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`,
  });
  const restartDb = drizzle(restartPool);
  assert.equal((await restartDb.select().from(orders).where(eq(orders.status, 'fulfilling'))).length, 0);
  assert.equal((await restartDb.update(orders).set({ status: 'fulfilling' })
    .where(inArray(orders.status, ['paid', 'fulfillment_failed'])).returning()).length, 0);
  await restartPool.end();
  await assert.rejects(markPurchasePending(order.id, 'test'), /claim is no longer held/);

  // Kill the caller immediately after COMMIT: no post-commit code or mail runs.
  t.mock.method(db, 'transaction', async (callback: any) => {
    const value = await isolated.transaction(callback);
    if (value) throw new Error('simulated process exit after fulfillment commit');
    return value;
  });
  await assert.rejects(complete(), /simulated process exit/);
  assert.equal((await isolated.select().from(orders))[0].status, 'fulfilled');
  assert.equal((await isolated.select().from(esims)).length, 1);
  const [queued] = await isolated.select().from(esimReadyNotifications);
  assert.equal(queued.payload.qrCodeUrl, payload.qrCodeUrl);
  assert.equal(queued.sentAt, null);

  // Repeated fulfillment cannot insert another eSIM or another queue item.
  await complete();
  assert.equal((await isolated.select().from(esims)).length, 1);
  assert.equal((await isolated.select().from(esimReadyNotifications)).length, 1);

  const now = new Date(Date.now() + 1_000);
  await deliverNextEsimNotification(isolated, async () => { throw new Error('mail outage'); }, now);
  const [failed] = await isolated.select().from(esimReadyNotifications);
  assert.equal(failed.attempts, 1);
  assert.equal(failed.sentAt, null);
  assert.equal(failed.nextAttemptAt.getTime(), now.getTime() + 60_000);
  assert.equal(await deliverNextEsimNotification(isolated, async () => assert.fail('too soon'), now), false);

  // A new DB pool models a restarted worker. Multiple instances cannot send
  // concurrently: the second skips the first worker's locked notification.
  const restartedPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
  t.after(() => restartedPool.end());
  const restarted = drizzle(restartedPool);
  let release!: () => void;
  let entered!: () => void;
  const sending = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  let delivered = 0;
  const worker = deliverNextEsimNotification(restarted, async data => {
    assert.deepEqual(data, queued.payload);
    delivered++;
    entered();
    await finish;
  }, failed.nextAttemptAt);
  await sending;
  try {
    assert.equal(await deliverNextEsimNotification(isolated, async () => assert.fail('duplicate send'), failed.nextAttemptAt), false);
  } finally {
    release();
    await worker;
  }
  assert.equal(delivered, 1);
  assert.ok((await isolated.select().from(esimReadyNotifications))[0].sentAt);
  assert.equal(await deliverNextEsimNotification(restarted, async () => assert.fail('already sent'), new Date(Date.now() + 86_400_000)), false);

  // Failure while inserting the eSIM must also roll back the order and outbox.
  const [second] = await isolated.insert(orders).values({
    id: 'rollback-test', email: payload.email, totalPrice: 10, status: 'reconciling',
  }).returning();
  await pool.query(`ALTER TABLE esims ADD CONSTRAINT reject_test_order CHECK (order_id <> 'rollback-test')`);
  await assert.rejects(completeInitialFulfillment(second, null, plan, result, 'Test', 'test'));
  assert.equal((await isolated.select().from(orders).where(eq(orders.id, second.id)))[0].status, 'reconciling');
  assert.equal((await isolated.select().from(esimReadyNotifications).where(eq(esimReadyNotifications.orderId, second.id))).length, 0);
});
