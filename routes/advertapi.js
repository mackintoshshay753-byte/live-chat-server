const express = require("express");
const router = express.Router();
const multer = require("multer");
const sizeOf = require("image-size");
const { v4: uuidv4 } = require("uuid");

// ✅ Import YOUR existing data system — no separate files!
const { data, saveData } = require("../data");

// Multer config — keep in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (["image/png", "image/jpeg"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG and JPEG files allowed"), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB max
});

// Validate allowed ad sizes
const validateSize = (buffer) => {
  try {
    const dimensions = sizeOf(buffer);
    const validSizes = ["160x600", "728x90", "300x250"];
    const size = `${dimensions.width}x${dimensions.height}`;
    return { valid: validSizes.includes(size), size };
  } catch {
    return { valid: false, size: null };
  }
};

// Create new ad — saves into your existing data.ads
router.post("/ads", upload.single("ad"), async (req, res) => {
  try {
    const { name, userId, username } = req.body;

    if (!name || !userId || !username || !req.file) {
      return res.json({ success: false, error: "Name, user, and PNG file required" });
    }

    const { valid, size } = validateSize(req.file.buffer);
    if (!valid) {
      return res.json({
        success: false,
        error: "Only sizes allowed: 160x600, 728x90, 300x250"
      });
    }

    const base64 = req.file.buffer.toString("base64");
    const adId = uuidv4();

    // ✅ Store ad directly in your main data object
    data.ads[adId] = {
      id: adId,
      ownerId: userId,
      ownerName: username, // ✅ Shows exactly who owns it
      name,
      size,
      imageData: base64,
      active: false,
      createdAt: new Date().toISOString()
    };

    // ✅ Use YOUR existing atomic save function
    await saveData();

    res.json({
      success: true,
      ad: { id: adId, name, size, ownerName: username }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get all ads for a specific user
router.get("/ads", (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json({ success: false, error: "Missing userId" });

  const userAds = Object.values(data.ads || {})
    .filter(ad => ad.ownerId === userId)
    .map(ad => ({
      id: ad.id,
      name: ad.name,
      size: ad.size,
      active: ad.active,
      ownerId: ad.ownerId,
      ownerName: ad.ownerName,
      createdAt: ad.createdAt
    }));

  res.json({ success: true, ads: userAds });
});

// Get single ad with full image + owner info
router.get("/ads/:id/render", (req, res) => {
  const ad = data.ads?.[req.params.id];
  if (!ad) return res.json({ success: false, error: "Ad not found" });

  res.json({
    success: true,
    ad: {
      id: ad.id,
      name: ad.name,
      size: ad.size,
      active: ad.active,
      ownerId: ad.ownerId,
      ownerName: ad.ownerName,
      dataUrl: `data:image/png;base64,${ad.imageData}`
    }
  });
});

// Toggle active status
router.put("/ads/:id/toggle", express.json(), async (req, res) => {
  const ad = data.ads?.[req.params.id];
  if (!ad) return res.json({ success: false, error: "Ad not found" });

  ad.active = Boolean(req.body.active);
  await saveData();

  res.json({ success: true, ad: { id: ad.id, active: ad.active, ownerName: ad.ownerName } });
});

// Get active ads by size (rotates through them)
let lastShown = {};
router.get("/ads/active/:size", (req, res) => {
  const size = req.params.size;
  const ads = Object.values(data.ads || {}).filter(a => a.active && a.size === size);

  if (!ads.length) return res.json({ success: true, activeAd: null });

  const index = (lastShown[size] ?? -1) + 1 >= ads.length ? 0 : (lastShown[size] ?? -1) + 1;
  lastShown[size] = index;
  const ad = ads[index];

  res.json({
    success: true,
    activeAd: {
      id: ad.id,
      name: ad.name,
      size: ad.size,
      ownerName: ad.ownerName,
      dataUrl: `data:image/png;base64,${ad.imageData}`
    }
  });
});

// Get all active ads, shuffled
router.get("/ads/active-all", (req, res) => {
  const activeAds = Object.values(data.ads || {})
    .filter(a => a.active)
    .sort(() => Math.random() - 0.5)
    .map(ad => ({
      id: ad.id,
      name: ad.name,
      size: ad.size,
      ownerName: ad.ownerName,
      dataUrl: `data:image/png;base64,${ad.imageData}`
    }));

  res.json({ success: true, activeAds });
});

module.exports = router;