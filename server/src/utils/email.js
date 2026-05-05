const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter = null;
let transporterError = null;

const buildTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    const missing = [
      !host && 'SMTP_HOST',
      !port && 'SMTP_PORT',
      !user && 'SMTP_USER',
      !pass && 'SMTP_PASS',
    ].filter(Boolean).join(', ');
    transporterError = `SMTP is not configured. Missing env vars: ${missing}`;
    logger.warn(transporterError);
    return null;
  }

  // port 465 → implicit TLS; 587/25 → STARTTLS
  const secure = port === 465;

  const t = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  t.verify().then(
    () => logger.info(`SMTP transporter ready (${host}:${port})`),
    (err) => logger.error('SMTP verify failed', { error: err.message }),
  );

  transporterError = null;
  return t;
};

const getTransporter = () => {
  if (!transporter) transporter = buildTransporter();
  return transporter;
};

const isEmailConfigured = () => Boolean(getTransporter());

/**
 * Send an email. Throws on failure so callers can decide how to react.
 */
const sendMail = async ({ to, subject, html, text }) => {
  const t = getTransporter();
  if (!t) {
    throw new Error(transporterError || 'Email service is not configured');
  }

  const from = process.env.SMTP_FROM
    || `LogiForce <${process.env.SMTP_USER}>`;

  const info = await t.sendMail({ from, to, subject, html, text });
  logger.info('Email sent', { to, subject, messageId: info.messageId });
  return info;
};

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendPasswordResetEmail = async ({ to, name, resetUrl, tenantName, expiresMinutes }) => {
  const safeName = escapeHtml(name || 'there');
  const safeTenant = escapeHtml(tenantName || 'LogiForce');
  const safeUrl = escapeHtml(resetUrl);
  const minutes = expiresMinutes || 60;

  const subject = `Reset your ${safeTenant} password`;
  const text = [
    `Hi ${name || 'there'},`,
    '',
    `We received a request to reset the password for your ${tenantName || 'LogiForce'} account.`,
    `Open the link below to choose a new password. It expires in ${minutes} minutes.`,
    '',
    resetUrl,
    '',
    `If you didn't request this, you can safely ignore this email — your password won't change.`,
  ].join('\n');

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0f1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e6e6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1115;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#16181f;border:1px solid #2a2d36;border-radius:12px;padding:32px;">
        <tr><td>
          <div style="font-size:18px;font-weight:600;color:#fff;margin-bottom:8px;">${safeTenant}</div>
          <h1 style="font-size:20px;font-weight:500;color:#fff;margin:16px 0 12px;">Reset your password</h1>
          <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 16px;">Hi ${safeName},</p>
          <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 24px;">
            We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in ${minutes} minutes.
          </p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;padding:11px 20px;background:linear-gradient(135deg,#4f8ef7,#7c5ff0);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">
              Reset password
            </a>
          </p>
          <p style="font-size:12px;line-height:1.6;color:#888;margin:0 0 8px;">
            Or paste this URL into your browser:
          </p>
          <p style="font-size:12px;line-height:1.6;color:#888;word-break:break-all;margin:0 0 24px;">
            ${safeUrl}
          </p>
          <hr style="border:none;border-top:1px solid #2a2d36;margin:24px 0;" />
          <p style="font-size:12px;line-height:1.6;color:#888;margin:0;">
            If you didn't request this, you can safely ignore this email — your password won't change.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  isEmailConfigured,
};
