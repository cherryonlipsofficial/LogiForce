const nodemailer = require('nodemailer');
const logger = require('./logger');

// Two-track email delivery:
//   1. RESEND_API_KEY  → use Resend's HTTP API. No SMTP host/port to configure;
//                        the default sender "onboarding@resend.dev" works
//                        without a verified domain. This is the recommended
//                        zero-setup path.
//   2. SMTP_HOST + …   → fall back to nodemailer + SMTP if a full set of SMTP
//                        env vars is provided (legacy / self-hosted).

let resendClient = null;
let smtpTransporter = null;
let providerError = null;

const buildResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  // Lazy-load so apps without the dep installed still boot.
  const { Resend } = require('resend');
  const client = new Resend(apiKey);
  logger.info('Email provider: Resend (HTTP API)');
  return client;
};

const buildSmtpTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  // port 465 → implicit TLS; 587/25 → STARTTLS
  const secure = port === 465;
  const t = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  t.verify().then(
    () => logger.info(`Email provider: SMTP (${host}:${port})`),
    (err) => logger.error('SMTP verify failed', { error: err.message }),
  );
  return t;
};

const initProvider = () => {
  if (resendClient || smtpTransporter) return;

  resendClient = buildResendClient();
  if (resendClient) return;

  smtpTransporter = buildSmtpTransporter();
  if (smtpTransporter) return;

  providerError =
    'Email service is not configured. Set RESEND_API_KEY (recommended — no SMTP setup needed) ' +
    'or the full SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS set.';
  logger.warn(providerError);
};

const isEmailConfigured = () => {
  initProvider();
  return Boolean(resendClient || smtpTransporter);
};

const defaultFromAddress = () => {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  // Resend lets unverified accounts use this sender for free.
  if (resendClient) return 'LogiForce <onboarding@resend.dev>';
  return `LogiForce <${process.env.SMTP_USER || 'no-reply@logiforce.app'}>`;
};

/**
 * Send an email. Throws on failure so callers can roll back any state they
 * persisted in anticipation of the email going out (e.g. reset tokens, OTPs).
 */
const sendMail = async ({ to, subject, html, text }) => {
  initProvider();
  if (!resendClient && !smtpTransporter) {
    throw new Error(providerError || 'Email service is not configured');
  }

  const from = defaultFromAddress();

  if (resendClient) {
    const { data, error } = await resendClient.emails.send({ from, to, subject, html, text });
    if (error) {
      throw new Error(error.message || 'Resend rejected the email');
    }
    logger.info('Email sent via Resend', { to, subject, id: data?.id });
    return data;
  }

  const info = await smtpTransporter.sendMail({ from, to, subject, html, text });
  logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
  return info;
};

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Shared inline-styled wrapper. Inlined CSS because most email clients still
// strip <style> blocks.
const renderShell = ({ tenant, heading, bodyHtml }) => `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0f1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e6e6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1115;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#16181f;border:1px solid #2a2d36;border-radius:12px;padding:32px;">
        <tr><td>
          <div style="font-size:18px;font-weight:600;color:#fff;margin-bottom:8px;">${escapeHtml(tenant)}</div>
          <h1 style="font-size:20px;font-weight:500;color:#fff;margin:16px 0 12px;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const sendPasswordResetEmail = async ({ to, name, resetUrl, tenantName, expiresMinutes }) => {
  const safeName = escapeHtml(name || 'there');
  const safeUrl = escapeHtml(resetUrl);
  const minutes = expiresMinutes || 60;
  const tenant = tenantName || 'LogiForce';

  const subject = `Reset your ${tenant} password`;
  const text = [
    `Hi ${name || 'there'},`,
    '',
    `We received a request to reset the password for your ${tenant} account.`,
    `Open the link below to choose a new password. It expires in ${minutes} minutes.`,
    '',
    resetUrl,
    '',
    `If you didn't request this, you can safely ignore this email — your password won't change.`,
  ].join('\n');

  const bodyHtml = `
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 16px;">Hi ${safeName},</p>
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 24px;">
      We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in ${minutes} minutes.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;padding:11px 20px;background:linear-gradient(135deg,#4f8ef7,#7c5ff0);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">
        Reset password
      </a>
    </p>
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0 0 8px;">Or paste this URL into your browser:</p>
    <p style="font-size:12px;line-height:1.6;color:#888;word-break:break-all;margin:0 0 24px;">${safeUrl}</p>
    <hr style="border:none;border-top:1px solid #2a2d36;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0;">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>`;

  return sendMail({
    to,
    subject,
    text,
    html: renderShell({ tenant, heading: 'Reset your password', bodyHtml }),
  });
};

const sendOtpEmail = async ({ to, name, code, purpose, tenantName, expiresMinutes }) => {
  const safeName = escapeHtml(name || 'there');
  const tenant = tenantName || 'LogiForce';
  const minutes = expiresMinutes || 10;

  const purposeCopy = {
    verify_email:    { subject: `Verify your ${tenant} email`,    heading: 'Verify your email',    intro: 'Use the code below to verify your email address and activate your account.' },
    login:           { subject: `Your ${tenant} sign-in code`,    heading: 'Sign in to your account', intro: 'Use the code below to sign in.' },
    password_reset:  { subject: `Your ${tenant} password reset code`, heading: 'Reset your password', intro: 'Use the code below to choose a new password.' },
  };
  const copy = purposeCopy[purpose] || purposeCopy.verify_email;

  const text = [
    `Hi ${name || 'there'},`,
    '',
    copy.intro,
    '',
    `Your verification code: ${code}`,
    '',
    `This code expires in ${minutes} minutes. If you didn't request it, you can ignore this email.`,
  ].join('\n');

  const bodyHtml = `
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 16px;">Hi ${safeName},</p>
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 24px;">${escapeHtml(copy.intro)}</p>
    <div style="margin:0 0 24px;text-align:center;">
      <div style="display:inline-block;padding:14px 24px;background:#0f1115;border:1px solid #2a2d36;border-radius:10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;letter-spacing:8px;color:#fff;font-weight:600;">
        ${escapeHtml(code)}
      </div>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0 0 8px;">
      This code expires in ${minutes} minutes.
    </p>
    <hr style="border:none;border-top:1px solid #2a2d36;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0;">
      If you didn't request this, you can safely ignore this email.
    </p>`;

  return sendMail({
    to,
    subject: copy.subject,
    text,
    html: renderShell({ tenant, heading: copy.heading, bodyHtml }),
  });
};

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendOtpEmail,
  isEmailConfigured,
};
