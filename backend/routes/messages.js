const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');

// Récupérer les messages d'une conversation
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const myId = req.user.id;
    const otherId = req.params.userId;

    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(full_name, avatar_url)')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Envoyer un message
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { receiver_id, content, type, voice_url, emoji } = req.body;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: req.user.id,
        receiver_id,
        content,
        type: type || 'text',
        voice_url,
        emoji
      })
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Marquer comme lu
router.put('/:senderId/read', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', req.params.senderId)
      .eq('receiver_id', req.user.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
