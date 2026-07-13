const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const ALLOWED_UPLOAD_IDS = [1];

if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.nextOutfitId || typeof data.nextOutfitId !== 'number') data.nextOutfitId = 1;
if (!data.users) data.users = {};

function findUserById(userId) {
  if (!userId) return null;
  
  if (data.users[userId]) return data.users[userId];
  if (data.users[String(userId)]) return data.users[String(userId)];
  
  const foundUser = Object.values(data.users).find(u => Number(u.id) === Number(userId));
  return foundUser || null;
}

router.get('/recommended', (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit) || 12);

  const outfits = Object.values(data.outfitCatalog)
    .map(o => {
      const u = findUserById(o.uploadedBy) || {};
      
      return {
        ...o,
        creatorId: o.uploadedBy || 0,
        creatorName: u.username || `User ${o.uploadedBy || 0}`,
        creatorUrl: `/users/profile?id=${o.uploadedBy || 0}`,
        sales: o.sales || 0,
        views: o.views || 0,
        score: (o.sales || 0) * 2 + (o.views || 0)
      };
    })
    .sort((a, b) => b.score - a.score || b.sales - a.sales || b.views - a.views)
    .slice(0, limit);

  res.json({ success: true, count: outfits.length, outfits });
});

router.get('/:id', (req, res) => {
  const outfitId = parseInt(req.params.id, 10);

  if (isNaN(outfitId) || outfitId < 1) {
    return res.status(400).json({ success: false, message: "Invalid outfit ID" });
  }

  const outfit = data.outfitCatalog[outfitId];
  if (!outfit) {
    return res.status(404).json({ success: false, message: "Outfit not found" });
  }

  outfit.views = (outfit.views || 0) + 1;
  saveData().catch(console.error);
  
  const uploadedBy = outfit.uploadedBy ?? 0;
  const creator = findUserById(uploadedBy) || { username: `User ${uploadedBy}` };

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
      uploadedAt: outfit.uploadedAt || null,
      sales: outfit.sales || 0,
      views: outfit.views || 0
    }
  });
});

router.get('/', (req, res) => {
  const catalogArray = Object.values(data.outfitCatalog);
  res.json({ success: true, count: catalogArray.length, catalog: catalogArray });
});

router.post('/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { name, price, head, thumbnail, uploaderId } = req.body;
    const uid = Number(uploaderId);

    if (!ALLOWED_UPLOAD_IDS.includes(uid)) {
      return res.status(403).json({ success: false, message: "Not authorized to upload outfits" });
    }

    if (!name?.trim() || !head || !thumbnail) {
      return res.status(400).json({ success: false, message: "Fields: name, price, head, thumbnail are required" });
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
    }

    const outfitId = data.nextOutfitId;

    data.outfitCatalog[outfitId] = {
      id: outfitId,
      name: name.trim(),
      price: numericPrice,
      head,
      thumbnail: thumbnail.trim(),
      uploadedBy: uid,
      uploadedAt: new Date().toISOString(),
      sales: 0,
      views: 0
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