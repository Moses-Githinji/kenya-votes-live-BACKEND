import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src",
  "templates",
  "email-template.html"
);

// Helper to replace {{placeholders}} in the template
function fillTemplate(template, data) {
  return template.replace(/{{(\w+)}}/g, (_, key) =>
    data[key] !== undefined ? data[key] : ""
  );
}

export async function sendEmail({
  to,
  subject,
  templateData = {},
  text = undefined,
}) {
  // Load and fill the HTML template
  let html = await fs.readFile(TEMPLATE_PATH, "utf-8");
  const now = new Date();
  const defaultData = {
    email_subject: subject,
    current_year: now.getFullYear(),
    backend_url: process.env.BACKEND_URL || "http://localhost:4000",
    preferences_url: process.env.PREFERENCES_URL || "#",
    unsubscribe_url: process.env.UNSUBSCRIBE_URL || "#",
    feedback_url: process.env.FEEDBACK_URL || "#",
  };
  html = fillTemplate(html, { ...defaultData, ...templateData });

  // Fallback plain text
  if (!text) text = html.replace(/<[^>]+>/g, "");

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  // Send email
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
    text,
  });
}
