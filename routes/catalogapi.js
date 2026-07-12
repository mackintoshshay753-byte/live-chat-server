const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const ALLOWED_UPLOAD_IDS = [1];

// Get all outfits
router.get('/', (req, res) => {
  if (!data.outfitCatalog) data.outfitCatalog = {};
  res.json({ success: true, catalog: data.outfitCatalog });
});

// Upload — accepts Base64 strings only
router.post('/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { name, price, head, thumbnail, uploaderId } = req.body;

    if (!ALLOWED_UPLOAD_IDS.includes(Number(uploaderId))) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (!name || !price || !head || !thumbnail) {
      return res.status(400).json({ success: false, message: "All fields and images are required" });
    }

    if (!data.nextOutfitId) data.nextOutfitId = 1;
    if (!data.outfitCatalog) data.outfitCatalog = {};

    const outfitId = data.nextOutfitId;

    // Save directly as Base64 data URL
    data.outfitCatalog[outfitId] = {
      id: outfitId,
      name: name.trim(),
      price: Number(price),
      head: head,
      thumbnail: thumbnail,
      uploadedBy: Number(uploaderId),
      uploadedAt: new Date().toISOString()
    };

    data.nextOutfitId += 1;
    await saveData();

    res.json({ success: true, message: "✅ Outfit saved", outfitId });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to save" });
  }
});

module.exports = router;