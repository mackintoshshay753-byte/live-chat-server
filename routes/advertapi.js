const express = require('express');
const multer = require('multer');
const router = express.Router();

// Import ONLY from your existing data.js (unchanged)
const { data, saveData } = require('../data');

// Configure file upload: max 2MB, PNG only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png') cb(null, true);
    else cb(new Error('Only PNG files are allowed'), false);
  }
});

// ------------------------------
// Helper functions
// ------------------------------
function createAd(ownerId, ownerName, name, base64Data) {
  // Use timestamp as unique ID (no counter needed)
  const adId = Date.now().toString();
  data.ads[adId] = {
    id: adId,
    name: name.trim(),
    ownerId: ownerId,
    ownerName: ownerName,
    image: base64Data,
    active: false,
    createdAt: new Date().toISOString()
  };
  return adId;
}

function getAd(adId) {
  return data.ads[adId] || null;
}

function getAdsByOwner(ownerId) {
  return Object.values(data.ads).filter(ad => ad.ownerId === ownerId);
}

function toggleAdStatus(adId, newStatus) {
  if (data.ads[adId]) {
    data.ads[adId].active = newStatus;
    return data.ads[adId];
  }
  return null;
}

function getAllActiveAds() {
  return Object.values(data.ads).filter(ad => ad.active);
}

// ------------------------------
// API Endpoints
// ------------------------------

// Upload new ad — matches your frontend fetch call
router.post('/ads', upload.single('ad'), async (req, res) => {
  try {
    const { name } = req.body;
    const user = req.session?.user; // Uses your existing session system

    if (!user || !user.id) {
      return res.json({ success: false, error: 'Not logged in' });
    }
    if (!name || !name.trim()) {
      return res.json({ success: false, error: 'Ad name is required' });
    }
    if (!req.file) {
      return res.json({ success: false, error: 'Please select a PNG file' });
    }

    // Convert file to base64
    const base64 = `data:image/png;base64,${req.file.buffer.toString('base64')}`;
    const newAdId = createAd(user.id, user.username, name, base64);

    await saveData(); // Saves to chat-data.json

    res.json({ success: true, adId: newAdId });
  } catch (err) {
    console.error('Ad upload error:', err);
    res.json({ success: false, error: err.message || 'Upload failed' });
  }
});

// Get all ads for current user
router.get('/ads', (req, res) => {
  const user = req.session?.user;
  if (!user || !user.id) {
    return res.json({ success: false, error: 'Unauthorized' });
  }
  const ads = getAdsByOwner(user.id);
  res.json({ success: true, ads });
});

// Get single ad image/data
router.get('/ads/:id/render', (req, res) => {
  const ad = getAd(req.params.id);
  if (!ad) {
    return res.json({ success: false, error: 'Ad not found' });
  }
  res.json({ success: true, ad: { dataUrl: ad.image } });
});

// Toggle ad active/inactive
router.put('/ads/:id/toggle', express.json(), async (req, res) => {
  const adId = req.params.id;
  const { active } = req.body;
  const user = req.session?.user;

  const ad = getAd(adId);
  if (!ad || !user || ad.ownerId !== user.id) {
    return res.json({ success: false, error: 'Unauthorized or ad not found' });
  }

  const updated = toggleAdStatus(adId, active);
  await saveData();
  res.json({ success: true, ad: updated });
});

// Get all active ads for display site-wide
router.get('/ads/active/all', (req, res) => {
  const ads = getAllActiveAds();
  res.json({ success: true, ads });
});

module.exports = router;