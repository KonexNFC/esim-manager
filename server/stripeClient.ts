import Stripe from 'stripe';

let connectionSettings: any;

async function fetchStripeConnection(hostname: string, xReplitToken: string, environment: string) {
  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', environment);

  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken },
  });
  const data = await response.json();
  const settings = data.items?.[0];
  if (settings?.settings?.publishable && settings?.settings?.secret) return settings;
  return null;
}

async function getCredentials() {
  // Prefer explicit environment variable keys (live/production keys)
  if (process.env.STRIPE_SECRET_KEY) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
    const isLive = secretKey.startsWith('sk_live_');
    console.log(`[Stripe] Using env var keys (${isLive ? 'live' : 'test'} mode)`);
    return { publishableKey, secretKey };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';

  // Try the environment-matched connection first, then fall back to development
  // (covers the common case where only a development Stripe connection was set up)
  const environments = isProduction
    ? ['production', 'development']
    : ['development', 'production'];

  for (const env of environments) {
    const found = await fetchStripeConnection(hostname!, xReplitToken, env);
    if (found) {
      connectionSettings = found;
      console.log(`[Stripe] Using ${env} connection (running in ${isProduction ? 'production' : 'development'})`);
      return {
        publishableKey: connectionSettings.settings.publishable,
        secretKey: connectionSettings.settings.secret,
      };
    }
  }

  throw new Error('No Stripe connection found (tried production + development)');
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
