const express = require('express');
const router = express.Router();
const { loadData, saveData } = require('../data'); // uses your existing data helper

// ✅ GET all ads (sorted newest first)
router.get('/', (req, res) => {
  const data = loadData();
  if (!data.userAds) data.userAds = [];
  // sort so newest ads show first
  res.json(data.userAds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// ✅ CREATE new ad
router.post('/', (req, res) => {
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
});

// ✅ DELETE ad by ID
router.delete('/:id', (req, res) => {
  const data = loadData();
  if (!data.userAds) return res.status(404).json({ error: 'No ads found' });

  const beforeCount = data.userAds.length;
  data.userAds = data.userAds.filter(ad => ad.id !== req.params.id);

  if (data.userAds.length === beforeCount) {
    return res.status(404).json({ error: 'Ad not found' });
  }

  saveData(data);
  res.json({ success: true });
});

module.exports = router;