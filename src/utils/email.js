import nodemailer from "nodemailer";
import { createLogger, format, transports } from "winston";

// Configure Winston logger for debugging
const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/email.log" }), // Log to file for auditing
  ],
});

// Feedback email templates with absolute image URL and Outlook-compatible CSS
const FEEDBACK_TEMPLATES = {
  general: (name, email, subject, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Thank You for Your General Feedback - Kenya Votes Live</title>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      border: 2px solid #15803d;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: #15803d; /* Green */
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      font-size: 28px;
      margin: 10px 0 0;
      font-weight: 700;
    }
    .content {
      padding: 32px;
    }
    .content h2 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #15803d;
    }
    .content p {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .feedback-details {
      background-color: #ecfdf5; /* Light green */
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #15803d;
      margin-bottom: 20px;
    }
    .feedback-details p {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #15803d;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      min-height: 48px;
      border: 1px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    .button:hover {
      background: #1e40af;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .footer a {
      color: #15803d;
      text-decoration: none;
      font-weight: 600;
    }
    .icon {
      display: block;
      margin: 0 auto 10px;
    }
    .content-icon {
      display: inline-block;
      vertical-align: middle;
      margin-right: 10px;
    }
    @media screen and (max-width: 600px) {
      .container { padding: 10px; }
      .header { padding: 20px; }
      .content { padding: 20px; }
      .button { width: 100%; box-sizing: border-box; }
      .header h1 { font-size: 24px; }
      .content h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <tr>
      <td class="card">
        <table class="header" role="banner" cellpadding="0" cellspacing="0" width="100%" style="background: #15803d; padding: 30px 20px; text-align: center; color: #ffffff;">
          <tr>
            <td>
              <i data-lucide="message-square" class="icon" style="width: 48px; height: 48px; color: #ffffff;"></i>
              <h1>Thank You for Your Feedback</h1>
            </td>
          </tr>
        </table>
        <table class="content" role="main" aria-label="Main content" cellpadding="0" cellspacing="0" width="100%" style="padding: 32px;">
          <tr>
            <td>
              <i data-lucide="message-square" class="content-icon" style="width: 24px; height: 24px; color: #15803d;"></i>
              <h2>General Feedback Received</h2>
              <p>Dear ${name},</p>
              <p>Thank you for sharing your general feedback with Kenya Votes Live. We value your input as we work to provide transparent and reliable election information.</p>
              <table class="feedback-details" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; border: 1px solid #15803d; margin-bottom: 20px;">
                <tr><td><p><strong>Subject:</strong> ${subject}</p></td></tr>
                <tr><td><p><strong>Message:</strong> ${message}</p></td></tr>
              </table>
              <p>We aim to review your feedback within 24–48 hours. If you have further comments, contact us at <a href="mailto:support@kenyavotes.com" style="color: #15803d;">support@kenyavotes.com</a>.</p>
              <a href="https://www.kenyavoteslive.com" class="button" style="display: inline-block; padding: 14px 28px; background: #15803d; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; min-height: 48px; border: 1px solid #ffffff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">Visit Kenya Votes Live</a>
            </td>
          </tr>
        </table>
        <table class="footer" role="contentinfo" cellpadding="0" cellspacing="0" width="100%" style="text-align: center; padding: 24px; font-size: 12px; color: #6b7280;">
          <tr>
            <td>
              <p>Kenya Votes Live | Independent Electoral and Boundaries Commission</p>
              <p>support@kenyavotes.com | +254-700-000-000</p>
              <p><a href="${process.env.UNSUBSCRIBE_URL}?email=${email}" style="color: #15803d; text-decoration: none; font-weight: 600;">Unsubscribe</a></p>
              <p>This email complies with the IEBC Act and Kenyan Constitution (Article 88).</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>`,
  technical: (name, email, subject, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Technical Issue Reported - Kenya Votes Live</title>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      border: 2px solid #b91c1c;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: #b91c1c; /* Red */
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      font-size: 28px;
      margin: 10px 0 0;
      font-weight: 700;
    }
    .content {
      padding: 32px;
    }
    .content h2 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #b91c1c;
    }
    .content p {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .feedback-details {
      background-color: #fef2f2; /* Light red */
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #b91c1c;
      margin-bottom: 20px;
    }
    .feedback-details p {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #b91c1c;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      min-height: 48px;
      border: 1px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    .button:hover {
      background: #1e40af;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .footer a {
      color: #b91c1c;
      text-decoration: none;
      font-weight: 600;
    }
    .icon {
      display: block;
      margin: 0 auto 10px;
    }
    .content-icon {
      display: inline-block;
      vertical-align: middle;
      margin-right: 10px;
    }
    @media screen and (max-width: 600px) {
      .container { padding: 10px; }
      .header { padding: 20px; }
      .content { padding: 20px; }
      .button { width: 100%; box-sizing: border-box; }
      .header h1 { font-size: 24px; }
      .content h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <tr>
      <td class="card">
        <table class="header" role="banner" cellpadding="0" cellspacing="0" width="100%" style="background: #b91c1c; padding: 30px 20px; text-align: center; color: #ffffff;">
          <tr>
            <td>
              <i data-lucide="alert-triangle" class="icon" style="width: 48px; height: 48px; color: #ffffff;"></i>
              <h1>Technical Issue Reported</h1>
            </td>
          </tr>
        </table>
        <table class="content" role="main" aria-label="Main content" cellpadding="0" cellspacing="0" width="100%" style="padding: 32px;">
          <tr>
            <td>
              <i data-lucide="alert-triangle" class="content-icon" style="width: 24px; height: 24px; color: #b91c1c;"></i>
              <h2>We're Addressing Your Issue</h2>
              <p>Dear ${name},</p>
              <p>Thank you for reporting a technical issue with Kenya Votes Live. Our technical team is prioritizing your report and will address it within 2–6 hours.</p>
              <table class="feedback-details" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border: 1px solid #b91c1c; margin-bottom: 20px;">
                <tr><td><p><strong>Subject:</strong> ${subject}</p></td></tr>
                <tr><td><p><strong>Message:</strong> ${message}</p></td></tr>
              </table>
              <p>For urgent assistance, contact our technical support at <a href="mailto:tech@kenyavotes.com" style="color: #b91c1c;">tech@kenyavotes.com</a> or call +254-700-000-000.</p>
              <a href="https://www.kenyavoteslive.com/support" class="button" style="display: inline-block; padding: 14px 28px; background: #b91c1c; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; min-height: 48px; border: 1px solid #ffffff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">Visit Support Center</a>
            </td>
          </tr>
        </table>
        <table class="footer" role="contentinfo" cellpadding="0" cellspacing="0" width="100%" style="text-align: center; padding: 24px; font-size: 12px; color: #6b7280;">
          <tr>
            <td>
              <p>Kenya Votes Live | Independent Electoral and Boundaries Commission</p>
              <p>tech@kenyavotes.com | +254-700-000-000</p>
              <p><a href="${process.env.UNSUBSCRIBE_URL}?email=${email}" style="color: #b91c1c; text-decoration: none; font-weight: 600;">Unsubscribe</a></p>
              <p>This email complies with the IEBC Act and Kenyan Constitution (Article 88).</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>`,
  suggestion: (name, email, subject, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Suggestion Received - Kenya Votes Live</title>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      border: 2px solid #facc15;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: #facc15; /* Gold */
      padding: 30px 20px;
      text-align: center;
      color: #1f2937; /* Dark text for contrast */
    }
    .header h1 {
      font-size: 28px;
      margin: 10px 0 0;
      font-weight: 700;
    }
    .content {
      padding: 32px;
    }
    .content h2 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #facc15;
    }
    .content p {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .feedback-details {
      background-color: #fefce8; /* Light gold */
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #facc15;
      margin-bottom: 20px;
    }
    .feedback-details p {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #facc15;
      color: #1f2937;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      min-height: 48px;
      border: 1px solid #1f2937;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    .button:hover {
      background: #1e40af;
      color: #ffffff;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .footer a {
      color: #facc15;
      text-decoration: none;
      font-weight: 600;
    }
    .icon {
      display: block;
      margin: 0 auto 10px;
    }
    .content-icon {
      display: inline-block;
      vertical-align: middle;
      margin-right: 10px;
    }
    @media screen and (max-width: 600px) {
      .container { padding: 10px; }
      .header { padding: 20px; }
      .content { padding: 20px; }
      .button { width: 100%; box-sizing: border-box; }
      .header h1 { font-size: 24px; }
      .content h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <tr>
      <td class="card">
        <table class="header" role="banner" cellpadding="0" cellspacing="0" width="100%" style="background: #facc15; padding: 30px 20px; text-align: center; color: #1f2937;">
          <tr>
            <td>
              <i data-lucide="lightbulb" class="icon" style="width: 48px; height: 48px; color: #1f2937;"></i>
              <h1>Your Suggestion Received</h1>
            </td>
          </tr>
        </table>
        <table class="content" role="main" aria-label="Main content" cellpadding="0" cellspacing="0" width="100%" style="padding: 32px;">
          <tr>
            <td>
              <i data-lucide="lightbulb" class="content-icon" style="width: 24px; height: 24px; color: #facc15;"></i>
              <h2>We Value Your Ideas</h2>
              <p>Dear ${name},</p>
              <p>Thank you for sharing your suggestion with Kenya Votes Live. Your ideas help us improve our platform to better serve the public during elections.</p>
              <table class="feedback-details" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fefce8; padding: 20px; border-radius: 8px; border: 1px solid #facc15; margin-bottom: 20px;">
                <tr><td><p><strong>Subject:</strong> ${subject}</p></td></tr>
                <tr><td><p><strong>Message:</strong> ${message}</p></td></tr>
              </table>
              <p>We’ll review your suggestion within 24–48 hours. For additional feedback, contact us at <a href="mailto:support@kenyavotes.com" style="color: #facc15;">support@kenyavotes.com</a>.</p>
              <a href="https://www.kenyavoteslive.com/feedback" class="button" style="display: inline-block; padding: 14px 28px; background: #facc15; color: #1f2937; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; min-height: 48px; border: 1px solid #1f2937; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">Submit Another Suggestion</a>
            </td>
          </tr>
        </table>
        <table class="footer" role="contentinfo" cellpadding="0" cellspacing="0" width="100%" style="text-align: center; padding: 24px; font-size: 12px; color: #6b7280;">
          <tr>
            <td>
              <p>Kenya Votes Live | Independent Electoral and Boundaries Commission</p>
              <p>support@kenyavotes.com | +254-700-000-000</p>
              <p><a href="${process.env.UNSUBSCRIBE_URL}?email=${email}" style="color: #facc15; text-decoration: none; font-weight: 600;">Unsubscribe</a></p>
              <p>This email complies with the IEBC Act and Kenyan Constitution (Article 88).</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>`,
  question: (name, email, subject, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Question Received - Kenya Votes Live</title>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      line-height: 1.6;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      border: 2px solid #15803d;
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: #15803d; /* Green */
      padding: 30px 20px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      font-size: 28px;
      margin: 10px 0 0;
      font-weight: 700;
    }
    .content {
      padding: 32px;
    }
    .content h2 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #15803d;
    }
    .content p {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .feedback-details {
      background-color: #ecfdf5; /* Light green */
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #15803d;
      margin-bottom: 20px;
    }
    .feedback-details p {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #15803d;
      color: #ffffff;
      text-decoration: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      text-align: center;
      min-height: 48px;
      border: 1px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    .button:hover {
      background: #1e40af;
    }
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #6b7280;
    }
    .footer a {
      color: #15803d;
      text-decoration: none;
      font-weight: 600;
    }
    .icon {
      display: block;
      margin: 0 auto 10px;
    }
    .content-icon {
      display: inline-block;
      vertical-align: middle;
      margin-right: 10px;
    }
    @media screen and (max-width: 600px) {
      .container { padding: 10px; }
      .header { padding: 20px; }
      .content { padding: 20px; }
      .button { width: 100%; box-sizing: border-box; }
      .header h1 { font-size: 24px; }
      .content h2 { font-size: 22px; }
    }
  </style>
</head>
<body>
  <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; padding: 20px;">
    <tr>
      <td class="card">
        <table class="header" role="banner" cellpadding="0" cellspacing="0" width="100%" style="background: #15803d; padding: 30px 20px; text-align: center; color: #ffffff;">
          <tr>
            <td>
              <i data-lucide="help-circle" class="icon" style="width: 48px; height: 48px; color: #ffffff;"></i>
              <h1>Your Question Received</h1>
            </td>
          </tr>
        </table>
        <table class="content" role="main" aria-label="Main content" cellpadding="0" cellspacing="0" width="100%" style="padding: 32px;">
          <tr>
            <td>
              <i data-lucide="help-circle" class="content-icon" style="width: 24px; height: 24px; color: #15803d;"></i>
              <h2>We’re Here to Help</h2>
              <p>Dear ${name},</p>
              <p>Thank you for your question about Kenya Votes Live. We’re committed to providing clear answers to support your engagement with the election process.</p>
              <table class="feedback-details" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ecfdf5; padding: 20px; border-radius: 8px; border: 1px solid #15803d; margin-bottom: 20px;">
                <tr><td><p><strong>Subject:</strong> ${subject}</p></td></tr>
                <tr><td><p><strong>Question:</strong> ${message}</p></td></tr>
              </table>
              <p>We’ll respond within 24–48 hours. For immediate assistance, contact <a href="mailto:support@kenyavotes.com" style="color: #15803d;">support@kenyavotes.com</a> or visit our FAQ.</p>
              <a href="https://www.kenyavoteslive.com/faq" class="button" style="display: inline-block; padding: 14px 28px; background: #15803d; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; min-height: 48px; border: 1px solid #ffffff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">View FAQ</a>
            </td>
          </tr>
        </table>
        <table class="footer" role="contentinfo" cellpadding="0" cellspacing="0" width="100%" style="text-align: center; padding: 24px; font-size: 12px; color: #6b7280;">
          <tr>
            <td>
              <p>Kenya Votes Live | Independent Electoral and Boundaries Commission</p>
              <p>support@kenyavotes.com | +254-700-000-000</p>
              <p><a href="${process.env.UNSUBSCRIBE_URL}?email=${email}" style="color: #15803d; text-decoration: none; font-weight: 600;">Unsubscribe</a></p>
              <p>This email complies with the IEBC Act and Kenyan Constitution (Article 88).</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <script>
    lucide.createIcons();
  </script>
</body>
</html>`,
};

export async function sendFeedbackEmail({
  name,
  email,
  type,
  subject,
  message,
}) {
  // Validate inputs
  if (!name || !email || !type || !subject || !message) {
    logger.error("Invalid feedback email inputs", {
      name,
      email,
      type,
      subject,
      message,
    });
    throw new Error("All feedback fields are required");
  }
  if (!FEEDBACK_TEMPLATES[type]) {
    logger.error("Invalid feedback type", { type });
    throw new Error(`Invalid feedback type: ${type}`);
  }

  // Validate environment variables
  const requiredEnvVars = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "BACKEND_URL",
    "UNSUBSCRIBE_URL",
  ];
  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );
  if (missingEnvVars.length > 0) {
    logger.error("Missing environment variables", { missing: missingEnvVars });
    throw new Error(
      `Missing environment variables: ${missingEnvVars.join(", ")}`
    );
  }

  // Generate HTML
  const html = FEEDBACK_TEMPLATES[type](name, email, subject, message);
  logger.info("Generated email HTML", { type, email, length: html.length });

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: `Your ${type.charAt(0).toUpperCase() + type.slice(1)} Submission - Kenya Votes Live`,
      html,
      text: html.replace(/<[^>]+>/g, ""), // Generate plain text fallback
    });
    logger.info("Feedback email sent successfully", {
      to: email,
      type,
      subject,
    });
  } catch (error) {
    logger.error("Failed to send feedback email", {
      error: error.message,
      to: email,
      type,
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// Optional: Export sendEmail for other use cases (e.g., non-feedback emails)
export async function sendEmail({ to, subject, html, text }) {
  // Validate inputs
  if (!to || !subject || !html) {
    logger.error("Invalid email inputs", { to, subject });
    throw new Error("All email fields are required");
  }

  // Validate environment variables
  const requiredEnvVars = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ];
  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );
  if (missingEnvVars.length > 0) {
    logger.error("Missing environment variables", { missing: missingEnvVars });
    throw new Error(
      `Missing environment variables: ${missingEnvVars.join(", ")}`
    );
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""),
    });
    logger.info("Email sent successfully", { to, subject });
  } catch (error) {
    logger.error("Failed to send email", { error: error.message, to, subject });
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
