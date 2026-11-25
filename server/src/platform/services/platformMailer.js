/**
 * Platform sign-in email.
 *
 * Goes through the same mailer as the company OTP emails (utils/email.js),
 * which takes its settings only from env (RESEND_API_KEY, EMAIL_FROM,
 * EMAIL_DEV_LOG): no tenant settings and no req.dbConnection are involved.
 *
 * EMAIL_DEV_LOG=true makes the mailer print the email, code included, to the
 * console instead of sending it. That is allowed for platform codes only when
 * NODE_ENV is not 'production'; in production the send is refused, so a
 * platform code can never end up in production logs.
 */
const { sendMail, renderShell, escapeHtml, isDevLogMode } = require('../../utils/email');

const PLATFORM_LOGIN_SUBJECT = 'LogiForce platform sign-in code';

// Same look as sendOtpEmail in utils/email.js.
const buildPlatformLoginEmail = ({ name, code, expiresAt, expiresMinutes, ip }) => {
  const expiresText = `${expiresAt.toUTCString()} (${expiresMinutes} minutes from the request)`;
  const ipText = ip || 'unknown';

  const text = [
    `Hi ${name || 'there'},`,
    '',
    'Use the code below to finish signing in to the LogiForce platform console.',
    '',
    `Your sign-in code: ${code}`,
    '',
    `This code expires at ${expiresText}.`,
    `Requested from IP address ${ipText}.`,
    '',
    'If you did not just sign in, someone else knows your platform password. Reset it now and tell the other '
      + 'platform owners.',
  ].join('\n');

  const bodyHtml = `
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 16px;">Hi ${escapeHtml(name || 'there')},</p>
    <p style="font-size:14px;line-height:1.6;color:#c8c8cc;margin:0 0 24px;">Use the code below to finish signing in to the LogiForce platform console.</p>
    <div style="margin:0 0 24px;text-align:center;">
      <div style="display:inline-block;padding:14px 24px;background:#0f1115;border:1px solid #2a2d36;border-radius:10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:28px;letter-spacing:8px;color:#fff;font-weight:600;">
        ${escapeHtml(code)}
      </div>
    </div>
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0 0 8px;">
      This code expires at ${escapeHtml(expiresText)}.
    </p>
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0 0 8px;">
      Requested from IP address ${escapeHtml(ipText)}.
    </p>
    <hr style="border:none;border-top:1px solid #2a2d36;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.6;color:#888;margin:0;">
      If you did not just sign in, someone else knows your platform password. Reset it now and tell the other platform owners.
    </p>`;

  return {
    subject: PLATFORM_LOGIN_SUBJECT,
    text,
    html: renderShell({ tenant: 'LogiForce Platform', heading: 'Platform sign-in', bodyHtml }),
  };
};

/**
 * Email a platform sign-in code. Throws if the email can't be sent.
 */
const sendPlatformLoginCode = async ({ to, name, code, expiresAt, expiresMinutes, ip }) => {
  if (isDevLogMode() && process.env.NODE_ENV === 'production') {
    throw new Error('EMAIL_DEV_LOG=true would print the platform sign-in code to the production logs. '
      + 'Turn EMAIL_DEV_LOG off and configure RESEND_API_KEY.');
  }
  const message = buildPlatformLoginEmail({ name, code, expiresAt, expiresMinutes, ip });
  return sendMail({ to, ...message });
};

module.exports = {
  PLATFORM_LOGIN_SUBJECT,
  buildPlatformLoginEmail,
  sendPlatformLoginCode,
};
