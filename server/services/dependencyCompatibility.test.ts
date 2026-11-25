import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertUserSchema, insertPlanSchema } from "../../shared/schema";
import { serviceTermsSchema } from "../../shared/serviceEquivalence";

test("upgraded Drizzle/Zod schemas still validate inserts and strip generated fields", () => {
  const user = insertUserSchema.parse({
    id: "not-client-controlled",
    name: "Test",
    email: "test@example.test",
    createdAt: new Date(),
  });
  assert.deepEqual(user, { name: "Test", email: "test@example.test" });
  assert.equal(insertUserSchema.safeParse({ name: 42 }).success, false);
  assert.equal(insertPlanSchema.safeParse({ name: "Incomplete plan" }).success, false);
});

test("Zod 4 form resolver returns field errors and successful values", async () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  }).refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match",
  });
  const resolver = zodResolver(schema);
  const options = { fields: {}, shouldUseNativeValidation: false } as const;
  const invalid = await resolver({
    email: "invalid", password: "long-enough", confirmPassword: "different",
  }, {}, options);
  assert.equal(invalid.errors.email?.type, "invalid_format");
  assert.equal(invalid.errors.confirmPassword?.message, "Passwords must match");
  assert.deepEqual(invalid.values, {});

  const values = {
    email: "test@example.test", password: "long-enough", confirmPassword: "long-enough",
  };
  const valid = await resolver(values, {}, options);
  assert.deepEqual(valid.errors, {});
  assert.deepEqual(valid.values, values);
});

test("supplier terms retain strict validation and cross-field refinements after Zod upgrade", () => {
  const terms = {
    coverage: ["US"],
    allowance: { kind: "total", megabytes: 1024 },
    validityHours: 24,
    throttling: { thresholdMb: null, speedKbps: null, reset: "none" },
    activation: {
      startsOn: "first_connection", activationWindowHours: 720,
      topup: false, tethering: true,
    },
  };
  assert.equal(serviceTermsSchema.safeParse(terms).success, true);
  assert.equal(serviceTermsSchema.safeParse({ ...terms, extra: true }).success, false);
  assert.equal(serviceTermsSchema.safeParse({
    ...terms, allowance: { kind: "unlimited", megabytes: 1024 },
  }).success, false);
});

test("Express/body-parser preserve raw webhook bytes and parse JSON and URL-encoded forms", async () => {
  const app = express();
  app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
    assert.ok(Buffer.isBuffer(req.body));
    res.send(req.body);
  });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.post("/echo", (req, res) => { res.json(req.body); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const payload = '{ "type": "checkout.session.completed", "data": {} }\n';
    const raw = await fetch(`${base}/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
    });
    assert.equal(raw.status, 200);
    assert.equal(await raw.text(), payload);
    const json = await fetch(`${base}/echo`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: '{"planId":"test-plan"}',
    });
    assert.deepEqual(await json.json(), { planId: "test-plan" });
    const form = await fetch(`${base}/echo`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "customer[name]=Test&planId=test-plan",
    });
    assert.deepEqual(await form.json(), { customer: { name: "Test" }, planId: "test-plan" });
    const invalid = await fetch(`${base}/echo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid",
    });
    assert.equal(invalid.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});
