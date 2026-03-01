const express = require('express');
const supabase = require('../config/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── GET /api/documents — liste publiée (tous utilisateurs) ─
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, description, cover_url, price, currency, category, author, pages, language, downloads_count, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement documents' });
  }
});

// ── GET /api/documents/:id — détail document ──────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, description, cover_url, price, currency, category, author, pages, language, downloads_count, created_at')
      .eq('id', req.params.id)
      .eq('is_published', true)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Document introuvable' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur chargement document' });
  }
});

// ── GET /api/documents/:id/download — télécharger si acheté ─
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    // Vérifier que l'utilisateur a acheté ce document
    const { data: userDoc, error } = await supabase
      .from('user_documents')
      .select('*, documents(title, file_url)')
      .eq('user_id', req.user.id)
      .eq('document_id', req.params.id)
      .single();

    if (error || !userDoc) {
      return res.status(403).json({ error: 'Vous n\'avez pas accès à ce document' });
    }

    // Mettre à jour le timestamp de téléchargement
    await supabase
      .from('user_documents')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('id', userDoc.id);

    // Incrémenter le compteur
    await supabase.rpc('increment', { table: 'documents', column: 'downloads_count', id: req.params.id });

    // Générer une URL signée Supabase Storage (valide 1 heure)
    const filePath = userDoc.documents.file_url;
    const { data: signedUrl, error: urlError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(filePath, 3600);

    if (urlError) throw urlError;
    res.json({ download_url: signedUrl.signedUrl, title: userDoc.documents.title });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Erreur génération lien de téléchargement' });
  }
});

// ── GET /api/documents/my/purchased — mes documents achetés ─
// Mes documents achetés
router.get('/my/purchased', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('user_documents')
      .select(`
        id,
        certificate_number,
        downloaded_at,
        created_at,
        order_id,
        documents (
          id,
          title,
          description,
          cover_url,
          file_url,
          author,
          pages,
          language,
          category
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erreur purchased docs:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('Erreur my/purchased:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
