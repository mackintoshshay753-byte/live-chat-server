const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

// Ensure base structures exist
if (!data.userOutfits) data.userOutfits = {};
if (!data.outfitCatalog) data.outfitCatalog = {};
if (!data.users) data.users = {}; // Make sure users table exists

// Helper function to get user by ID
function findUserById(userId) {
  if (!userId) return null;
  const uid = Number(userId);
  return data.users[uid] || data.users[String(uid)] || null;
}

/**
 * GET - Recommended outfits (with correct creator info)
 */
router.get('/recommended', (req, res) => {
  const limit = Math.max(1, parseInt(req.query.limit) || 7); // Default to top 7

  const outfits = Object.values(data.outfitCatalog)
    .map(o => {
      const creator = findUserById(o.uploadedBy) || {};
      return {
        id: o.id,
        name: o.name,
        price: o.price,
        thumbnail: o.thumbnail,
        uploadedBy: o.uploadedBy || 0,
        creatorId: o.uploadedBy || 0,
        // Return actual name or fallback
        creatorName: creator.username || `User ${o.uploadedBy || 0}`,
        creatorUrl: `/users/profile?id=${o.uploadedBy || 0}`,
        sales: o.sales || 0,
        views: o.views || 0,
        score: ((o.sales || 0) * 2) + (o.views || 0)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  res.json({ success: true, count: outfits.length, outfits });
});

/**
 * GET - Fetch all outfits a user owns + equipped
 * Query: ?userId=X
 */
router.get('/my', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Valid user ID is required" });
    }

    // Create user entry if it doesn't exist
    if (!data.userOutfits[userId]) {
      data.userOutfits[userId] = { equipped: null, owned: [] };
    }

    const userData = data.userOutfits[userId];
    const ownedOutfits = userData.owned
      .map(outfitId => {
        const o = data.outfitCatalog[outfitId];
        if (!o) return null;
        const creator = findUserById(o.uploadedBy) || {};
        return {
          ...o,
          creatorName: creator.username || `User ${o.uploadedBy || 0}`,
          creatorUrl: `/users/profile?id=${o.uploadedBy || 0}`
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      equipped: userData.equipped,
      outfits: ownedOutfits
    });

  } catch (err) {
    console.error("Error loading inventory:", err);
    res.status(500).json({ success: false, message: "Server error loading inventory" });
  }
});

/**
 * POST - Buy / Claim an outfit
 * Body: { userId, outfitId }
 */
router.post('/buy', express.json(), async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId);
    const oid = parseInt(outfitId);

    if (isNaN(uid) || isNaN(oid)) {
      return res.status(400).json({ success: false, message: "Valid user ID and outfit ID are required" });
    }

    const outfit = data.outfitCatalog[oid];
    if (!outfit) {
      return res.status(404).json({ success: false, message: "Outfit not found in catalog" });
    }

    if (!data.userOutfits[uid]) {
      data.userOutfits[uid] = { equipped: null, owned: [] };
    }

    if (data.userOutfits[uid].owned.includes(oid)) {
      return res.json({ success: false, message: "You already own this outfit" });
    }

    data.userOutfits[uid].owned.push(oid);
    outfit.sales = (outfit.sales || 0) + 1;
    await saveData();

    res.json({ success: true, message: "✅ Outfit added to your inventory" });

  } catch (err) {
    console.error("Error buying outfit:", err);
    res.status(500).json({ success: false, message: "Failed to purchase outfit" });
  }
});

/**
 * POST - Equip an outfit
 * Body: { userId, outfitId }
 */
router.post('/equip', express.json(), async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId);
    const oid = parseInt(outfitId);

    if (isNaN(uid) || isNaN(oid)) {
      return res.status(400).json({ success: false, message: "Valid user ID and outfit ID are required" });
    }

    if (!data.userOutfits[uid]) {
      return res.status(404).json({ success: false, message: "User inventory not found" });
    }

    const userData = data.userOutfits[uid];
    if (!userData.owned.includes(oid)) {
      return res.status(403).json({ success: false, message: "You must own this outfit to equip it" });
    }

    userData.equipped = oid;
    await saveData();

    res.json({ success: true, message: "✅ Outfit equipped", equippedId: oid });

  } catch (err) {
    console.error("Error equipping outfit:", err);
    res.status(500).json({ success: false, message: "Failed to equip outfit" });
  }
});

module.exports = router;