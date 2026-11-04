import assert from "node:assert/strict";
import test from "node:test";
import { qrImageUrl } from "../../shared/qrImage";

test("email and dashboard preserve signed Airalo URLs byte for byte", () => {
  const source = "https://www.airalo.com/qr?expires=1900000000&id=example&signature=example%2Bsignature";
  for (const size of [400, 512]) assert.equal(qrImageUrl(source, size), source);
});

test("unknown suppliers and non-URL images are never rewritten", () => {
  for (const source of ["https://supplier.example/qr?token=a%2Fb", "data:image/png;base64,abc", "/qr/image.png"]) {
    assert.equal(qrImageUrl(source, 400), source);
  }
});

test("known QR renderer can resize without changing the activation payload", () => {
  const source = "https://api.qrserver.com/v1/create-qr-code/?data=LPA%3A1%24example%24code&size=300x300";
  const url = new URL(qrImageUrl(source, 512));
  assert.equal(url.searchParams.get("data"), "LPA:1$example$code");
  assert.equal(url.searchParams.get("size"), "512x512");
  assert.equal(url.searchParams.get("margin"), "1");
});

test("renderer URLs with unknown signing parameters are preserved", () => {
  const source = "https://api.qrserver.com/v1/create-qr-code/?data=example&signature=example";
  assert.equal(qrImageUrl(source, 400), source);
});
