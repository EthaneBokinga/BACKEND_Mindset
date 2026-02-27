const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'noreply@mindset-entrepreneurs.com';

// ── Template HTML de base ────────────────────────────────
function baseTemplate(content, title) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f0f0; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 100%); padding: 30px 40px; text-align: center; }
    .header img { height: 60px; }
    .header h1 { color: #D4A017; font-size: 22px; margin: 10px 0 0; }
    .body { padding: 30px 40px; color: #333; line-height: 1.6; }
    .badge { display: inline-block; background: #C0392B; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .amount-box { background: #f8f4e8; border-left: 4px solid #D4A017; padding: 15px 20px; border-radius: 8px; margin: 20px 0; }
    .amount-box .amount { font-size: 28px; font-weight: bold; color: #0D3B66; }
    .btn { display: inline-block; background: #C0392B; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .info-row .label { color: #888; font-size: 13px; }
    .info-row .value { font-weight: 600; color: #333; }
    .footer { background: #0D0D0D; padding: 20px 40px; text-align: center; color: #666; font-size: 12px; }
    .footer a { color: #D4A017; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📚 Mindset Entrepreneurs</h1>
      <p style="color:#ccc;font-size:13px;margin:4px 0 0">Votre bibliothèque d'excellence</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© 2026 Mindset Entrepreneurs • <a href="mailto:bokingaethanenathan@gmail.com">bokingaethanenathan@gmail.com</a></p>
      <p style="margin-top:8px;color:#444">Powered by <strong style="color:#D4A017">Ethane Nathan Bokinga</strong></p>
    </div>
  </div>
</body>
</html>`;
}

// ── Email de bienvenue ───────────────────────────────────
async function sendWelcomeEmail(user) {
  const content = `
    <h2>Bienvenue, <strong>${user.full_name}</strong> ! 🎉</h2>
    <p>Votre compte Mindset Entrepreneurs a été créé avec succès.</p>
    <p>Vous pouvez maintenant accéder à notre bibliothèque de documents et commencer votre parcours vers l'excellence entrepreneuriale.</p>
    <p style="margin-top:24px">À très bientôt,<br><strong>L'équipe Mindset Entrepreneurs</strong></p>
  `;
  return resend.emails.send({
    from: FROM,
    to: user.email,
    subject: '🎉 Bienvenue sur Mindset Entrepreneurs !',
    html: baseTemplate(content, 'Bienvenue')
  });
}

// ── Email de confirmation de commande (au client) ────────
async function sendOrderConfirmationEmail(order, items) {
  const itemsList = items.map(i =>
    `<div class="info-row"><span class="label">${i.title}</span><span class="value">${i.price.toLocaleString()} FCFA × ${i.quantity}</span></div>`
  ).join('');

  const paymentInstructions = order.payment_method === 'whatsapp'
    ? `<div style="background:#e8f4e8;border-left:4px solid #27ae60;padding:15px;border-radius:8px;margin:20px 0">
        <strong>💬 Paiement via WhatsApp</strong><br>
        Contactez-nous sur WhatsApp : <strong>+242 06 106 73 02</strong><br>
        Mentionnez votre numéro de commande : <strong>${order.order_number}</strong>
       </div>`
    : `<div style="background:#e8f4f8;border-left:4px solid #2980b9;padding:15px;border-radius:8px;margin:20px 0">
        <strong>📱 Paiement Mobile Money</strong><br>
        Envoyez <strong>${order.total_amount.toLocaleString()} FCFA</strong> au :<br>
        Numéro : <strong>0610673 02</strong><br>
        Nom du compte : <strong>RUBEN MERED</strong><br>
        Ensuite, joignez votre capture d'écran dans votre espace commande.
       </div>`;

  const content = `
    <h2>Commande reçue ✅</h2>
    <p>Bonjour <strong>${order.user_name}</strong>,</p>
    <p>Votre commande a bien été enregistrée. Voici le récapitulatif :</p>
    
    <div class="amount-box">
      <div style="font-size:13px;color:#888">Numéro de commande</div>
      <div style="font-size:18px;font-weight:bold;color:#0D3B66">${order.order_number}</div>
    </div>

    <h3>Articles commandés</h3>
    ${itemsList}
    <div class="info-row">
      <span class="label"><strong>Total</strong></span>
      <span class="value"><strong>${order.total_amount.toLocaleString()} FCFA</strong></span>
    </div>

    ${paymentInstructions}
    
    <p>Une fois le paiement effectué, connectez-vous à votre compte et joignez la preuve de paiement. Votre document sera disponible dès confirmation.</p>
    <p>Des questions ? Contactez-nous : <a href="mailto:bokingaethanenathan@gmail.com">bokingaethanenathan@gmail.com</a></p>
  `;

  return resend.emails.send({
    from: FROM,
    to: order.user_email,
    subject: `📦 Commande ${order.order_number} - Mindset Entrepreneurs`,
    html: baseTemplate(content, 'Confirmation de commande')
  });
}

// ── Email notification admin (nouvelle commande) ─────────
async function sendAdminOrderNotification(order, items) {
  const itemsList = items.map(i =>
    `<div class="info-row"><span class="label">${i.title}</span><span class="value">${i.price.toLocaleString()} FCFA × ${i.quantity}</span></div>`
  ).join('');

  const content = `
    <div class="badge">NOUVELLE COMMANDE</div>
    <h2 style="margin-top:16px">Commande #${order.order_number}</h2>
    
    <div class="info-row"><span class="label">Client</span><span class="value">${order.user_name}</span></div>
    <div class="info-row"><span class="label">Email</span><span class="value">${order.user_email}</span></div>
    <div class="info-row"><span class="label">Téléphone</span><span class="value">${order.user_phone || '—'}</span></div>
    <div class="info-row"><span class="label">Pays</span><span class="value">${order.user_country || '—'}</span></div>
    <div class="info-row"><span class="label">Mode de paiement</span><span class="value">${order.payment_method}</span></div>
    
    <h3 style="margin-top:20px">Articles</h3>
    ${itemsList}
    <div class="info-row">
      <span class="label"><strong>Total</strong></span>
      <span class="value"><strong>${order.total_amount.toLocaleString()} FCFA</strong></span>
    </div>
    
    <p style="margin-top:20px">Connectez-vous au tableau de bord admin pour gérer cette commande.</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `🔔 Nouvelle commande : ${order.order_number} — ${order.total_amount.toLocaleString()} FCFA`,
    html: baseTemplate(content, 'Nouvelle commande')
  });
}

// ── Email confirmation + accès document ─────────────────
async function sendDocumentAccessEmail(order, documents) {
  const docList = documents.map(d => `
    <div style="background:#f8f4e8;border-radius:8px;padding:16px;margin:12px 0;border-left:4px solid #D4A017">
      <strong>📄 ${d.title}</strong><br>
      <span style="font-size:13px;color:#888">Certificat : ${d.certificate_number}</span>
    </div>
  `).join('');

  const content = `
    <h2>🎉 Paiement confirmé !</h2>
    <p>Bonjour <strong>${order.user_name}</strong>,</p>
    <p>Votre paiement a été confirmé. Vos documents sont maintenant disponibles dans votre espace personnel.</p>
    
    ${docList}
    
    <div class="amount-box">
      <div style="font-size:13px;color:#888">Numéro de facture</div>
      <div class="amount" style="font-size:18px">${order.invoice_number}</div>
    </div>
    
    <p>Connectez-vous pour télécharger vos documents et vos certificats d'authenticité.</p>
    <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Accéder à mes documents →</a>
    <p>Merci pour votre confiance. Bonne lecture ! 📚</p>
  `;

  return resend.emails.send({
    from: FROM,
    to: order.user_email,
    subject: `✅ Accès confirmé — Vos documents sont prêts !`,
    html: baseTemplate(content, 'Documents disponibles')
  });
}

module.exports = {
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendDocumentAccessEmail
};
