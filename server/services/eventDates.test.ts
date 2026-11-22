import test from "node:test";
import assert from "node:assert/strict";
import { eventEndTimestamp, eventHasNotEnded } from "../../shared/event-dates";

test("homepage date formats resolve to inclusive calendar end dates", () => {
  for (const [label, expected] of [
    ["Aug 30 – 31, 2026", "2026-08-31"],
    ["Sep 19 – Oct 4, 2026", "2026-10-04"],
    ["October 2026", "2026-10-31"],
    ["Oct 15 – Nov 4, 2026", "2026-11-04"],
    ["December 2026", "2026-12-31"],
    ["Dec 2026 – Jan 2027", "2027-01-31"],
    ["February 2028", "2028-02-29"],
  ]) {
    assert.equal(new Date(eventEndTimestamp(label)!).toISOString(), `${expected}T23:59:59.999Z`);
  }
});

test("22 November leaves only December and December–January events", () => {
  const labels = ["Aug 30 – 31, 2026", "Sep 19 – Oct 4, 2026", "October 2026", "Oct 15 – Nov 4, 2026", "December 2026", "Dec 2026 – Jan 2027"];
  assert.deepEqual(labels.filter(label => eventHasNotEnded(label, new Date("2026-11-22T12:00:00Z"))), labels.slice(4));
  assert.deepEqual(labels.filter(label => eventHasNotEnded(label, new Date("2027-02-01T00:00:00Z"))), []);
});

test("end dates expire only after their last millisecond; malformed dates stay hidden", () => {
  assert.equal(eventHasNotEnded("December 2026", new Date("2026-12-31T23:59:59.999Z")), true);
  assert.equal(eventHasNotEnded("December 2026", new Date("2027-01-01T00:00:00Z")), false);
  for (const invalid of ["", "Soon", "February 30, 2026", "Banana 2026"]) {
    assert.equal(eventEndTimestamp(invalid), null);
    assert.equal(eventHasNotEnded(invalid), false);
  }
});
