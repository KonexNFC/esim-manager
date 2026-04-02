// ─── Notification Service ─────────────────────────────────────────────────────
// Sends transactional emails via Resend (https://resend.com).
// Falls back to console logging in dev if RESEND_API_KEY is not set.
//
// Required env vars:
//   RESEND_API_KEY       — your Resend API key (re_...)
//   EMAIL_FROM_ADDRESS   — verified sender (default: noreply@globesim.app)
//   APP_BASE_URL         — used for dashboard links

const RESEND_API = 'https://api.resend.com/emails';

const FROM = process.env.EMAIL_FROM_ADDRESS || 'GlobeSIM <noreply@globesim.app>';

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

// ─── Send helper ─────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[Email] RESEND_API_KEY not set — logging instead of sending`);
    console.log(`[Email] To: ${to} | Subject: ${subject}`);
    return;
  }

  const body = JSON.stringify({ from: FROM, to: [to], subject, html });

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  console.log(`[Email] Sent "${subject}" to ${to} — id=${data.id}`);
}

// ─── Shared template helpers ──────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(content: string, title: string): string {
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
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 100%);padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">🌐 GlobeSIM</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Your global connectivity partner</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #ebebeb;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#888;font-size:12px;line-height:1.6;">
              Questions? Reply to this email or visit <a href="${BASE_URL}" style="color:#7c3aed;text-decoration:none;">${BASE_URL}</a><br/>
              GlobeSIM — eSIM connectivity for 190+ destinations
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111;letter-spacing:-0.3px;">${text}</h2>`;
}

function subheading(text: string): string {
  return `<p style="margin:0 0 24px;font-size:15px;color:#555;">${text}</p>`;
}

function infoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#666;font-size:14px;width:40%;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111;font-size:14px;font-weight:600;">${value}</td>
    </tr>`;
}

function callToAction(href: string, text: string): string {
  return `
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${href}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">
        ${text}
      </a>
    </div>`;
}

// ─── eSIM Ready Email ─────────────────────────────────────────────────────────

export async function sendEsimReadyEmail(data: EsimReadyData): Promise<void> {
  const displayName = data.name ? ` ${esc(data.name.split(' ')[0])}` : '';
  const destination = esc(data.destination);

  const content = `
    ${heading(`Your eSIM is ready to install! 🎉`)}
    ${subheading(`Hi${displayName}, your GlobeSIM for <strong>${destination}</strong> has been activated and is ready to use.`)}

    <!-- QR Code -->
    <div style="text-align:center;margin:28px 0;">
      <p style="margin:0 0 12px;font-size:14px;color:#555;font-weight:600;">SCAN THIS QR CODE TO INSTALL YOUR eSIM</p>
      <img
        src="${data.qrCodeUrl}"
        alt="eSIM QR Code"
        width="220"
        height="220"
        style="border:4px solid #f0f0f0;border-radius:12px;display:block;margin:0 auto;"
      />
      ${data.iccid ? `<p style="margin:12px 0 0;font-size:12px;color:#888;">ICCID: <strong style="font-family:monospace;color:#111;">${esc(data.iccid)}</strong></p>` : ''}
      ${data.manualCode ? `<p style="margin:6px 0 0;font-size:11px;color:#aaa;">Manual code: <span style="font-family:monospace;">${esc(data.manualCode)}</span></p>` : ''}
    </div>

    <!-- Divider -->
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />

    <!-- Install Steps -->
    <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#111;">How to install your eSIM</p>

    <!-- iOS -->
    <div style="background:#f8f5ff;border-left:3px solid #7c3aed;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:16px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#5b21b6;">📱 iPhone / iOS</p>
      <ol style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:1.9;">
        <li>Open <strong>Settings</strong> → <strong>Cellular</strong></li>
        <li>Tap <strong>Add eSIM</strong> or <strong>Add Cellular Plan</strong></li>
        <li>Choose <strong>Use QR Code</strong></li>
        <li>Scan the QR code above</li>
        <li>Follow on-screen prompts to activate</li>
        <li>Set as primary or secondary line as preferred</li>
      </ol>
    </div>

    <!-- Android -->
    <div style="background:#f0faf5;border-left:3px solid #10b981;border-radius:0 8px 8px 0;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#059669;">🤖 Android</p>
      <ol style="margin:0;padding-left:20px;color:#444;font-size:13px;line-height:1.9;">
        <li>Open <strong>Settings</strong> → <strong>Connections</strong> → <strong>SIM Manager</strong></li>
        <li>Tap <strong>Add eSIM</strong> or <strong>Download SIM</strong></li>
        <li>Choose <strong>Scan QR code</strong></li>
        <li>Scan the QR code above</li>
        <li>Follow the activation prompts</li>
        <li><em>Note: Menu names vary by manufacturer (Samsung, Google, etc.)</em></li>
      </ol>
    </div>

    <!-- Tips -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">💡 Tips for the best experience</p>
      <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.8;">
        <li>Enable data roaming for your GlobeSIM line when abroad</li>
        <li>Keep Wi-Fi on when installing — you need internet to download the profile</li>
        <li>Your eSIM validity starts when you first use data, not on install</li>
        <li>If the QR code scan fails, you can enter the manual code in your device settings</li>
      </ul>
    </div>

    ${callToAction(`${BASE_URL}/dashboard`, 'View Your eSIM Dashboard →')}
    <p style="text-align:center;margin:12px 0 0;font-size:12px;color:#aaa;">Manage usage, top up, and track your data from your dashboard</p>
  `;

  await sendEmail(
    data.email,
    `Your GlobeSIM for ${data.destination} is ready to install 🌐`,
    layout(content, 'Your eSIM is Ready'),
  );
}

// ─── Purchase Confirmation ────────────────────────────────────────────────────

export async function sendPurchaseConfirmation(data: PurchaseConfirmationData): Promise<void> {
  const displayName = data.name ? ` ${esc(data.name.split(' ')[0])}` : '';
  const priceFormatted = `${esc(data.currency)} ${data.totalPrice.toFixed(2)}`;

  const content = `
    ${heading('Order confirmed! ✅')}
    ${subheading(`Thanks${displayName}! We've received your payment and are activating your eSIM now. You'll receive another email shortly with your QR code.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${infoRow('Order ID', `#${data.orderId.slice(0, 8).toUpperCase()}`)}
      ${infoRow('Plan', esc(data.planName))}
      ${infoRow('Destination', esc(data.destination))}
      ${infoRow('Data', esc(data.dataAmount))}
      ${infoRow('Validity', esc(data.validity))}
      ${infoRow('Total charged', priceFormatted)}
    </table>

    <div style="background:#f0faf5;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:14px;color:#059669;font-weight:600;">⚡ Usually ready within 2 minutes</p>
      <p style="margin:6px 0 0;font-size:13px;color:#555;">We'll email you your QR code as soon as your eSIM is provisioned.</p>
    </div>

    ${callToAction(`${BASE_URL}/dashboard`, 'Track Your Order →')}
  `;

  await sendEmail(
    data.email,
    `Your GlobeSIM order is confirmed — ${data.destination}`,
    layout(content, 'Order Confirmed'),
  );
}

// ─── Fulfillment Failed ───────────────────────────────────────────────────────

export async function sendFulfillmentFailedEmail(data: FulfillmentFailedData): Promise<void> {
  const displayName = data.name ? ` ${esc(data.name.split(' ')[0])}` : '';

  const content = `
    ${heading('Action required — eSIM activation issue')}
    ${subheading(`Hi${displayName}, we received your payment successfully, but we encountered a temporary issue activating your eSIM.`)}

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">What happened?</p>
      <p style="margin:8px 0 0;font-size:13px;color:#7f1d1d;">${data.reason ? esc(data.reason) : 'A provider network error prevented your eSIM from being provisioned.'}</p>
    </div>

    <p style="font-size:14px;color:#444;line-height:1.7;">
      <strong>What we'll do:</strong> Our team has been alerted and will resolve this manually within 2 hours. We will send you your QR code as soon as your eSIM is ready.
    </p>

    <p style="font-size:14px;color:#444;line-height:1.7;">
      Your <strong>Order ID</strong> is: <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;font-family:monospace;">#${data.orderId.slice(0, 8).toUpperCase()}</code>
    </p>

    <p style="font-size:14px;color:#444;">
      If you don't hear back within 2 hours, please reply to this email and we'll sort it out immediately.
    </p>

    ${callToAction(`${BASE_URL}/dashboard`, 'Check Order Status →')}
  `;

  await sendEmail(
    data.email,
    `Action required — your GlobeSIM eSIM could not be activated`,
    layout(content, 'eSIM Activation Issue'),
  );
}

// ─── Top-up Confirmation ─────────────────────────────────────────────────────

export async function sendTopupConfirmation(data: TopupConfirmationData): Promise<void> {
  const displayName = data.name ? ` ${esc(data.name.split(' ')[0])}` : '';
  const priceFormatted = `${esc(data.currency)} ${data.price.toFixed(2)}`;

  const content = `
    ${heading('Top-up confirmed! 🚀')}
    ${subheading(`Your data top-up has been applied${displayName}. You're good to go.`)}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${infoRow('Order ID', `#${data.orderId.slice(0, 8).toUpperCase()}`)}
      ${infoRow('Top-up', esc(data.topupName))}
      ${infoRow('Amount charged', priceFormatted)}
    </table>

    ${callToAction(`${BASE_URL}/dashboard`, 'View Updated Balance →')}
  `;

  await sendEmail(
    data.email,
    `Top-up confirmed — your GlobeSIM has been updated`,
    layout(content, 'Top-up Confirmed'),
  );
}

// ─── Order Status Update ──────────────────────────────────────────────────────

export async function sendOrderStatusUpdate(data: OrderStatusUpdateData): Promise<void> {
  const displayName = data.name ? ` ${esc(data.name.split(' ')[0])}` : '';

  const content = `
    ${heading(`Order update — ${esc(data.status)}`)}
    ${subheading(`Hi${displayName}, here's an update on your order #${data.orderId.slice(0, 8).toUpperCase()}.`)}

    ${data.message ? `<p style="font-size:14px;color:#444;line-height:1.7;">${esc(data.message)}</p>` : ''}

    ${callToAction(`${BASE_URL}/dashboard`, 'View Order →')}
  `;

  await sendEmail(
    data.email,
    `Order update: ${data.status}`,
    layout(content, 'Order Update'),
  );
}

// ─── Payment Failed ───────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail(email: string, orderId: string): Promise<void> {
  const content = `
    ${heading('Payment not completed')}
    ${subheading('Your payment could not be processed. No charge was made.')}

    <p style="font-size:14px;color:#444;line-height:1.7;">
      If you'd like to try again, simply return to our site and complete your purchase. Your cart will be saved.
    </p>

    ${callToAction(`${BASE_URL}`, 'Try Again →')}
  `;

  await sendEmail(email, 'Payment not completed — GlobeSIM', layout(content, 'Payment Failed'));
}

// ─── Lifecycle Alerts ─────────────────────────────────────────────────────────

export async function sendLowDataAlert(email: string, orderId: string, dataRemainingMb: number): Promise<void> {
  const gbRemaining = (dataRemainingMb / 1024).toFixed(1);

  const content = `
    ${heading('Running low on data 📶')}
    ${subheading(`You have <strong>${gbRemaining} GB</strong> remaining on your GlobeSIM.`)}

    <p style="font-size:14px;color:#444;line-height:1.7;">
      Don't get caught without data! Top up now to keep connected.
    </p>

    ${callToAction(`${BASE_URL}/dashboard`, 'Top Up Now →')}
  `;

  await sendEmail(email, `Running low on data — top up your GlobeSIM`, layout(content, 'Low Data Alert'));
}

export async function sendExpiryReminder(email: string, orderId: string, daysRemaining: number): Promise<void> {
  const content = `
    ${heading(`Your eSIM expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} ⏱`)}
    ${subheading('Get more data before your plan expires to stay connected.')}

    <p style="font-size:14px;color:#444;line-height:1.7;">
      Extend your plan or top up from your dashboard with just a few taps.
    </p>

    ${callToAction(`${BASE_URL}/dashboard`, 'Manage My eSIM →')}
  `;

  await sendEmail(email, `Your GlobeSIM expires in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`, layout(content, 'eSIM Expiry Reminder'));
}

// ─── Magic Login ──────────────────────────────────────────────────────────────

export async function sendMagicLoginEmail(data: MagicLoginData): Promise<void> {
  const content = `
    ${heading('Your sign-in link 🔐')}
    ${subheading('Click the button below to sign in to GlobeSIM. This link expires in ' + data.expiresInMinutes + ' minutes.')}

    ${callToAction(data.loginUrl, 'Sign In to GlobeSIM →')}

    <p style="text-align:center;margin:12px 0 0;font-size:12px;color:#aaa;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;

  await sendEmail(data.email, 'Your GlobeSIM sign-in link', layout(content, 'Sign In'));
}
