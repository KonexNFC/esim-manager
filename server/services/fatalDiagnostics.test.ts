import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fatalSummary } from "./fatalDiagnostics";

test("fatal diagnostics keep locations but exclude SQL and error payloads", () => {
  const err = new Error("SELECT private_customer_data");
  err.stack = "Error: SECRET\n    at query (/app/server/storage.ts:10:20)\nparams: PRIVATE";
  const record = JSON.stringify(fatalSummary(err, "unhandledRejection"));
  assert.match(record, /storage.ts:10:20/);
  assert.doesNotMatch(record, /SECRET|PRIVATE|SELECT/);
});

test("fatal monitor records errors without preventing nonzero process exit", () => {
  const child = spawnSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "-e",
    "import './server/services/fatalDiagnostics.ts'; Promise.reject(new Error('synthetic failure'));",
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /\[fatal\]/);
  assert.match(child.stderr, /unhandledRejection/);
});
