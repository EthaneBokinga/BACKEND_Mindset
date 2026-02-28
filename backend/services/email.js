const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  }
});

const FROM = process.env.EMAIL_FROM || 'bokingaethanenathan@gmail.com';

function baseTemplate(content, title) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f0f0f0;margin:0;padding:20px}
    .container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden}
    .header{background:#0D0D0D;padding:30px 40px;text-align:center}
    .header h1{color:#D4A017;font-size:22px;margin:10px 0 0}
    .body{padding:30px 40px;color:#333;line-height:1.6}
    .badge{background:#C0392B;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold}
    .amount-box{background:#f8f4e8;border-left:4px solid #D4A017;padding:15px 20px;border-radius:8px;margin:20px 0}
    .btn{display:inline-block;background:#C0392B;color:#fff!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0}
    .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0}
    .footer{background:#0D0D0D;padding:20px 40px;text-align:center;color:#666;font-size:12px}
    .footer a{color:#D4A017;text-decoration:none}
  </style></head><body>
  <div class="container">
    <div class="header"><h1>📚 Mindset Entrepreneurs</h1></div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© 2026 Mindset Entrepreneurs • <a href="mailto:bokingaethanenathan@gmail.com">bokingaethanenathan@gmail.com</a></p>
      <p>Powered by <strong style="color:#D4A017">Ethane Nathan Bokinga</strong></p>
    </div>
  </div></body></html>`;
}

async function sendMail(to, subject, html) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log('✅ Email envoyé à ' + to);
  } catch (err) {
    console.error('❌ Erreur email:', err.message);
  }
}

async function sendWelcomeEmail(user) {
  const content = `<h2>Bienvenue, <strong>${user.full_name}</strong> ! 🎉</h2>
    <p>Votre compte Mindset Entrepreneurs a été créé avec succès.</p>
    <p>Bonne lecture !<br><strong>L'équipe Mindset Entrepreneurs</strong></p>`;
  return sendMail(user.email, '🎉 Bienvenue sur Mindset Entrepreneurs !', baseTemplate(content, 'Bienvenue'));
}

async function sendOrderConfirmationEmail(order, items) {
  const itemsList = items.map(i =>
    `<div class="info-row"><span style="color:#888">${i.title}</span><span style="font-weight:600">${Number(i.price).toLocaleString()} FCFA</span></div>`
  ).join('');
  const payInfo = order.payment_method === 'whatsapp'
    ? `<div style="background:#e8f4e8;border-left:4px solid #27ae60;padding:15px;border-radius:8px;margin:20px 0">
        <strong>💬 WhatsApp : +242 06 106 73 02</strong><br>
        Mentionnez le N° : <strong>${order.order_number}</strong></div>`
    : `<div style="background:#e8f4f8;border-left:4px solid #2980b9;padding:15px;border-radius:8px;margin:20px 0">
        <strong>📱 Mobile Money</strong><br>
        Numéro : <strong>0610673 02</strong> — Nom : <strong>RUBEN MERED</strong><br>
        Montant : <strong>${Number(order.total_amount).toLocaleString()} FCFA</strong></div>`;
  const content = `<h2>Commande reçue ✅</h2>
    <p>Bonjour <strong>${order.user_name}</strong>,</p>
    <div class="amount-box">N° commande : <strong>${order.order_number}</strong></div>
    ${itemsList}
    <div class="info-row"><span><strong>Total</strong></span>
    <span><strong>${Number(order.total_amount).toLocaleString()} FCFA</strong></span></div>
    ${payInfo}
    <p>Joignez votre capture de paiement dans votre espace commande.</p>`;
  return sendMail(order.user_email, `📦 Commande ${order.order_number}`, baseTemplate(content, 'Commande'));
}

async function sendAdminOrderNotification(order, items) {
  const itemsList = items.map(i =>
    `<div class="info-row"><span style="color:#888">${i.title}</span><span style="font-weight:600">${Number(i.price).toLocaleString()} FCFA</span></div>`
  ).join('');
  const content = `<span class="badge">NOUVELLE COMMANDE</span>
    <h2>Commande #${order.order_number}</h2>
    <div class="info-row"><span style="color:#888">Client</span><span style="font-weight:600">${order.user_name}</span></div>
    <div class="info-row"><span style="color:#888">Email</span><span style="font-weight:600">${order.user_email}</span></div>
    <div class="info-row"><span style="color:#888">Téléphone</span><span style="font-weight:600">${order.user_phone || '—'}</span></div>
    <div class="info-row"><span style="color:#888">Pays</span><span style="font-weight:600">${order.user_country || '—'}</span></div>
    <div class="info-row"><span style="color:#888">Paiement</span><span style="font-weight:600">${order.payment_method}</span></div>
    ${itemsList}
    <div class="info-row"><span><strong>Total</strong></span>
    <span><strong>${Number(order.total_amount).toLocaleString()} FCFA</strong></span></div>`;
  return sendMail(process.env.ADMIN_EMAIL, `🔔 Nouvelle commande : ${order.order_number}`, baseTemplate(content, 'Nouvelle commande'));
}

async function sendDocumentAccessEmail(order, documents) {
  const docList = documents.map(d =>
    `<div style="background:#f8f4e8;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid #D4A017">
      <strong>📄 ${d.title || 'Document'}</strong><br>
      <span style="font-size:13px;color:#888">Certificat : ${d.certificate_number || '—'}</span></div>`
  ).join('');
  const content = `<h2>🎉 Paiement confirmé !</h2>
    <p>Bonjour <strong>${order.user_name}</strong>, vos documents sont disponibles.</p>
    ${docList}
    <div class="amount-box">Facture : <strong>${order.invoice_number || '—'}</strong></div>
    <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Accéder à mes documents →</a>`;
  return sendMail(order.user_email, '✅ Vos documents sont prêts !', baseTemplate(content, 'Documents'));
}

module.exports = { sendWelcomeEmail, sendOrderConfirmationEmail, sendAdminOrderNotification, sendDocumentAccessEmail };
