import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ZenditAdapter,
  ZenditPurchasePendingError,
} from '../providers/adapters/zendit';

const params = {
  countryCode: 'GB',
  dataAmountGb: 1,
  validityDays: 7,
  providerRef: 'offer-1',
  customerEmail: 'customer@example.com',
};

test('Zendit purchase uses the caller-reserved transaction ID when the POST response is lost', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    throw new TypeError('network response lost');
  };

  try {
    const adapter = new ZenditAdapter('test-key', 'test');
    await assert.rejects(
      adapter.purchaseEsim({
        ...params,
        providerTransactionId: 'konex-reserved-transaction',
      }),
      (err: unknown) => {
        assert.ok(err instanceof ZenditPurchasePendingError);
        assert.equal(err.providerEsimId, 'konex-reserved-transaction');
        return true;
      },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].body ?? '', /konex-reserved-transaction/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Zendit definitive purchase rejection is not treated as a pending purchase', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'invalid offer' }), { status: 400 });

  try {
    const adapter = new ZenditAdapter('test-key', 'test');
    await assert.rejects(
      adapter.purchaseEsim({
        ...params,
        providerTransactionId: 'konex-rejected-transaction',
      }),
      (err: unknown) => {
        assert.ok(!(err instanceof ZenditPurchasePendingError));
        assert.match((err as Error).message, /Zendit 400/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Zendit reconciliation checks the existing transaction without creating another purchase', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url.endsWith('/qrcode')) {
      return new Response(JSON.stringify({ qrCode: 'data:image/png;base64,qr' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      status: 'COMPLETED',
      confirmation: {
        iccid: '8944000000000000001',
        smdpAddress: 'smdp.example.com',
        activationCode: 'activation-code',
      },
    }), { status: 200 });
  };

  try {
    const adapter = new ZenditAdapter('test-key', 'test');
    const result = await adapter.reconcilePendingPurchase('konex-existing-transaction', params);

    assert.equal(result?.providerEsimId, 'konex-existing-transaction');
    assert.equal(result?.iccid, '8944000000000000001');
    assert.equal(result?.manualCode, 'activation-code');
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.ok(calls.every(call => call.url.includes('konex-existing-transaction')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Zendit reconciliation remains pending when no profile has been allocated', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ status: 'PROCESSING' }), { status: 200 });
  };

  try {
    const adapter = new ZenditAdapter('test-key', 'test');
    const result = await adapter.reconcilePendingPurchase('konex-pending-transaction', params);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});