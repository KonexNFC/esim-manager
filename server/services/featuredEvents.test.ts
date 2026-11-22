import test from "node:test";
import assert from "node:assert/strict";
import { newFeaturedEvents, upcomingEvents } from "../../shared/featured-events";

test("new events are sorted by machine dates, with Canton before the Grand Prix", () => {
  const result = upcomingEvents(newFeaturedEvents, new Date("2026-11-22"));
  assert.deepEqual(result.map(e => e.id), ["detty-december", "harbin-ice-snow", "rio-carnival", "chinese-new-year", "canton-fair", "chinese-grand-prix"]);
  assert.equal(result.find(e => e.id === "detty-december")?.href, "/nigeria-esim");
  assert.ok(result.filter(e => e.countryCode === "CN").every(e => e.href === "/destinations/CN"));
});

test("inclusive end dates override display text and carousel caps at eight", () => {
  const rio = newFeaturedEvents.filter(e => e.id === "rio-carnival");
  assert.equal(upcomingEvents(rio, new Date("2027-02-13T23:59:59Z")).length, 1);
  assert.equal(upcomingEvents(rio, new Date("2027-02-14")).length, 0);
  assert.equal(upcomingEvents(newFeaturedEvents, new Date("2027-05-06")).length, 0);
  assert.equal(upcomingEvents([...newFeaturedEvents, ...newFeaturedEvents], new Date("2026-11-22"), 8).length, 8);
});
