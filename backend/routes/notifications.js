const express = require('express');
const supabase = require('../config/supabase');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — mes notifications (ou admin si admin)
router.get('/', authenticate, async (req, res) => {
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (req.user.role === 'admin') {
      // Admin voit les notifications sans user_id (système)
      query = query.is('user_id', null);
    } else {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur notifications' });
  }
});

// GET /api/notifications/count — count non lues
router.get('/count', authenticate, async (req, res) => {
  try {
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (req.user.role === 'admin') {
      query = query.is('user_id', null);
    } else {
      query = query.eq('user_id', req.user.id);
    }

    const { count } = await query;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Erreur count notifications' });
  }
});

// PUT /api/notifications/:id/read — marquer comme lu
router.put('/:id/read', authenticate, async (req, res) => {
  await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id);
  res.json({ success: true });
});

// PUT /api/notifications/read-all — tout marquer lu
router.put('/read-all', authenticate, async (req, res) => {
  let query = supabase.from('notifications').update({ is_read: true });
  if (req.user.role === 'admin') {
    query = query.is('user_id', null);
  } else {
    query = query.eq('user_id', req.user.id);
  }
  await query;
  res.json({ success: true });
});

module.exports = router;
