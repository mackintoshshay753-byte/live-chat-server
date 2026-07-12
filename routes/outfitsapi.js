const express = require('express');
const router = express.Router();
const { data, saveData } = require('../chat-data');

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

    // Get user's inventory, create if missing
    if (!data.userOutfits[userId]) {
      data.userOutfits[userId] = { equipped: null, owned: [] };
    }

    const userData = data.userOutfits[userId];
    const ownedOutfits = userData.owned
      .map(outfitId => data.outfitCatalog[outfitId])
      .filter(Boolean); // Remove any deleted outfits

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

    const outfit = data.outfitCatalog[oid];
    if (!outfit) {
      return res.status(404).json({ success: false, message: "Outfit not found" });
    }

    // Initialize user inventory if it doesn't exist
    if (!data.userOutfits[uid]) {
      data.userOutfits[uid] = { equipped: null, owned: [] };
    }

    // Check if already owned
    if (data.userOutfits[uid].owned.includes(oid)) {
      return res.json({ success: false, message: "You already own this outfit" });
    }

    // For now: no payment system, just add to inventory
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

    const userData = data.userOutfits[uid];
    if (!userData || !userData.owned.includes(oid)) {
      return res.status(403).json({ success: false, message: "You do not own this outfit" });
    }

    // Update equipped
    userData.equipped = oid;
    await saveData();

    res.json({ success: true, message: "Outfit equipped", equippedId: oid });

  } catch (err) {
    console.error("Error equipping outfit:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;