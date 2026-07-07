const nodemailer = require('nodemailer');

let transport;
function getTransport() {
  if (transport !== undefined) return transport;
  if (!process.env.SMTP_HOST) { transport = null; return null; }
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/**
 * Verschickt den Magic-Link. Ohne SMTP-Konfiguration → Konsolen-Fallback (Dev/Test),
 * kein Wurf. Gibt { sent, url } zurück.
 */
async function sendMagicLink(email, url) {
  const t = getTransport();
  if (!t) {
    console.log(`[mailer] Kein SMTP — Magic-Link für ${email}: ${url}`);
    return { sent: false, url };
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || 'Dienstplan-Pro <noreply@localhost>',
    to: email,
    subject: 'Dein Login-Link für Dienstplan-Pro',
    text: `Hallo,\n\nhier ist dein einmaliger Login-Link (30 Minuten gültig):\n${url}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
  });
  return { sent: true, url };
}

module.exports = { sendMagicLink, getTransport };
