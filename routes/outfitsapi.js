const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

if (!data.userOutfits) data.userOutfits = {};
if (!data.outfitCatalog) data.outfitCatalog = {};

router.get('/my', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (isNaN(userId) || userId <= 0) return res.status(400).json({ success: false, message: "Valid user ID required" });

    if (!data.userOutfits[userId]) data.userOutfits[userId] = { equipped: null, owned: [] };
    const userData = data.userOutfits[userId];
    const ownedOutfits = userData.owned.map(id => data.outfitCatalog[id]).filter(Boolean);

    res.json({ success: true, equipped: userData.equipped, outfits: ownedOutfits });
  } catch (err) {
    console.error("Inventory error:", err);
    res.status(500).json({ success: false, message: "Server error loading inventory" });
  }
});

router.post('/buy', express.json(), async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId), oid = parseInt(outfitId);
    if (isNaN(uid) || isNaN(oid)) return res.status(400).json({ success: false, message: "Valid IDs required" });
    if (!data.outfitCatalog[oid]) return res.status(404).json({ success: false, message: "Outfit not found" });
    if (!data.userOutfits[uid]) data.userOutfits[uid] = { equipped: null, owned: [] };
    if (data.userOutfits[uid].owned.includes(oid)) return res.json({ success: false, message: "Already owned" });

    data.userOutfits[uid].owned.push(oid);
    data.outfitCatalog[oid].sales = (data.outfitCatalog[oid].sales || 0) + 1;
    await saveData();
    res.json({ success: true, message: "✅ Added to inventory" });
  } catch (err) {
    console.error("Buy error:", err);
    res.status(500).json({ success: false, message: "Purchase failed" });
  }
});

router.post('/equip', express.json(), async (req, res) => {
  try {
    const { userId, outfitId } = req.body;
    const uid = parseInt(userId), oid = parseInt(outfitId);
    if (isNaN(uid) || isNaN(oid)) return res.status(400).json({ success: false, message: "Valid IDs required" });
    if (!data.userOutfits[uid]) return res.status(404).json({ success: false, message: "Inventory not found" });
    if (!data.userOutfits[uid].owned.includes(oid)) return res.status(403).json({ success: false, message: "Own outfit first" });

    data.userOutfits[uid].equipped = oid;
    await saveData();
    res.json({ success: true, message: "✅ Equipped", equippedId: oid });
  } catch (err) {
    console.error("Equip error:", err);
    res.status(500).json({ success: false, message: "Equip failed" });
  }
});

module.exports = router;