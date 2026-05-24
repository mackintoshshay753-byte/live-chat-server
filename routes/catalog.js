const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data/index.js');

// ----------------------
// DEFAULT FACE CATALOG
// These seed on first run. imageUrl points to small
// face overlay PNGs you put in /public/catalog/faces/
// ----------------------
const DEFAULT_FACES = [
  { id: 1,  name: 'Classic Smile',    imageUrl: '/catalog/faces/classic-smile.png',    price: 0, type: 'face' },
  { id: 2,  name: 'Shades Cool',      imageUrl: '/catalog/faces/shades-cool.png',      price: 0, type: 'face' },
  { id: 3,  name: 'Shocked',          imageUrl: '/catalog/faces/shocked.png',          price: 0, type: 'face' },
  { id: 4,  name: 'Sleepy',           imageUrl: '/catalog/faces/sleepy.png',           price: 0, type: 'face' },
  { id: 5,  name: 'Angry',            imageUrl: '/catalog/faces/angry.png',            price: 0, type: 'face' },
  { id: 6,  name: 'Happy',            imageUrl: '/catalog/faces/happy.png',            price: 0, type: 'face' },
  { id: 7,  name: 'Suspicious',       imageUrl: '/catalog/faces/suspicious.png',       price: 0, type: 'face' },
  { id: 8,  name: 'Wink',             imageUrl: '/catalog/faces/wink.png',             price: 0, type: 'face' },
];

// Seed catalog into data if it doesn't exist yet
function seedCatalog() {
  if (!Array.isArray(data.catalog) || data.catalog.length === 0) {
    data.catalog = DEFAULT_FACES;
    data.nextCatalogId = DEFAULT_FACES.length + 1;
    saveData();
    console.log('✅ Catalog seeded with', DEFAULT_FACES.length, 'default faces');
  }
}
seedCatalog();

// Helper: get/init user profile
function getProfile(userId) {
  if (!data.userProfiles[userId]) data.userProfiles[userId] = {};
  const p = data.userProfiles[userId];
  if (!p.inventory) p.inventory = [];
  if (!p.avatar) p.avatar = {
    colors: { head:'#F5CBA7', torso:'#1B6EC2', leftArm:'#8E8E8E', rightArm:'#8E8E8E', leftLeg:'#5B9BD5', rightLeg:'#5B9BD5' },
    pose: 'idle',
    equippedFaceId: null,
    headshotBase64: null,
  };
  return p;
}

// ----------------------
// GET CATALOG
// GET /api/catalog?type=face
// Returns all items, with owned/equipped flags if userId passed
// ----------------------
router.get('/', (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const type   = req.query.type || null;

    let items = data.catalog || [];
    if (type) items = items.filter(i => i.type === type);

    // If userId provided, annotate owned/equipped
    if (userId && !isNaN(userId)) {
      const profile = getProfile(userId);
      items = items.map(i => ({
        ...i,
        owned:    profile.inventory.includes(i.id),
        equipped: profile.avatar?.equippedFaceId === i.id,
      }));
    }

    res.json({ success: true, items });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// ACQUIRE ITEM (free for now)
// POST /api/catalog/acquire
// Body: { userId, itemId }
// ----------------------
router.post('/acquire', (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const itemId = Number(req.body.itemId);

    if (isNaN(userId) || isNaN(itemId)) {
      return res.json({ success: false, error: 'Invalid userId or itemId' });
    }

    const item = (data.catalog || []).find(i => i.id === itemId);
    if (!item) return res.json({ success: false, error: 'Item not found' });

    const profile = getProfile(userId);

    if (profile.inventory.includes(itemId)) {
      return res.json({ success: false, error: 'Already owned', alreadyOwned: true });
    }

    // Free item — just add to inventory
    if (item.price !== 0) {
      return res.json({ success: false, error: 'This item is not free (currency system coming soon)' });
    }

    profile.inventory.push(itemId);
    saveData();
    res.json({ success: true, item });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ----------------------
// ADD ITEM TO CATALOG (admin)
// POST /api/catalog/add
// Body: { name, imageUrl, price, type }
// ----------------------
router.post('/add', (req, res) => {
  try {
    const { name, imageUrl, price, type } = req.body;
    if (!name || !imageUrl) return res.json({ success: false, error: 'name and imageUrl required' });

    if (!Array.isArray(data.catalog)) data.catalog = [];
    if (!data.nextCatalogId) data.nextCatalogId = data.catalog.length + 1;

    const newItem = {
      id:       data.nextCatalogId++,
      name:     name.trim(),
      imageUrl: imageUrl.trim(),
      price:    Number(price) || 0,
      type:     type || 'face',
    };

    data.catalog.push(newItem);
    saveData();
    res.json({ success: true, item: newItem });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;