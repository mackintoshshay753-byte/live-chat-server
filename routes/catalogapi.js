const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const ALLOWED_UPLOAD_IDS = [1];

// Ensure base structure exists
if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.nextOutfitId) data.nextOutfitId = 1;

// Get single outfit WITH creator username
router.get('/:id', (req, res) => {
  const outfitId = parseInt(req.params.id);
  if (isNaN(outfitId)) {
    return res.status(400).json({ success: false, message: "Invalid outfit ID" });
  }

  const outfit = data.outfitCatalog[outfitId];
  if (!outfit) {
    return res.status(404).json({ success: false, message: "Outfit not found" });
  }

  // Get creator username if available
  const creator = data.users?.[outfit.uploadedBy] || { username: `User ${outfit.uploadedBy}` };
  
  res.json({ 
    success: true, 
    outfit: {
      id: outfit.id,
      name: outfit.name,
      price: outfit.price,
      thumbnailUrl: outfit.thumbnail,
      head: outfit.head,
      creatorId: outfit.uploadedBy,
      creatorName: creator.username,
      creatorUrl: `/users/profile?id=${outfit.uploadedBy}`
    }
  });
});

// Get all outfits
router.get('/', (req, res) => {
  res.json({ success: true, catalog: data.outfitCatalog });
});

// Upload new outfit
router.post('/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { name, price, head, thumbnail, uploaderId } = req.body;
    const uid = Number(uploaderId);

    if (!ALLOWED_UPLOAD_IDS.includes(uid)) {
      return res.status(403).json({ success: false, message: "Not authorized to upload" });
    }

    if (!name?.trim() || price === undefined || !head || !thumbnail) {
      return res.status(400).json({ success: false, message: "All fields (name, price, head, thumbnail) are required" });
    }

    const outfitId = data.nextOutfitId;

    data.outfitCatalog[outfitId] = {
      id: outfitId,
      name: name.trim(),
      price: Number(price) || 0,
      head: head,
      thumbnail: thumbnail,
      uploadedBy: uid,
      uploadedAt: new Date().toISOString()
    };

    data.nextOutfitId += 1;
    await saveData();

    res.json({ success: true, message: "✅ Outfit saved successfully", outfitId });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to save outfit" });
  }
});

module.exports = router;