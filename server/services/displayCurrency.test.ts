import assert from "node:assert/strict";
import test from "node:test";
import { readDisplayCurrency, resolveCurrency, formatDisplay, formatCharge } from "../../client/src/lib/currency";

test("USD is default for new visitors, invalid preferences and inaccessible storage", () => {
  for (const value of [null, "", "INVALID"]) {
    assert.equal(readDisplayCurrency(() => value), "USD");
  }
  assert.equal(readDisplayCurrency(() => { throw new Error("blocked"); }), "USD");
});

test("valid stored choices are respected", () => {
  for (const code of ["USD", "GBP", "EUR", "NGN", "JPY"]) {
    assert.equal(readDisplayCurrency(() => code), code);
    assert.equal(resolveCurrency(code).code, code);
  }
});

test("USD quotes convert only for display with an approximation indicator", () => {
  assert.equal(formatDisplay(10, "GBP"), "≈ £7.90");
  assert.equal(formatDisplay(10, "USD"), "US$10.00");
  assert.equal(formatDisplay(10, "EUR"), "≈ €9.30");
  assert.equal(formatDisplay(10, "NGN"), "≈ ₦16,200");
  assert.equal(formatDisplay(10, "JPY"), "≈ ¥1,520");
  assert.equal(formatCharge(10, "USD"), "US$10.00");
  assert.equal(formatDisplay(32.27, "USD"), formatCharge(32.27, "USD"));
});

test("native GBP marketing prices are exact only in GBP, not double-converted", () => {
  assert.equal(formatDisplay(19.99, "GBP", "GBP"), "£19.99");
  assert.equal(formatDisplay(7.9, "USD", "GBP"), "≈ US$10.00");
});

test("per-day and better-value amounts use the same display conversion", () => {
  assert.equal(formatDisplay(20 / 5, "GBP"), "≈ £3.16");
  assert.equal(formatDisplay(15, "GBP"), "≈ £11.85");
  assert.equal(formatDisplay(15, "EUR"), "≈ €13.95");
});

test("unknown source currencies are disclosed without inventing conversion rates", () => {
  assert.match(formatDisplay(10, "GBP", "CHF"), /CHF\s+10\.00/);
});
