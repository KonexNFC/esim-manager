import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../storage';
import { runZenditReconciliationJob, startZenditReconciliationScheduler } from './fulfillment';

for (const failureStage of ['update', 'select'] as const) {
  test(`Zendit queue ${failureStage} failure is contained and the next run retries`, async (t) => {
    let fail = true;
    let updates = 0;
    let selects = 0;
    const warnings: unknown[][] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => warnings.push(args));
    t.mock.method(db, 'update', () => ({
      set: () => ({
        where: async () => {
          updates++;
          if (fail && failureStage === 'update') {
            throw new Error('private SQL params: connection timeout');
          }
        },
      }),
    }));
    t.mock.method(db, 'select', () => ({
      from: () => ({
        where: async () => {
          selects++;
          if (fail && failureStage === 'select') {
            throw new Error('private SQL params: connection terminated');
          }
          return [];
        },
      }),
    }));

    await assert.doesNotReject(runZenditReconciliationJob());
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0]), /will retry/);
    assert.doesNotMatch(String(warnings[0]), /private SQL/);
    fail = false;
    await assert.doesNotReject(runZenditReconciliationJob());
    assert.equal(updates, 2, 'running flag must reset after failure');
    assert.equal(selects, failureStage === 'update' ? 1 : 2);
    assert.equal(warnings.length, 1);
  });
}

test('both Zendit scheduler timers survive queue failures without an unhandled rejection', async (t) => {
  const callbacks: Array<() => void> = [];
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => {
    assert.equal(delay, 15_000);
    callbacks.push(callback);
    return {} as NodeJS.Timeout;
  });
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    assert.equal(delay, 60_000);
    callbacks.push(callback);
    return {} as NodeJS.Timeout;
  });
  let calls = 0;
  t.mock.method(db, 'update', () => ({
    set: () => ({
      where: async () => {
        calls++;
        throw new Error('connection timeout');
      },
    }),
  }));
  t.mock.method(console, 'warn', () => {});
  startZenditReconciliationScheduler();
  assert.equal(callbacks.length, 2);
  for (const callback of callbacks) {
    callback();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(calls, 2);
  // node:test also fails this test if either timer leaks an unhandled rejection.
});
