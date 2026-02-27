const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sendDocumentAccessEmail } = require('../services/email');
const multer = require('multer');

const router = express.Router();
router.use(authenticate, requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── Générer numéros certificat/facture ────────────────────
function generateCertNumber() {
  return `CERT-ME-${Date.now()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
}
function generateInvoiceNumber() {
  return `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000) + 10000}`;
}

// ══════════════════════════════════════════════════════════
// KPIs / DASHBOARD
// ══════════════════════════════════════════════════════════
router.get('/kpis', async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalOrders },
      { count: pendingOrders },
      { count: confirmedOrders },
      { count: totalDocs }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user'),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending','proof_submitted']),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('is_published', true)
    ]);

    // Revenu total
    const { data: revenueData } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('status', 'confirmed');
    const totalRevenue = (revenueData || []).reduce((s, r) => s + Number(r.total_amount), 0);

    // Commandes récentes
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, order_number, user_name, total_amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      kpis: { totalUsers, totalOrders, pendingOrders, confirmedOrders, totalDocs, totalRevenue },
      recentOrders: recentOrders || []
    });
  } catch (err) {
    console.error('KPI error:', err);
    res.status(500).json({ error: 'Erreur KPIs' });
  }
});

// ══════════════════════════════════════════════════════════
// DOCUMENTS — CRUD
// ══════════════════════════════════════════════════════════
router.get('/documents', async (req, res) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// Ajouter document avec fichier PDF et couverture
router.post('/documents', upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, price, category, author, pages, language } = req.body;

    let file_url = null;
    let cover_url = null;

    // Upload PDF
    if (req.files?.file?.[0]) {
      const file = req.files.file[0];
      const path = `documents/${uuidv4()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from('documents').upload(path, file.buffer, { contentType: 'application/pdf' });
      if (uploadErr) throw uploadErr;
      file_url = path; // Stocker le chemin, pas l'URL directe (sécurité)
    }

    // Upload couverture
    if (req.files?.cover?.[0]) {
      const cover = req.files.cover[0];
      const ext = cover.originalname.split('.').pop();
      const path = `covers/${uuidv4()}.${ext}`;
      const { error: coverErr } = await supabase.storage
        .from('documents').upload(path, cover.buffer, { contentType: cover.mimetype });
      if (coverErr) throw coverErr;
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
      cover_url = publicUrl;
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        title, description, price: Number(price), category,
        author, pages: Number(pages) || null, language,
        file_url, cover_url,
        created_by: req.user.id,
        is_published: false
      })
      .select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Doc create error:', err);
    res.status(500).json({ error: 'Erreur création document' });
  }
});

router.put('/documents/:id', async (req, res) => {
  try {
    const { title, description, price, category, author, pages, language, is_published } = req.body;
    const { data, error } = await supabase
      .from('documents')
      .update({ title, description, price: Number(price), category, author,
        pages: Number(pages) || null, language, is_published })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour document' });
  }
});

router.delete('/documents/:id', async (req, res) => {
  const { error } = await supabase.from('documents').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// COMMANDES
// ══════════════════════════════════════════════════════════
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur commandes' });
  }
});

// Confirmer une commande → débloquer les documents
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_note } = req.body;

    const { data: order, error: orderError } = await supabase
      .from('orders').select('*').eq('id', id).single();
    if (orderError || !order) return res.status(404).json({ error: 'Commande introuvable' });

    const invoice_number = generateInvoiceNumber();

    // Mettre à jour la commande
    await supabase.from('orders').update({
      status: 'confirmed',
      invoice_number,
      admin_note,
      confirmed_at: new Date().toISOString()
    }).eq('id', id);

    // Créer les accès documents pour l'utilisateur
    const items = order.items;
    const userDocsToInsert = items.map(item => ({
      user_id: order.user_id,
      document_id: item.document_id,
      order_id: id,
      certificate_number: generateCertNumber()
    }));

    const { data: userDocs } = await supabase
      .from('user_documents')
      .upsert(userDocsToInsert, { onConflict: 'user_id,document_id' })
      .select();

    // Notification user
    await supabase.from('notifications').insert({
      user_id: order.user_id,
      type: 'order_confirmed',
      title: 'Commande confirmée !',
      message: `Votre commande ${order.order_number} est confirmée. Vos documents sont disponibles.`,
      data: { order_id: id, order_number: order.order_number }
    });

    // Email avec accès documents
    const docsWithCerts = (userDocs || []).map(ud => ({
      ...ud,
      invoice_number
    }));
    sendDocumentAccessEmail({ ...order, invoice_number }, docsWithCerts).catch(console.error);

    res.json({ success: true, invoice_number });
  } catch (err) {
    console.error('Confirm order error:', err);
    res.status(500).json({ error: 'Erreur confirmation commande' });
  }
});

router.post('/orders/:id/cancel', async (req, res) => {
  const { error } = await supabase
    .from('orders').update({ status: 'cancelled' }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// UTILISATEURS
// ══════════════════════════════════════════════════════════
router.get('/users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, phone, country, is_active, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

router.post('/users', async (req, res) => {
  try {
    const { full_name, email, password, role, phone, country } = req.body;
    const password_hash = await bcrypt.hash(password || 'ChangeMe2026!', 12);
    const { data, error } = await supabase
      .from('users')
      .insert({ full_name, email: email.toLowerCase(), password_hash, role: role || 'user', phone, country })
      .select('id, full_name, email, role').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur création utilisateur' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { full_name, role, is_active, phone, country } = req.body;
    const { data, error } = await supabase
      .from('users')
      .update({ full_name, role, is_active, phone, country })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour utilisateur' });
  }
});

// ══════════════════════════════════════════════════════════
// HISTORIQUE
// ══════════════════════════════════════════════════════════
router.get('/history', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

module.exports = router;
