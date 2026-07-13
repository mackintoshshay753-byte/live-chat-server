const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const ALLOWED_UPLOAD_IDS = [1];

// Ensure base structure exists
if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.nextOutfitId || typeof data.nextOutfitId !== 'number') data.nextOutfitId = 1;
if (!data.users) data.users = {};

/**
 * Get single outfit by ID
 * GET /outfits/:id
 */
router.get('/:id', (req, res) => {
  const outfitId = parseInt(req.params.id, 10);

  if (isNaN(outfitId) || outfitId < 1) {
    return res.status(400).json({ success: false, message: "Invalid outfit ID" });
  }

  const outfit = data.outfitCatalog[outfitId];
  if (!outfit) {
    return res.status(404).json({ success: false, message: "Outfit not found" });
  }

  // Get creator safely
  const uploadedBy = outfit.uploadedBy ?? 0;
  const creator = data.users[uploadedBy] || { username: `User ${uploadedBy}` };

  res.json({
    success: true,
    outfit: {
      id: outfit.id,
      name: outfit.name,
      price: outfit.price,
      thumbnailUrl: outfit.thumbnail,
      head: outfit.head,
      creatorId: uploadedBy,
      creatorName: creator.username,
      creatorUrl: `/users/profile?id=${uploadedBy}`,
      uploadedAt: outfit.uploadedAt || null
    }
  });
});

/**
 * Get all outfits
 * GET /outfits
 */
router.get('/', (req, res) => {
  // Optional: Convert object to array for easier frontend use
  const catalogArray = Object.values(data.outfitCatalog);
  res.json({ success: true, count: catalogArray.length, catalog: catalogArray });
});

/**
 * Upload new outfit
 * POST /outfits/upload
 */
router.post('/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { name, price, head, thumbnail, uploaderId } = req.body;
    const uid = Number(uploaderId);

    if (!ALLOWED_UPLOAD_IDS.includes(uid)) {
      return res.status(403).json({ success: false, message: "Not authorized to upload outfits" });
    }

    // Validate required fields
    if (!name?.trim() || !head || !thumbnail) {
      return res.status(400).json({ success: false, message: "Fields: name, price, head, thumbnail are required" });
    }

    // Validate price
    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
    }

    const outfitId = data.nextOutfitId;

    data.outfitCatalog[outfitId] = {
      id: outfitId,
      name: name.trim(),
      price: numericPrice,
      head: head,
      thumbnail: thumbnail.trim(),
      uploadedBy: uid,
      uploadedAt: new Date().toISOString()
    };

    data.nextOutfitId += 1;
    await saveData();

    res.status(201).json({
      success: true,
      message: "✅ Outfit saved successfully",
      outfitId
    });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "Failed to save outfit" });
  }
});

/**
 * Optional: Update existing outfit
 * PUT /outfits/:id
 */
router.put('/:id', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const outfitId = parseInt(req.params.id, 10);
    const { name, price, head, thumbnail, editorId } = req.body;
    const eid = Number(editorId);

    if (isNaN(outfitId) || !ALLOWED_UPLOAD_IDS.includes(eid)) {
      return res.status(403).json({ success: false, message: "Unauthorized or invalid ID" });
    }

    const outfit = data.outfitCatalog[outfitId];
    if (!outfit) return res.status(404).json({ success: false, message: "Outfit not found" });

    if (name) outfit.name = name.trim();
    if (price !== undefined) outfit.price = Math.max(0, Number(price) || 0);
    if (head) outfit.head = head;
    if (thumbnail) outfit.thumbnail = thumbnail.trim();

    await saveData();
    res.json({ success: true, message: "✅ Outfit updated", outfit });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

/**
 * Optional: Delete outfit
 * DELETE /outfits/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const outfitId = parseInt(req.params.id, 10);
    const deleterId = Number(req.body.deleterId);

    if (isNaN(outfitId) || !ALLOWED_UPLOAD_IDS.includes(deleterId)) {
      return res.status(403).json({ success: false, message: "Unauthorized or invalid ID" });
    }

    if (!data.outfitCatalog[outfitId]) {
      return res.status(404).json({ success: false, message: "Outfit not found" });
    }

    delete data.outfitCatalog[outfitId];
    await saveData();
    res.json({ success: true, message: "🗑️ Outfit deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
});

module.exports = router;