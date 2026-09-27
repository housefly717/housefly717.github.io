import crypto from 'crypto';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Caloriq <onboarding@resend.dev>';

interface VerificationEntry {
  email: string;
  code: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
  locked: boolean;
}

interface PasswordResetEntry {
  email: string;
  token: string;
  expiresAt: number;
  lastSentAt: number;
}

const verificationStore = new Map<string, VerificationEntry>();
const passwordResetStore = new Map<string, PasswordResetEntry>();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_VERIFY_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function sendResendEmail(payload: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Couldn't send the email. Try again in a minute.");
  }

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        html: payload.html
      })
    });
  } catch {
    throw new Error("Couldn't send the email. Try again in a minute.");
  }

  if (!response.ok) {
    throw new Error("Couldn't send the email. Try again in a minute.");
  }
}

export async function createAndSendVerificationCode(rawEmail: string): Promise<{
  sent: boolean;
  resendCooldownSeconds: number;
}> {
  const email = rawEmail.toLowerCase().trim();
  const now = Date.now();
  const existing = verificationStore.get(email);

  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    const err: any = new Error(`Please wait ${waitSec}s before tapping Resend.`);
    err.retryAfterSeconds = waitSec;
    err.status = 429;
    throw err;
  }

  const code = crypto.randomInt(100000, 1000000).toString();

  const text = `Your Caloriq verification code is: ${code}\n\nThis code expires in 10 minutes.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; background-color: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 12px 0;">Your Caloriq verification code</p>
      <div style="font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #2dd4bf; background-color: #18181b; padding: 14px 18px; border-radius: 12px; text-align: center; border: 1px solid #27272a; margin-bottom: 16px;">
        ${code}
      </div>
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">This code expires in 10 minutes.</p>
    </div>
  `.trim();

  await sendResendEmail({
    to: email,
    subject: 'Your Caloriq verification code',
    text,
    html
  });

  verificationStore.set(email, {
    email,
    code,
    expiresAt: now + CODE_TTL_MS,
    lastSentAt: now,
    attempts: 0,
    locked: false
  });

  return {
    sent: true,
    resendCooldownSeconds: 30
  };
}

export function validateVerificationCode(rawEmail: string, submittedCode: string): void {
  const email = rawEmail.toLowerCase().trim();
  const cleanCode = String(submittedCode || '').trim();
  const entry = verificationStore.get(email);

  if (!entry) {
    const err: any = new Error('That code has expired. Tap Resend.');
    err.reason = 'expired';
    throw err;
  }

  if (entry.locked || entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    const err: any = new Error('Too many attempts. This code is locked. Tap Resend for a new code.');
    err.reason = 'locked';
    err.locked = true;
    err.attemptsRemaining = 0;
    throw err;
  }

  if (Date.now() > entry.expiresAt) {
    verificationStore.delete(email);
    const err: any = new Error('That code has expired. Tap Resend.');
    err.reason = 'expired';
    throw err;
  }

  if (entry.code !== cleanCode) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      entry.locked = true;
      verificationStore.set(email, entry);
      const lockErr: any = new Error('Too many attempts. This code is locked. Tap Resend for a new code.');
      lockErr.reason = 'locked';
      lockErr.locked = true;
      lockErr.attemptsRemaining = 0;
      throw lockErr;
    }

    verificationStore.set(email, entry);
    const wrongErr: any = new Error("That code isn't right. Check your email and try again.");
    wrongErr.reason = 'invalid_code';
    wrongErr.attemptsRemaining = MAX_VERIFY_ATTEMPTS - entry.attempts;
    throw wrongErr;
  }

  // Validated — remove code so it cannot be reused
  verificationStore.delete(email);
}

export async function sendWelcomeEmail(rawEmail: string): Promise<void> {
  const email = rawEmail.toLowerCase().trim();
  const line = 'Welcome to Caloriq. Log your first meal to start your streak.';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; background-color: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <p style="font-size: 14px; color: #f4f4f5; line-height: 1.6; margin: 0;">${line}</p>
    </div>
  `.trim();

  await sendResendEmail({
    to: email,
    subject: 'Welcome to Caloriq',
    text: line,
    html
  });
}

export async function createAndSendPasswordResetEmail(
  rawEmail: string,
  appOrigin: string
): Promise<{ sent: boolean }> {
  const email = rawEmail.toLowerCase().trim();
  const now = Date.now();
  const token = crypto.randomBytes(24).toString('hex');
  const baseUrl = (process.env.APP_URL || appOrigin || 'http://localhost:3000').replace(/\/+$/, '');
  const resetLink = `${baseUrl}/?resetToken=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const text = `Reset your Caloriq password using this link:\n\n${resetLink}\n\nThis link expires in 30 minutes.`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; background-color: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <p style="font-size: 14px; color: #a1a1aa; margin: 0 0 16px 0;">Reset your Caloriq password</p>
      <div style="margin-bottom: 16px;">
        <a href="${resetLink}" style="display: inline-block; background-color: #14b8a6; color: #09090b; font-weight: 600; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 10px;">
          Reset password
        </a>
      </div>
      <p style="font-size: 12px; color: #71717a; word-break: break-all; margin: 0 0 12px 0;">${resetLink}</p>
      <p style="font-size: 13px; color: #a1a1aa; margin: 0;">This link expires in 30 minutes.</p>
    </div>
  `.trim();

  await sendResendEmail({
    to: email,
    subject: 'Reset your Caloriq password',
    text,
    html
  });

  passwordResetStore.set(email, {
    email,
    token,
    expiresAt: now + RESET_TOKEN_TTL_MS,
    lastSentAt: now
  });

  return { sent: true };
}

export function validateAndConsumePasswordResetToken(rawEmail: string, submittedToken: string): void {
  const email = rawEmail.toLowerCase().trim();
  const cleanToken = String(submittedToken || '').trim();
  const entry = passwordResetStore.get(email);

  if (!entry || Date.now() > entry.expiresAt) {
    passwordResetStore.delete(email);
    throw new Error('That reset link has expired. Request a new one.');
  }

  if (entry.token !== cleanToken) {
    throw new Error('Invalid password reset link. Request a new one.');
  }

  passwordResetStore.delete(email);
}
