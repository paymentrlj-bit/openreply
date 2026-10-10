import nodemailer from "nodemailer";
import type { EngageConfig } from "./config";

/**
 * Emails the owner. Uses the same SMTP settings as sign-in emails
 * (EMAIL_SERVER and EMAIL_FROM) and the address in ENGAGE_ALERT_EMAIL.
 * Returns false, without throwing, when email is not set up or sending fails.
 */
export async function notifyOwner(
  config: Pick<EngageConfig, "alertEmail">,
  subject: string,
  body: string
): Promise<boolean> {
  if (!config.alertEmail) return false;
  const server = process.env.EMAIL_SERVER;
  if (!server) {
    console.warn("[Engage] EMAIL_SERVER is not set, so no alert email was sent");
    return false;
  }
  try {
    const transport = nodemailer.createTransport(server);
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? config.alertEmail,
      to: config.alertEmail,
      subject,
      text: body,
    });
    return true;
  } catch (error) {
    console.error(
      "[Engage] Alert email failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return false;
  }
}
