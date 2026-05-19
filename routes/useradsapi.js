const express = require('express');
const router = express.Router();
const { loadData, saveData } = require('../data');

// ✅ GET all ads (newest first)
router.get('/', (req, res) => {
  const data = loadData();
  // Make sure array exists
  if (!data.userAds) data.userAds = [];
  // Sort newest first
  res.json(data.userAds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// ✅ POST create new ad
router.post('/', (req, res) => {
  const data = loadData();
  if (!data.userAds) data.userAds = [];

  const { groupId, groupName, adName, image, createdBy, createdByName } = req.body;

  // Basic validation
  if (!groupId || !groupName || !adName || !image || !createdBy) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newAd = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    groupId,
    groupName,
    adName,
    image,
    createdBy,
    createdByName
  };

  data.userAds.unshift(newAd); // add to top
  saveData(data);

  res.status(201).json(newAd);
});

// ✅ DELETE ad by ID
router.delete('/:id', (req, res) => {
  const data = loadData();
  if (!data.userAds) return res.status(404).json({ error: "Ads not found" });

  const initialLength = data.userAds.length;
  data.userAds = data.userAds.filter(ad => ad.id !== req.params.id);

  if (data.userAds.length === initialLength) {
    return res.status(404).json({ error: "Ad not found" });
  }

  saveData(data);
  res.json({ success: true });
});

module.exports = router;