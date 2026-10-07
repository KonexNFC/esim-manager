import assert from "node:assert/strict";
import test from "node:test";
import { withProviderSyncLock } from "./providerSync";

test("provider sync lock is released after a failed run", async () => {
  await assert.rejects(
    withProviderSyncLock("manual", async () => {
      throw new Error("simulated sync failure");
    }),
    /simulated sync failure/,
  );

  let recovered = false;
  const result = await withProviderSyncLock("auto", async () => {
    recovered = true;
    return "recovered";
  });

  assert.equal(recovered, true);
  assert.equal(result, "recovered");
});

test("provider sync lock suppresses overlapping auto runs and recovers afterward", async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });

  const running = withProviderSyncLock("auto", async () => {
    await held;
    return "first";
  });

  // Let the first task acquire the lock before checking the overlap guard.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await withProviderSyncLock("auto", async () => "overlap"), null);

  release();
  assert.equal(await running, "first");
  assert.equal(
    await withProviderSyncLock("auto", async () => "after-recovery"),
    "after-recovery",
  );
});