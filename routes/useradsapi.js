const express = require('express');
const router = express.Router();
// ✅ FIXED: properly import both loadData AND saveData
const { loadData, saveData } = require('../data');

// ✅ GET all ads (sorted newest first)
router.get('/', (req, res) => {
  try {
    const data = loadData();
    if (!data.userAds) data.userAds = [];
    // sort newest first
    res.json(data.userAds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  } catch (err) {
    console.error("Error loading ads:", err);
    res.status(500).json({ error: "Failed to load ads" });
  }
});

// ✅ CREATE new ad
router.post('/', (req, res) => {
  try {
    const data = loadData();
    if (!data.userAds) data.userAds = [];

    const { groupId, groupName, adName, image, createdBy, createdByName } = req.body;

    // Validate required fields
    if (!groupId || !groupName || !adName || !image || !createdBy) {
      return res.status(400).json({ error: 'Missing required fields' });
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

    // Add to top of list
    data.userAds.unshift(newAd);
    saveData(data);

    res.status(201).json(newAd);
  } catch (err) {
    console.error("Error creating ad:", err);
    res.status(500).json({ error: "Failed to create ad" });
  }
});

// ✅ DELETE ad by ID
router.delete('/:id', (req, res) => {
  try {
    const data = loadData();
    if (!data.userAds) return res.status(404).json({ error: 'No ads found' });

    const beforeCount = data.userAds.length;
    data.userAds = data.userAds.filter(ad => ad.id !== req.params.id);

    if (data.userAds.length === beforeCount) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    saveData(data);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting ad:", err);
    res.status(500).json({ error: "Failed to delete ad" });
  }
});

module.exports = router;