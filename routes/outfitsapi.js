const express = require('express');
const router = express.Router();

// ✅ CHANGE: Use your existing data.js instead of chat-data
const { data, saveData } = require('../data');

/**
 * GET - Fetch all outfits a user owns, plus currently equipped
 * Query: ?userId=X
 */
router.get('/my', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    // Initialize structures if missing
    if (!data.userOutfits) data.userOutfits = {};
    if (!data.outfitCatalog) data.outfitCatalog = {};

    // Get user's inventory, create if missing
    if (!data.userOutfits[userId]) {
      data.userOutfits[userId] = { equipped: null, owned: [] };
    }

    const userData = data.userOutfits[userId];
    const ownedOutfits = userData.owned
      .map(outfitId => data.outfitCatalog[outfitId])
      .filter(Boolean);

    res.json({
      success: true,
      equipped: userData.equipped,
      outfits: ownedOutfits
    });

  } catch (err) {
    console.error("Error loading inventory:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST - Buy / Claim an outfit
 * Body: { userId, outfitId }
 */
router.post('/buy', async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId);
    const oid = parseInt(outfitId);

    if (!uid || !oid) {
      return res.status(400).json({ success: false, message: "User ID and Outfit ID are required" });
    }

    if (!data.outfitCatalog) data.outfitCatalog = {};
    const outfit = data.outfitCatalog[oid];
    if (!outfit) {
      return res.status(404).json({ success: false, message: "Outfit not found" });
    }

    if (!data.userOutfits) data.userOutfits = {};
    if (!data.userOutfits[uid]) {
      data.userOutfits[uid] = { equipped: null, owned: [] };
    }

    if (data.userOutfits[uid].owned.includes(oid)) {
      return res.json({ success: false, message: "You already own this outfit" });
    }

    data.userOutfits[uid].owned.push(oid);
    await saveData();

    res.json({ success: true, message: "Outfit added to your inventory" });

  } catch (err) {
    console.error("Error buying outfit:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST - Equip an outfit
 * Body: { userId, outfitId }
 */
router.post('/equip', async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId);
    const oid = parseInt(outfitId);

    if (!uid) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    if (!data.userOutfits || !data.userOutfits[uid]) {
      return res.status(404).json({ success: false, message: "User inventory not found" });
    }

    const userData = data.userOutfits[uid];
    if (!userData.owned.includes(oid)) {
      return res.status(403).json({ success: false, message: "You do not own this outfit" });
    }

    userData.equipped = oid;
    await saveData();

    res.json({ success: true, message: "Outfit equipped", equippedId: oid });

  } catch (err) {
    console.error("Error equipping outfit:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;