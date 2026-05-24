const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data/index.js');

// ----------------------
// HELPERS
// ----------------------
function getProfile(userId) {
  if (!data.userProfiles[userId]) data.userProfiles[userId] = {};
  const p = data.userProfiles[userId];
  if (!p.avatar) p.avatar = {
    colors: {
      head:     '#F5CBA7',
      torso:    '#1B6EC2',
      leftArm:  '#8E8E8E',
      rightArm: '#8E8E8E',
      leftLeg:  '#5B9BD5',
      rightLeg: '#5B9BD5',
    },
    pose: 'idle',
    equippedFaceId: null,
    headshotBase64: null,
  };
  if (!p.inventory) p.inventory = [];
  return p;
}

// ----------------------
// GET AVATAR
// GET /api/avatar/:userId
// ----------------------
router.get('/:userId', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) return res.json({ success: false, error: 'Invalid userId' });
    const profile = getProfile(userId);
    res.json({ success: true, avatar: profile.avatar, inventory: profile.inventory });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// SAVE AVATAR
// POST /api/avatar/save
// Body: { userId, colors, pose, headshotBase64 }
// ----------------------
router.post('/save', (req, res) => {
  try {
    const userId = Number(req.body.userId);
    if (isNaN(userId)) return res.json({ success: false, error: 'Invalid userId' });

    const profile = getProfile(userId);

    if (req.body.colors && typeof req.body.colors === 'object') {
      profile.avatar.colors = req.body.colors;
    }
    if (req.body.pose) {
      profile.avatar.pose = req.body.pose;
    }
    if (req.body.headshotBase64) {
      // Store only the base64 data (strip data URL prefix if present)
      profile.avatar.headshotBase64 = req.body.headshotBase64.replace(/^data:image\/\w+;base64,/, '');
    }

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// EQUIP FACE
// POST /api/avatar/equip
// Body: { userId, itemId }  — itemId null = unequip
// ----------------------
router.post('/equip', (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const itemId = req.body.itemId === null ? null : Number(req.body.itemId);

    if (isNaN(userId)) return res.json({ success: false, error: 'Invalid userId' });

    const profile = getProfile(userId);

    // Null = unequip
    if (itemId === null) {
      profile.avatar.equippedFaceId = null;
      saveData();
      return res.json({ success: true });
    }

    // Must own the item
    if (!profile.inventory.includes(itemId)) {
      return res.json({ success: false, error: 'You do not own this item' });
    }

    // Must exist in catalog
    const item = (data.catalog || []).find(i => i.id === itemId);
    if (!item) return res.json({ success: false, error: 'Item not found' });

    profile.avatar.equippedFaceId = itemId;
    saveData();
    res.json({ success: true, item });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;