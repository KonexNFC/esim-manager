// ─── Notification Service ─────────────────────────────────────────────────────
// Stub implementations — wire to SendGrid / Resend / Postmark by:
//   1. Setting EMAIL_PROVIDER_API_KEY and EMAIL_FROM_ADDRESS env vars
//   2. Replacing the log() calls in each function with your provider SDK calls
//
// All methods are async and fire-and-forget safe (callers use .catch(console.error))

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

export interface MagicLoginData {
  email: string;
  name?: string;
  loginUrl: string;
  expiresInMinutes: number;
}

export interface FulfillmentFailedData {
  email: string;
  name?: string;
  orderId: string;
  reason?: string;
}

export interface OrderStatusUpdateData {
  email: string;
  name?: string;
  orderId: string;
  status: string;
  message?: string;
}

function log(type: string, data: Record<string, any>) {
  const { email, orderId, ...rest } = data;
  console.log(`[Notifications] ${type} → ${email}${orderId ? ` order:${orderId}` : ''}`, JSON.stringify({ ...rest, _stub: true }));
}

// ─── Purchase & Fulfillment ────────────────────────────────────────────────────

export async function sendPurchaseConfirmation(data: PurchaseConfirmationData): Promise<void> {
  log('purchase_confirmation', data);
  // TODO: send email with order summary and "we're preparing your eSIM" message
  // Subject: "Your GlobeSIM order #{orderId} is confirmed"
}

export async function sendEsimReadyEmail(data: EsimReadyData): Promise<void> {
  log('esim_ready', { email: data.email, orderId: data.orderId, iccid: data.iccid });
  // TODO: send email with QR code image, ICCID, destination, and setup guide link
  // Subject: "Your eSIM for {destination} is ready to install"
}

export async function sendFulfillmentFailedEmail(data: FulfillmentFailedData): Promise<void> {
  log('fulfillment_failed', data);
  // TODO: notify user their payment was received but eSIM provisioning failed
  // Subject: "Action required — your eSIM could not be activated"
  // Include: retry link, support email, refund policy note
}

export async function sendOrderStatusUpdate(data: OrderStatusUpdateData): Promise<void> {
  log('order_status_update', data);
  // TODO: generic status update — used for partially_fulfilled, delayed provisioning, etc.
}

// ─── Top-up ──────────────────────────────────────────────────────────────────

export async function sendTopupConfirmation(data: TopupConfirmationData): Promise<void> {
  log('topup_confirmation', data);
  // TODO: send email confirming top-up and updated data balance
  // Subject: "Top-up confirmed — your GlobeSIM has been updated"
}

// ─── Lifecycle Alerts ─────────────────────────────────────────────────────────

export async function sendLowDataAlert(email: string, orderId: string, dataRemainingMb: number): Promise<void> {
  log('low_data_alert', { email, orderId, dataRemainingMb });
  // TODO: alert user when < 20% data remaining with top-up CTA
  // Subject: "Running low on data? Top up your GlobeSIM"
}

export async function sendExpiryReminder(email: string, orderId: string, daysRemaining: number): Promise<void> {
  log('expiry_reminder', { email, orderId, daysRemaining });
  // TODO: remind user N days before eSIM expiry with renewal CTA
  // Subject: "Your GlobeSIM expires in {daysRemaining} day(s)"
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(email: string, orderId: string): Promise<void> {
  log('payment_failed', { email, orderId });
  // TODO: notify user their payment failed and provide retry link
  // Subject: "Payment failed — please retry your GlobeSIM order"
}

export async function sendMagicLoginEmail(data: MagicLoginData): Promise<void> {
  log('magic_login', { email: data.email, expiresInMinutes: data.expiresInMinutes });
  // TODO: send passwordless login link
  // Subject: "Your GlobeSIM sign-in link"
  // Include: loginUrl, expiry time, "didn't request this?" note
}
