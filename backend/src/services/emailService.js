const nodemailer = require('nodemailer');

/**
 * SMTP-backed email service. In the local stack this points at Mailpit
 * (host: mailpit, port: 1025, no auth). The transport is created lazily on the
 * first send so simply constructing the service (e.g. during createApp wiring)
 * never opens a socket.
 */
function createEmailService({ env }) {
  let transport = null;

  function getTransport() {
    if (transport) return transport;
    const options = {
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
    };
    // Mailpit needs no auth; only configure credentials when a user is set.
    if (env.smtpUser) {
      options.auth = { user: env.smtpUser, pass: env.smtpPass || '' };
    }
    transport = nodemailer.createTransport(options);
    return transport;
  }

  async function sendMail({ to, subject, html, text }) {
    const t = getTransport();
    return t.sendMail({
      from: env.smtpFrom,
      to,
      subject,
      html,
      text,
    });
  }

  return { sendMail };
}

/**
 * Build the HTML/text body for the "set your password" email. The link already
 * carries the single-use token; plaintext passwords are never included.
 */
function renderSetPasswordEmail(link) {
  const text = `Welcome to AIVES. Set your password using the link below:\n\n${link}\n\nThis link will expire soon. If you did not expect this email you can ignore it.`;
  const html = `<p>Welcome to AIVES.</p>`
    + `<p>Set your password using the link below:</p>`
    + `<p><a href="${link}">${link}</a></p>`
    + `<p>This link will expire soon. If you did not expect this email you can ignore it.</p>`;
  return { subject: 'Set your AIVES password', text, html };
}

/**
 * Build the HTML/text body for the "reset your password" email.
 */
function renderResetPasswordEmail(link) {
  const text = `We received a request to reset your AIVES password. Use the link below to choose a new one:\n\n${link}\n\nThis link will expire soon. If you did not request this you can ignore it.`;
  const html = `<p>We received a request to reset your AIVES password.</p>`
    + `<p>Use the link below to choose a new one:</p>`
    + `<p><a href="${link}">${link}</a></p>`
    + `<p>This link will expire soon. If you did not request this you can ignore it.</p>`;
  return { subject: 'Reset your AIVES password', text, html };
}

module.exports = {
  createEmailService,
  renderSetPasswordEmail,
  renderResetPasswordEmail,
};
