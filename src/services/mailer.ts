import nodemailer from "nodemailer";
import { env, mailEnabled } from "../config/env";

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function layout(title: string, bodyHtml: string, link: string, button: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#22301f">
  <h2 style="color:#163d2c;margin:0 0 12px">Deemona Rasoi</h2>
  <h3 style="margin:0 0 12px">${esc(title)}</h3>
  ${bodyHtml}
  <p style="margin:24px 0"><a href="${link}" style="background:#256b4e;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;display:inline-block">${esc(button)}</a></p>
  <p style="font-size:12px;color:#6e7568">If the button doesn't work, paste this link into your browser:<br>${esc(link)}</p>
  <p style="font-size:12px;color:#6e7568">Deemona Global Solutions, New Delhi 110075, India</p></div>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!mailEnabled) {
    console.log(`[mail] SMTP not configured. Would send to ${to}: ${subject}\n${text}`);
    return;
  }
  await getTransport().sendMail({ from: env.MAIL_FROM, to, subject, html, text });
}

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const link = `${env.FRONTEND_URL}/?verify=${token}`;
  await send(
    to,
    "Verify your email for Deemona Rasoi",
    layout("Verify your email", `<p>Hi ${esc(name || "there")}, please confirm this email address to finish creating your account. The link works for 24 hours.</p>`, link, "Verify email"),
    `Hi ${name || "there"}, verify your email (valid 24 hours): ${link}`
  );
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = `${env.FRONTEND_URL}/?reset=${token}`;
  await send(
    to,
    "Reset your Deemona Rasoi password",
    layout("Reset your password", `<p>Hi ${esc(name || "there")}, we received a request to reset your password. The link works for 1 hour. If you didn't ask for this, you can ignore this email; your password won't change.</p>`, link, "Reset password"),
    `Reset your password (valid 1 hour): ${link}\nIf you didn't request this, ignore this email.`
  );
}
