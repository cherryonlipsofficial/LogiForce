const logger = require('./logger');

// Email delivery uses Resend (https://resend.com) — an HTTP API. There is no
// SMTP server to point at: just set RESEND_API_KEY and the app sends mail.
//
// IMPORTANT: the shared "onboarding@resend.dev" sender is restricted by Resend
// to a single recipient — the email address that owns the API key. To send to
// any other recipient you MUST verify your own domain at resend.com/domains
// and set EMAIL_FROM to an address on that domain.
//
// For local development without a verified domain, set EMAIL_DEV_LOG=true to
// log emails (including OTP codes) to the server console instead of calling
// Resend. This lets the registration / password-reset flows complete end to
// end without sending real mail.

const isDevLogMode = () =>
  String(process.env.EMAIL_DEV_LOG || '').toLowerCase() === 'true';

let resendClient = null;
let providerError = null;

const initProvider = () => {
  if (resendClient) return;
  if (isDevLogMode()) return; // Dev-log mode bypasses Resend entirely.

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    providerError = 'Email service is not configured. Set RESEND_API_KEY (https://resend.com) or EMAIL_DEV_LOG=true for local development.';
    logger.warn(providerError);
    return;
  }

  // Lazy-load so apps that haven't installed the dep can still boot.
  const { Resend } = require('resend');
  resendClient = new Resend(apiKey);
  providerError = null;
  logger.info('Email provider: Resend (HTTP API)');
};

const isEmailConfigured = () => {
  if (isDevLogMode()) return true;
  initProvider();
  return Boolean(resendClient);
};

const defaultFromAddress = () =>
  process.env.EMAIL_FROM || 'LogiForce <onboarding@resend.dev>';

// Resend rejects sends to non-owner addresses when the API key has no verified
// domain. The message is verbose; rewrite it to something actionable.
const isResendTestingModeError = (msg = '') =>
  /only send testing emails to your own email address/i.test(msg) ||
  /verify a domain at resend\.com\/domains/i.test(msg);

/**
 * Send an email. Throws on failure so callers can roll back any state they
 * persisted in anticipation of the email going out (reset tokens, OTPs).
 */
const sendMail = async ({ to, subject, html, text }) => {
  if (isDevLogMode()) {
    logger.warn('EMAIL_DEV_LOG: email not sent — logged to console instead', {
      to,
      subject,
      text,
    });
    return { id: 'dev-log', devLog: true };
  }

  initProvider();
  if (!resendClient) {
    throw new Error(providerError || 'Email service is not configured');
  }

  const from = defaultFromAddress();
  const { data, error } = await resendClient.emails.send({ from, to, subject, html, text });
  if (error) {
    const raw = error.message || 'Resend rejected the email';
    if (isResendTestingModeError(raw)) {
      throw new Error(
        'Resend is in testing mode for this API key, so it can only send to the account owner. Verify a domain at resend.com/domains and set EMAIL_FROM to an address on that domain, or set EMAIL_DEV_LOG=true on the server to log emails to the console for local development.',
      );
    }
    throw new Error(raw);
  }
  logger.info('Email sent', { to, subject, id: data?.id });
  return data;
};

const escapeHtml = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Shared inline-styled wrapper. CSS is inlined because most email clients
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
    verify_email:    { subject: `Verify your ${tenant} email`,        heading: 'Verify your email',       intro: 'Use the code below to verify your email address and activate your account.' },
    login:           { subject: `Your ${tenant} sign-in code`,        heading: 'Sign in to your account', intro: 'Use the code below to sign in.' },
    password_reset:  { subject: `Your ${tenant} password reset code`, heading: 'Reset your password',     intro: 'Use the code below to choose a new password.' },
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
