const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const ALLOWED_UPLOAD_IDS = [1];
if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.nextOutfitId) data.nextOutfitId = 1;

function findUserById(id) {
  return Object.values(data.userProfiles || {}).find(u => Number(u.id) === Number(id)) || null;
}

// ✅ Hide IDs 1 & 2 from public catalog
router.get('/recommended', (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit) || 12);
  const outfits = Object.values(data.outfitCatalog)
    .filter(o => o.id > 2) // Keep defaults internal only
    .map(o => ({
      ...o,
      creatorId: o.uploadedBy || 0,
      creatorName: findUserById(o.uploadedBy)?.username || "Unknown",
      creatorUrl: `/users/profile?id=${o.uploadedBy || 0}`,
      score: (o.sales || 0) * 2 + (o.views || 0)
    }))
    .sort((a, b) => b.score - a.score || b.sales - a.sales || b.views - a.views)
    .slice(0, limit);
  res.json({ success: true, count: outfits.length, outfits });
});

router.get('/:id', (req, res) => {
  const outfitId = parseInt(req.params.id);
  if (isNaN(outfitId) || outfitId < 1) return res.status(400).json({ success: false, message: "Invalid ID" });
  const outfit = data.outfitCatalog[outfitId];
  if (!outfit) return res.status(404).json({ success: false, message: "Not found" });
  outfit.views++; saveData().catch(console.error);
  const creator = findUserById(outfit.uploadedBy || 0) || {};
  res.json({ success: true, outfit: { ...outfit, creatorName: creator.username || "Unknown" } });
});

router.get('/', (req, res) => {
  const catalog = Object.values(data.outfitCatalog).filter(o => o.id > 2);
  res.json({ success: true, count: catalog.length, catalog });
});

// Upload/Update/Delete routes stay the same — no changes needed here
router.post('/upload', express.json({ limit: '10mb' }), async (req, res) => { /* unchanged */ });
router.put('/:id', express.json({ limit: '10mb' }), async (req, res) => { /* unchanged */ });
router.delete('/:id', async (req, res) => { /* unchanged */ });

module.exports = router;