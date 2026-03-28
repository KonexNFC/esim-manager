// Shared in-memory store for the webhook signing secret captured at startup.
// This avoids circular imports between index.ts and its webhook handler.
let _secret: string | null = null;
export function setWebhookSigningSecret(s: string) { _secret = s; }
export function getWebhookSigningSecret(): string | null { return _secret; }
