// ─── Notification Service ─────────────────────────────────────────────────────
// Stub implementations with console.log. Wire to SendGrid / Resend / Postmark
// by setting EMAIL_PROVIDER_API_KEY and replacing the log calls below.

export interface PurchaseConfirmationData {
  email: string;
  name?: string;
  orderId: string;
  planName: string;
  destination: string;
  dataAmount: string;
  validity: string;
  totalPrice: number;
  currency: string;
}

export interface EsimReadyData {
  email: string;
  name?: string;
  orderId: string;
  qrCodeUrl: string;
  iccid: string;
  destination: string;
  manualCode?: string;
}

export interface TopupConfirmationData {
  email: string;
  name?: string;
  orderId: string;
  topupName: string;
  price: number;
  currency: string;
}

function log(type: string, data: Record<string, any>) {
  console.log(`[Notifications] ${type}:`, JSON.stringify({ ...data, _stub: true }));
}

export async function sendPurchaseConfirmation(data: PurchaseConfirmationData) {
  log('purchase_confirmation', data);
  // TODO: send email with order summary and "we're preparing your eSIM" message
}

export async function sendEsimReadyEmail(data: EsimReadyData) {
  log('esim_ready', { email: data.email, orderId: data.orderId, iccid: data.iccid });
  // TODO: send email with QR code image, ICCID, and setup guide link
}

export async function sendTopupConfirmation(data: TopupConfirmationData) {
  log('topup_confirmation', data);
  // TODO: send email confirming top-up and updated data balance
}

export async function sendLowDataAlert(email: string, orderId: string, dataRemainingMb: number) {
  log('low_data_alert', { email, orderId, dataRemainingMb });
  // TODO: alert user when < 20% data remaining
}

export async function sendExpiryReminder(email: string, orderId: string, daysRemaining: number) {
  log('expiry_reminder', { email, orderId, daysRemaining });
  // TODO: remind user 2 days before eSIM expiry
}

export async function sendPaymentFailedEmail(email: string, orderId: string) {
  log('payment_failed', { email, orderId });
  // TODO: notify user their payment failed and provide retry link
}
