const express = require('express');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { sendOrderConfirmationEmail, sendAdminOrderNotification } = require('../services/email');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Générer numéro de commande ────────────────────────────
function generateOrderNumber() {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ME${y}${m}${d}-${rand}`;
}

function generateInvoiceNumber() {
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `INV-${new Date().getFullYear()}-${n}`;
}

// ── POST /api/orders — créer une commande ─────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { document_ids, payment_method, phone, country } = req.body;

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins un document' });
    }
    if (!payment_method) {
      return res.status(400).json({ error: 'Mode de paiement requis' });
    }

    // Récupérer les documents
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, title, price, currency')
      .in('id', document_ids)
      .eq('is_published', true);

    if (docsError || !docs || docs.length === 0) {
      return res.status(404).json({ error: 'Documents introuvables' });
    }

    const items = docs.map(d => ({
      document_id: d.id,
      title: d.title,
      price: d.price,
      quantity: 1
    }));
    const total_amount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const order_number = generateOrderNumber();

    // Récupérer infos user
    const { data: user } = await supabase
      .from('users')
      .select('full_name, email, phone, country')
      .eq('id', req.user.id)
      .single();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number,
        user_id: req.user.id,
        user_name: user.full_name,
        user_email: user.email,
        user_phone: phone || user.phone,
        user_country: country || user.country,
        items,
        total_amount,
        currency: 'FCFA',
        quantity: items.length,
        payment_method,
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Créer notification admin
    await supabase.from('notifications').insert({
      user_id: null,
      type: 'new_order',
      title: 'Nouvelle commande reçue',
      message: `${user.full_name} a commandé ${items.length} document(s) pour ${total_amount.toLocaleString()} FCFA`,
      data: { order_id: order.id, order_number }
    });

    // Emails (non bloquants)
    sendOrderConfirmationEmail(order, items).catch(console.error);
    sendAdminOrderNotification(order, items).catch(console.error);

    res.status(201).json(order);
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Erreur création commande' });
  }
});

// ── GET /api/orders/my — mes commandes ───────────────────
router.get('/my', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement commandes' });
  }
});

// ── POST /api/orders/:id/proof — soumettre preuve de paiement ─
router.post('/:id/proof', authenticate, upload.single('proof'), async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que c'est la commande de cet utilisateur
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Cette commande ne peut plus être modifiée' });
    }

    let proof_url = null;

    // Upload la capture dans Supabase Storage
    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const fileName = `proofs/${id}-${Date.now()}.${ext}`;

      const { data: uploaded, error: uploadError } = await supabase
        .storage
        .from('payment-proofs')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase
        .storage
        .from('payment-proofs')
        .getPublicUrl(fileName);

      proof_url = publicUrl;
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'proof_submitted', payment_proof_url: proof_url })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Notification admin
    await supabase.from('notifications').insert({
      user_id: null,
      type: 'proof_submitted',
      title: 'Preuve de paiement reçue',
      message: `${order.user_name} a soumis une preuve pour la commande ${order.order_number}`,
      data: { order_id: id, order_number: order.order_number }
    });

    res.json(updated);
  } catch (err) {
    console.error('Proof upload error:', err);
    res.status(500).json({ error: 'Erreur envoi preuve' });
  }
});

module.exports = router;
