// ─── Notification Service ─────────────────────────────────────────────────────
// Sends transactional emails via SendGrid (primary) or Resend (fallback).
//
// SendGrid credentials are managed via the Replit SendGrid integration.
// Fallback: set RESEND_API_KEY to use Resend instead.
// Dev fallback: console-logs if neither is configured.

import { qrImageUrl } from "../../shared/qrImage";

const RESEND_API = 'https://api.resend.com/emails';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@konexesim.com';

const BASE_URL =
  process.env.APP_BASE_URL ||
  (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000');

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // Order summary fields
  planName?: string;
  dataAmount?: string;
  validity?: string;
  totalPrice?: number;
  currency?: string;
  paymentMethod?: string;
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

export interface PaymentRefundedData {
  email: string;
  orderId: string;
  totalPrice: number;
  currency: string;
  refundPending?: boolean;
}

export interface ProviderWalletLowBalanceData {
  providerName: string;
  balance: number;
  currency: string;
  threshold: number;
}

// ─── Send helper ─────────────────────────────────────────────────────────────

async function sendViaSendGrid(to: string, from: string, subject: string, html: string): Promise<void> {
  const { getUncachableSendGridClient } = await import('../sendgridClient');
  const { client, fromEmail } = await getUncachableSendGridClient();
  await client.send({ to, from: from || fromEmail, subject, html });
}

async function sendViaResend(to: string, from: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

/** Returns true only when an email provider accepted the message. */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const FROM = process.env.EMAIL_FROM_ADDRESS || 'Konex eSIM <noreply@konexesim.com>';

  // Try SendGrid first, then Resend, then log
  try {
    await sendViaSendGrid(to, FROM, subject, html);
    console.log(`[Email/SendGrid] Sent "${subject}" to ${to}`);
    return true;
  } catch (sgErr: any) {
    console.warn(`[Email] SendGrid failed (${sgErr.message}), trying Resend…`);
  }

  try {
    await sendViaResend(to, FROM, subject, html);
    console.log(`[Email/Resend] Sent "${subject}" to ${to}`);
    return true;
  } catch (resendErr: any) {
    console.warn(`[Email] Resend failed (${resendErr.message}), falling back to console log`);
  }

  console.log(`[Email] FALLBACK — To: ${to} | Subject: ${subject}`);
  return false;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortOrderId(orderId: string): string {
  // Convert first 8 hex chars to a decimal-looking reference number
  const hex = orderId.replace(/-/g, '').substring(0, 8);
  return String(parseInt(hex, 16)).substring(0, 8).padStart(8, '0');
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Dark theme layout (Airalo-inspired) ──────────────────────────────────────

function darkLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0e0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0e1a;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:16px;overflow:hidden;">

        <!-- Header: Logo -->
        <tr>
          <td style="padding:28px 32px 20px;text-align:center;">
            <div style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:12px;padding:10px 20px;">
              <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">KONEX <span style="font-weight:400;opacity:0.85;">eSIM</span></span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:0 32px 32px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid rgba(255,255,255,0.08);padding:20px 32px;text-align:center;">
            <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.7;">
              Questions? Reply to this email or visit
              <a href="https://konexesim.com" style="color:#7c3aed;text-decoration:none;">konexesim.com</a><br/>
              Konex eSIM — Instant connectivity for 190+ destinations
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Light theme layout (used for transactional / admin emails) ───────────────

function lightLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 100%);padding:24px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">KONEX eSIM</h1>
          </td>
        </tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #ebebeb;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#888;font-size:12px;line-height:1.6;">
              Questions? Reply to this email or visit <a href="https://konexesim.com" style="color:#7c3aed;text-decoration:none;">konexesim.com</a><br/>
              Konex eSIM — connectivity for 190+ destinations
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function darkOrderRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:rgba(255,255,255,0.5);font-size:14px;">${label}</td>
      <td style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#ffffff;font-size:14px;font-weight:600;text-align:right;">${value}</td>
    </tr>`;
}

function lightInfoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#666;font-size:14px;width:40%;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;font-weight:600;">${value}</td>
    </tr>`;
}

function primaryButton(href: string, text: string): string {
  return `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${href}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 36px;border-radius:50px;letter-spacing:0.2px;">
        ${text}
      </a>
    </div>`;
}

// ─── eSIM Ready Email (Airalo-style combined) ─────────────────────────────────

function extractLpaUri(qrCodeUrl: string): string | null {
  try { return new URL(qrCodeUrl).searchParams.get('data'); } catch { return null; }
}

export async function sendEsimReadyEmail(data: EsimReadyData): Promise<void> {
  const firstName = data.name ? esc(data.name.split(' ')[0]) : '';
  const destination = esc(data.destination);
  const lpaUri = data.manualCode ?? extractLpaUri(data.qrCodeUrl);
  const orderRef = shortOrderId(data.orderId);
  const orderDate = formatDate();

  const largeQrUrl = esc(qrImageUrl(data.qrCodeUrl, 400));

  const currencySymbol = data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';
  const totalFormatted = data.totalPrice ? `${currencySymbol}${data.totalPrice.toFixed(2)}` : '';
  const packageLabel = data.dataAmount && data.validity
    ? `${destination} — ${esc(data.dataAmount)} · ${esc(data.validity)}`
    : destination;

  const content = `
    <!-- Hero heading -->
    <h1 style="margin:0 0 8px;text-align:center;color:#ffffff;font-size:28px;font-weight:800;line-height:1.25;letter-spacing:-0.5px;">
      Thank you for your<br/>purchase!
    </h1>
    <p style="margin:0 0 28px;text-align:center;color:rgba(255,255,255,0.5);font-size:14px;">Your eSIM is ready to install</p>

    <!-- Greeting -->
    ${firstName ? `<p style="margin:0 0 6px;color:#ffffff;font-size:16px;font-weight:700;">Hi ${firstName}!</p>` : ''}
    <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:15px;line-height:1.65;">
      Thank you for your purchase! We hope you enjoy your eSIM and look forward to keeping you connected wherever you are in the world.
    </p>
    <p style="margin:0 0 28px;color:rgba(255,255,255,0.75);font-size:15px;line-height:1.65;">
      Open this email on your phone, then hold down the QR code below and tap <strong style="color:#ffffff;">"Add Cellular Plan"</strong> to install instantly on iPhone — or scan with your camera.
    </p>

    <!-- QR Code -->
    <div style="text-align:center;margin:0 0 28px;">
      <div style="display:inline-block;background:#ffffff;border-radius:16px;padding:14px;">
        <img
          src="${largeQrUrl}"
          alt="eSIM QR Code"
          width="200"
          height="200"
          style="display:block;border-radius:8px;"
        />
      </div>
      ${data.iccid ? `<p style="margin:10px 0 0;color:rgba(255,255,255,0.4);font-size:12px;">ICCID: <span style="font-family:monospace;color:rgba(255,255,255,0.7);">${esc(data.iccid)}</span></p>` : ''}
    </div>

    <!-- Install eSIM button -->
    <div style="text-align:center;margin:0 0 32px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 48px;border-radius:50px;">
        Install eSIM
      </a>
    </div>

    <!-- Order Summary -->
    <div style="background:#242436;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
      <h2 style="margin:0 0 16px;color:#ffffff;font-size:18px;font-weight:700;text-align:center;">Order summary</h2>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${darkOrderRow('Order number', orderRef)}
        ${darkOrderRow('Order date', orderDate)}
        ${data.paymentMethod ? darkOrderRow('Payment type', esc(data.paymentMethod)) : ''}
        ${firstName ? darkOrderRow('Issued to', esc(data.name || firstName)) : ''}
        ${darkOrderRow('Package', packageLabel)}
        ${totalFormatted ? `
        <tr>
          <td style="padding:14px 0 0;color:#ffffff;font-size:15px;font-weight:700;">Total</td>
          <td style="padding:14px 0 0;color:#ffffff;font-size:15px;font-weight:700;text-align:right;">${totalFormatted}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Ready to install section -->
    <div style="text-align:center;margin-bottom:20px;">
      <h2 style="margin:0 0 12px;color:#ffffff;font-size:20px;font-weight:800;">Ready to install and<br/>activate your eSIM?</h2>
      <p style="margin:0 0 16px;color:rgba(255,255,255,0.6);font-size:14px;line-height:1.65;">
        If you're new and unsure of the installation process, visit our Help Center.<br/>
        You can follow the step-by-step
        <a href="https://konexesim.com/help/ios" style="color:#a78bfa;text-decoration:none;">iOS</a>
        and
        <a href="https://konexesim.com/help/android" style="color:#a78bfa;text-decoration:none;">Android</a>
        installation guides.
      </p>
    </div>

    <!-- Install steps -->
    <div style="background:#242436;border-radius:12px;padding:16px 20px;margin-bottom:16px;">
      <p style="margin:0 0 10px;color:#a78bfa;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">📱 iPhone</p>
      <ol style="margin:0;padding-left:20px;color:rgba(255,255,255,0.7);font-size:13px;line-height:2;">
        <li><strong style="color:#fff;">Hold down this QR code</strong> → tap "Add Cellular Plan" (iOS 14+)</li>
        <li>Or: Settings → Cellular → Add eSIM → Use QR Code</li>
        <li>Label it "Travel Data" and enable when abroad</li>
      </ol>
    </div>

    <div style="background:#242436;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;color:#34d399;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">🤖 Android</p>
      <ol style="margin:0;padding-left:20px;color:rgba(255,255,255,0.7);font-size:13px;line-height:2;">
        <li>Settings → Network &amp; Internet → SIMs → Add eSIM</li>
        <li>Tap "Download a SIM" or "Scan QR code"</li>
        <li>Scan the QR code and follow the prompts</li>
      </ol>
    </div>

    ${lpaUri ? `
    <div style="background:#242436;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Manual activation code</p>
      <p style="margin:0;font-size:11px;font-family:monospace;color:rgba(255,255,255,0.8);word-break:break-all;line-height:1.7;">${esc(lpaUri)}</p>
    </div>` : ''}

    <!-- Tips -->
    <div style="background:#2d2420;border:1px solid rgba(217,119,6,0.3);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
      <p style="margin:0 0 8px;color:#fbbf24;font-size:13px;font-weight:700;">💡 Tips</p>
      <ul style="margin:0;padding-left:18px;color:rgba(255,255,255,0.65);font-size:13px;line-height:1.9;">
        <li>Keep Wi-Fi on while installing — internet is needed to download the profile</li>
        <li>Enable <strong style="color:#fff;">data roaming</strong> for your Konex line when abroad</li>
        <li>Your validity starts when you <strong style="color:#fff;">first use data</strong>, not on install</li>
        <li>Each QR code can only be installed on <strong style="color:#fff;">one device</strong></li>
      </ul>
    </div>
  `;

  await sendEmail(
    data.email,
    `Your Konex eSIM for ${data.destination} is ready — install now`,
    darkLayout(content, 'Your eSIM is Ready'),
  );
}

// ─── Purchase Confirmation (sent immediately after payment, before eSIM is ready) ──

export async function sendPurchaseConfirmation(data: PurchaseConfirmationData): Promise<void> {
  const firstName = data.name ? esc(data.name.split(' ')[0]) : '';
  const currencySymbol = data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';
  const totalFormatted = `${currencySymbol}${data.totalPrice.toFixed(2)}`;

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Order received ✅</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">
      ${firstName ? `Hi ${firstName}, w` : 'W'}e've received your payment and are activating your eSIM right now.
      You'll receive another email with your QR code within a couple of minutes.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lightInfoRow('Order reference', `#${shortOrderId(data.orderId)}`)}
      ${lightInfoRow('Destination', esc(data.destination))}
      ${lightInfoRow('Plan', esc(data.planName))}
      ${lightInfoRow('Data', esc(data.dataAmount))}
      ${lightInfoRow('Validity', esc(data.validity))}
      ${lightInfoRow('Total', totalFormatted)}
    </table>

    <div style="background:#f0faf5;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:14px;color:#059669;font-weight:600;">⚡ Usually ready within 2 minutes</p>
      <p style="margin:6px 0 0;font-size:13px;color:#555;">We'll email your QR code as soon as your eSIM is provisioned.</p>
    </div>

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">
        Track Your Order →
      </a>
    </div>
  `;

  await sendEmail(
    data.email,
    `Order confirmed — your Konex eSIM for ${data.destination} is being activated`,
    lightLayout(content, 'Order Confirmed'),
  );
}

// ─── Fulfillment Failed ───────────────────────────────────────────────────────

export async function sendFulfillmentFailedEmail(data: FulfillmentFailedData): Promise<void> {
  const displayName = data.name ? esc(data.name.split(' ')[0]) : 'there';
  const shortId = shortOrderId(data.orderId);

  const customerContent = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">We're on it — your eSIM is coming</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Hi ${displayName}, your payment went through successfully. We're just finishing setting up your eSIM.</p>

    <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#92400e;">⏱ Estimated delivery: within 2 hours</p>
      <p style="margin:10px 0 0;font-size:14px;color:#78350f;line-height:1.6;">
        Our team has been automatically notified and is resolving this right now. You will receive your QR code by email as soon as your eSIM is ready.
      </p>
    </div>

    <p style="font-size:14px;color:#444;line-height:1.7;">
      Your <strong>Order reference</strong>: <code style="background:#f5f5f5;padding:2px 8px;border-radius:4px;font-family:monospace;">#${shortId}</code>
    </p>
    <p style="font-size:14px;color:#444;line-height:1.7;">
      If you haven't received your QR code within 2 hours, reply to this email and we'll resolve it immediately.
    </p>

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">
        Check Order Status →
      </a>
    </div>
    <p style="font-size:12px;color:#999;margin-top:16px;text-align:center;">
      Your payment is safe — a full refund is available if we cannot deliver your eSIM.
    </p>
  `;

  await sendEmail(
    data.email,
    `Your Konex eSIM is being set up — QR code coming shortly`,
    lightLayout(customerContent, 'eSIM Setup In Progress'),
  );

  // Admin alert
  const adminContent = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">⚠️ Fulfillment failure — action required</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Order <strong>#${shortId}</strong> (${data.orderId}) failed to fulfil automatically.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lightInfoRow('Order ID', data.orderId)}
      ${lightInfoRow('Customer', esc(data.email))}
      ${data.name ? lightInfoRow('Name', esc(data.name)) : ''}
    </table>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">Error</p>
      <pre style="margin:10px 0 0;font-size:12px;color:#7f1d1d;white-space:pre-wrap;font-family:monospace;">${data.reason ? esc(data.reason) : 'No reason provided'}</pre>
    </div>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/admin" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">Open Admin Panel →</a>
    </div>
  `;

  sendEmail(ADMIN_EMAIL, `[KONEX ALERT] Fulfillment failed — order #${shortId}`, lightLayout(adminContent, 'Fulfillment Alert'))
    .catch(() => {});
}

// ─── Provider Wallet Alert ────────────────────────────────────────────────────

export async function sendProviderWalletLowBalanceAlert(data: ProviderWalletLowBalanceData): Promise<void> {
  const amount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: data.currency,
  }).format(data.balance);
  const threshold = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: data.currency,
  }).format(data.threshold);
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">⚠️ Provider wallet running low</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">
      <strong>${esc(data.providerName)}</strong> has only <strong>${esc(amount)}</strong> of prepaid credit remaining.
      New eSIM orders can fail if the wallet reaches zero.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lightInfoRow("Provider", esc(data.providerName))}
      ${lightInfoRow("Available balance", esc(amount))}
      ${lightInfoRow("Alert threshold", esc(threshold))}
    </table>
    ${primaryButton(`${BASE_URL}/admin`, "Open Provider Dashboard")}
    <p style="margin:20px 0 0;font-size:12px;color:#888;">This alert is limited to one email per provider every 24 hours while the balance remains low.</p>
  `;

  const delivered = await sendEmail(
    ADMIN_EMAIL,
    `[KONEX ALERT] ${data.providerName} wallet low — ${amount} remaining`,
    lightLayout(content, "Provider Wallet Low"),
  );
  if (!delivered) {
    throw new Error("No email provider accepted the provider wallet alert");
  }
}

// ─── Top-up Confirmation ─────────────────────────────────────────────────────

export async function sendTopupConfirmation(data: TopupConfirmationData): Promise<void> {
  const firstName = data.name ? esc(data.name.split(' ')[0]) : '';
  const currencySymbol = data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Top-up confirmed! 🚀</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Your data top-up has been applied${firstName ? `, ${firstName}` : ''}. You're good to go.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lightInfoRow('Reference', `#${shortOrderId(data.orderId)}`)}
      ${lightInfoRow('Top-up', esc(data.topupName))}
      ${lightInfoRow('Amount', `${currencySymbol}${data.price.toFixed(2)}`)}
    </table>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">View Updated Balance →</a>
    </div>
  `;

  await sendEmail(data.email, `Top-up confirmed — Konex eSIM`, lightLayout(content, 'Top-up Confirmed'));
}

// ─── Magic Login ──────────────────────────────────────────────────────────────

export async function sendMagicLoginEmail(data: MagicLoginData): Promise<void> {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Your sign-in link 🔐</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Click the button below to sign in to Konex. This link expires in ${data.expiresInMinutes} minutes.</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${data.loginUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">Sign In to Konex →</a>
    </div>
    <p style="text-align:center;margin:12px 0 0;font-size:12px;color:#aaa;">If you didn't request this, you can safely ignore this email.</p>
  `;

  await sendEmail(data.email, 'Your Konex sign-in link', lightLayout(content, 'Sign In'));
}

// ─── Order Status Update ──────────────────────────────────────────────────────

export async function sendOrderStatusUpdate(data: OrderStatusUpdateData): Promise<void> {
  const firstName = data.name ? esc(data.name.split(' ')[0]) : '';

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Order update — ${esc(data.status)}</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Hi${firstName ? ` ${firstName}` : ''}, here's an update on your order #${shortOrderId(data.orderId)}.</p>
    ${data.message ? `<p style="font-size:14px;color:#444;line-height:1.7;">${esc(data.message)}</p>` : ''}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">View Order →</a>
    </div>
  `;

  await sendEmail(data.email, `Order update: ${data.status}`, lightLayout(content, 'Order Update'));
}

// ─── Payment Refunded ─────────────────────────────────────────────────────────

export async function sendPaymentRefundedEmail(data: PaymentRefundedData): Promise<void> {
  const currencySymbol = data.currency === 'GBP' ? '£' : data.currency === 'EUR' ? '€' : '$';
  const amount = `${currencySymbol}${data.totalPrice.toFixed(2)}`;
  const title = data.refundPending ? 'Your refund is being processed' : 'Your payment has been refunded';
  const explanation = data.refundPending
    ? 'We have requested a full refund, and no eSIM has been activated.'
    : 'We have issued a full refund, and no eSIM has been activated.';
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">${title}</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#555;">
      We were unable to complete your eSIM order because its final payment did not match the current plan price.
      ${explanation}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${lightInfoRow('Order reference', `#${shortOrderId(data.orderId)}`)}
      ${lightInfoRow('Refund amount', amount)}
    </table>
    <div style="background:#f0faf5;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#065f46;line-height:1.6;">
        Your payment provider may take a few business days to show the refund in your account.
      </p>
    </div>
    <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
      If you have any questions, reply to this email and our team will be happy to help.
    </p>
  `;

  const delivered = await sendEmail(
    data.email,
    data.refundPending
      ? 'Your Konex eSIM refund is being processed'
      : 'Your Konex eSIM payment has been refunded',
    lightLayout(content, data.refundPending ? 'Refund Processing' : 'Payment Refunded'),
  );
  if (!delivered) throw new Error('No email provider accepted the refund notification');
}

// ─── Payment Failed ───────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(email: string, orderId: string): Promise<void> {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Payment not completed</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Your payment could not be processed. No charge was made.</p>
    <p style="font-size:14px;color:#444;line-height:1.7;">Simply return to our site and complete your purchase whenever you're ready.</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="https://konexesim.com" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">Try Again →</a>
    </div>
  `;

  await sendEmail(email, 'Payment not completed — Konex eSIM', lightLayout(content, 'Payment Failed'));
}

// ─── Lifecycle Alerts ─────────────────────────────────────────────────────────

export async function sendLowDataAlert(email: string, orderId: string, dataRemainingMb: number): Promise<void> {
  const gbRemaining = (dataRemainingMb / 1024).toFixed(1);
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Running low on data 📶</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">You have <strong>${gbRemaining} GB</strong> remaining on your Konex eSIM.</p>
    <p style="font-size:14px;color:#444;line-height:1.7;">Don't get caught without data! Top up now to stay connected.</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">Top Up Now →</a>
    </div>
  `;
  await sendEmail(email, `Running low on data — top up your Konex eSIM`, lightLayout(content, 'Low Data Alert'));
}

export async function sendExpiryReminder(email: string, orderId: string, daysRemaining: number): Promise<void> {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;">Your eSIM expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} ⏱</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#555;">Get more data before your plan expires to stay connected.</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${BASE_URL}/dashboard" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">Manage My eSIM →</a>
    </div>
  `;
  await sendEmail(email, `Your Konex eSIM expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`, lightLayout(content, 'eSIM Expiry Reminder'));
}
