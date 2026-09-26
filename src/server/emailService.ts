import nodemailer from 'nodemailer';

export interface SendEmailResult {
  delivered: boolean;
  provider: 'resend' | 'sendgrid' | 'smtp' | 'dev_terminal';
}

function buildVerificationEmailHtml(code: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background-color: #09090b; color: #f4f4f5; border-radius: 16px; border: 1px solid #27272a;">
      <div style="margin-bottom: 24px;">
        <span style="display: inline-block; padding: 6px 12px; background-color: rgba(20, 184, 166, 0.15); border: 1px solid rgba(20, 184, 166, 0.3); color: #2dd4bf; border-radius: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">
          Caloriq Verification
        </span>
      </div>
      <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff;">
        Verify your email address
      </h1>
      <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 24px 0;">
        Enter the 6-digit verification code below in Caloriq to complete your sign-up and sync your account:
      </p>
      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2dd4bf;">
          ${code}
        </span>
      </div>
      <p style="font-size: 12px; line-height: 1.5; color: #71717a; margin: 0;">
        This code expires in <strong>10 minutes</strong>. If you did not request this code, you can safely ignore this email.
      </p>
    </div>
  `;
}

function buildVerificationEmailText(code: string): string {
  return `Your Caloriq verification code is: ${code}\n\nEnter this 6-digit code in the app to verify your email and sign in. This code expires in 10 minutes.`;
}

export async function sendVerificationEmail(toEmail: string, code: string): Promise<SendEmailResult> {
  const recipient = toEmail.trim();
  const isDev = process.env.NODE_ENV !== 'production';

  // While in development on local machine only, log the code in the terminal — never in the app UI
  if (isDev) {
    console.log(`\n========================================`);
    console.log(`[Caloriq Auth] Verification code for ${recipient}: ${code}`);
    console.log(`[Caloriq Auth] Expires in 10 minutes`);
    console.log(`========================================\n`);
  }

  const subject = `${code} is your Caloriq verification code`;
  const html = buildVerificationEmailHtml(code);
  const text = buildVerificationEmailText(code);

  // 1. Resend API (https://resend.com)
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey && resendApiKey !== 'MY_RESEND_API_KEY') {
    const fromAddress = process.env.RESEND_FROM_EMAIL?.trim() || 'Caloriq <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject,
        html,
        text
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMessage = (errBody as any)?.message || `Resend API error (${response.status})`;
      throw new Error(`Failed to send verification email: ${errMessage}`);
    }

    return { delivered: true, provider: 'resend' };
  }

  // 2. SendGrid API (https://sendgrid.com)
  const sendgridApiKey = process.env.SENDGRID_API_KEY?.trim();
  if (sendgridApiKey && sendgridApiKey !== 'MY_SENDGRID_API_KEY') {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() || 'noreply@caloriq.app';
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: recipient }]
          }
        ],
        from: {
          email: fromEmail,
          name: 'Caloriq'
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const firstErr = (errBody as any)?.errors?.[0]?.message || `SendGrid API error (${response.status})`;
      throw new Error(`Failed to send verification email: ${firstErr}`);
    }

    return { delivered: true, provider: 'sendgrid' };
  }

  // 3. Standard SMTP via Nodemailer (e.g. Gmail App Password, SendGrid SMTP, Resend SMTP, AWS SES)
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpHost && smtpUser && smtpPass) {
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    const fromAddress = process.env.SMTP_FROM_EMAIL?.trim() || smtpUser;
    await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject,
      text,
      html
    });

    return { delivered: true, provider: 'smtp' };
  }

  if (isDev) {
    return { delivered: true, provider: 'dev_terminal' };
  }

  throw new Error(
    'Email service is not configured. Please set RESEND_API_KEY or SENDGRID_API_KEY in your environment variables.'
  );
}
