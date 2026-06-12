import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createTransport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export async function sendMail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; path: string }[];
}) {
  const transport = createTransport();
  if (!transport) {
    console.warn('[mailer] SMTP not configured — skipping email to', options.to);
    return null;
  }
  return transport.sendMail({ from: env.SMTP_FROM, ...options });
}

export async function sendReportEmail(options: {
  to: string;
  subject: string;
  body: string;
  pdfPath: string;
  pdfFilename: string;
}) {
  return sendMail({
    to: options.to,
    subject: options.subject,
    text: options.body,
    html: `<p>${options.body.replace(/\n/g, '<br>')}</p>`,
    attachments: [{ filename: options.pdfFilename, path: options.pdfPath }],
  });
}

export async function sendInviteEmail(options: {
  to: string;
  companyName: string;
  acceptUrl: string;
}) {
  return sendMail({
    to: options.to,
    subject: `Invitație la ${options.companyName}`,
    text: `Ai fost invitat în ${options.companyName}.\n\nActivează contul și setează parola aici:\n${options.acceptUrl}\n\nLinkul expiră în 7 zile.`,
    html: `<p>Ai fost invitat în <strong>${options.companyName}</strong>.</p><p><a href="${options.acceptUrl}">Activează contul și setează parola</a></p><p>Linkul expiră în 7 zile.</p>`,
  });
}
