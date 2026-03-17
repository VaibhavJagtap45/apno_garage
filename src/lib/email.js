// src/lib/email.js
const nodemailer = require("nodemailer");
const { env } = require("../config/env");
const { logger } = require("./logger");

function createTransport() {
  // Production: SendGrid
  if (env.SENDGRID_API_KEY) {
    logger.info({ type: "EMAIL_TRANSPORT", provider: "SendGrid" });
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: { user: "apikey", pass: env.SENDGRID_API_KEY },
    });
  }

  // Gmail (or any SMTP) with App Password
  if (env.SMTP_USER && env.SMTP_HOST === "smtp.gmail.com") {
    logger.info({
      type: "EMAIL_TRANSPORT",
      provider: "Gmail",
      user: env.SMTP_USER,
    });
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS — NOT SSL, port 587 not 465
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      tls: { rejectUnauthorized: false },
    });
  }

  // Generic SMTP fallback (Mailhog / Mailtrap / other)
  logger.info({
    type: "EMAIL_TRANSPORT",
    provider: "SMTP",
    host: env.SMTP_HOST ?? "localhost",
  });
  return nodemailer.createTransport({
    host: env.SMTP_HOST ?? "localhost",
    port: env.SMTP_PORT ?? 1025,
    secure: false,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
}

// Build transporter lazily so env is fully loaded
let _transporter = null;
function getTransporter() {
  if (!_transporter) _transporter = createTransport();
  return _transporter;
}

// Auto-derive SMTP_FROM if not set — use SMTP_USER
function getFromAddress() {
  if (env.SMTP_FROM) return env.SMTP_FROM;
  if (env.SMTP_USER) return `GarBlaz <${env.SMTP_USER}>`;
  return "GarBlaz <noreply@garblaz.com>";
}

async function sendOtpEmail(to, otp, userName) {
  try {
    const info = await getTransporter().sendMail({
      from: getFromAddress(),
      to,
      subject: "Your GarBlaz Login OTP",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#1d4ed8">GarBlaz Login</h2>
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Your one-time password is:</p>
          <div style="font-size:2rem;font-weight:bold;letter-spacing:0.3em;background:#f3f4f6;padding:16px;text-align:center;border-radius:6px;margin:16px 0">
            ${otp}
          </div>
          <p style="color:#6b7280;font-size:0.875rem">
            This OTP expires in 5 minutes. Do not share it with anyone.
          </p>
          <p style="color:#6b7280;font-size:0.875rem">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    logger.info({ type: "OTP_EMAIL_SENT", to, messageId: info.messageId });
  } catch (err) {
    logger.error({ type: "OTP_EMAIL_FAILED", to, error: err.message });
    throw new Error("Failed to send OTP email. Please try again.");
  }
}

async function sendNotificationEmail({ to, subject, body }) {
  try {
    const info = await getTransporter().sendMail({
      from: getFromAddress(),
      to,
      subject,
      text: body,
    });
    logger.info({
      type: "NOTIFICATION_EMAIL_SENT",
      to,
      subject,
      messageId: info.messageId,
    });
  } catch (err) {
    logger.error({ type: "NOTIFICATION_EMAIL_FAILED", error: err.message });
    throw err;
  }
}

// Verify SMTP connection on startup (non-fatal)
async function verifyEmailTransport() {
  try {
    await getTransporter().verify();
    logger.info({ type: "EMAIL_TRANSPORT_OK", from: getFromAddress() });
  } catch (err) {
    logger.warn({
      type: "EMAIL_TRANSPORT_WARN",
      error: err.message,
      hint: "Emails will fail at send time",
    });
  }
}

module.exports = { sendOtpEmail, sendNotificationEmail, verifyEmailTransport };
