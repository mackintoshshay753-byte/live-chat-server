const express = require("express");
const router = express.Router();
const multer = require("multer");
const sizeOf = require("image-size");
const { v4: uuidv4 } = require("uuid");

// Keep everything in memory (no disk writes)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png") cb(null, true);
    else cb(new Error("Only PNG files allowed"), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB max
});

const adsDbPath = require("path").join(__dirname, "../data/ads.json");
const fs = require("fs");

const ensureDb = () => {
  const dir = require("path").dirname(adsDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(adsDbPath)) fs.writeFileSync(adsDbPath, "[]");
};
const loadAds = () => {
  ensureDb();
  return JSON.parse(fs.readFileSync(adsDbPath, "utf8"));
};
const saveAds = (ads) => fs.writeFileSync(adsDbPath, JSON.stringify(ads, null, 2));

// Validate image size from buffer
const validateSize = (buffer) => {
  try {
    const dimensions = sizeOf(buffer);
    const validSizes = ["160x600", "728x90", "300x250"];
    const size = `${dimensions.width}x${dimensions.height}`;
    return {
      valid: validSizes.includes(size),
      size
    };
  } catch {
    return { valid: false, size: null };
  }
};

// Create new ad (store as base64)
router.post("/ads", upload.single("ad"), (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id || "guest";

    if (!name || !req.file) {
      return res.json({ success: false, error: "Name and PNG file required" });
    }

    const { valid, size } = validateSize(req.file.buffer);
    if (!valid) {
      return res.json({
        success: false,
        error: "Only sizes allowed: 160x600, 728x90, 300x250"
      });
    }

    const base64 = req.file.buffer.toString("base64");

    const ads = loadAds();
    const ad = {
      id: uuidv4(),
      userId,
      name,
      size,
      // Store just the base64; we’ll build the data URL on the client
      imageData: base64,
      active: false,
      createdAt: new Date().toISOString()
    };

    ads.push(ad);
    saveAds(ads);

    res.json({ success: true, ad: { id: ad.id, name: ad.name, size: ad.size } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get current user's ads (without sending huge base64 every time if you like)
// For simplicity, send everything; you can trim later if needed.
router.get("/ads", (req, res) => {
  const userId = req.user?.id || "guest";
  const userAds = loadAds().filter(a => a.userId === userId);

  // Optionally strip base64 for list view to keep responses small:
  const lightAds = userAds.map(a => ({
    id: a.id,
    name: a.name,
    size: a.size,
    active: a.active,
    createdAt: a.createdAt
    // no imageData here
  }));

  res.json({ success: true, ads: lightAds });
});

// Get single ad with image data (for rendering)
router.get("/ads/:id/render", (req, res) => {
  const ads = loadAds();
  const ad = ads.find(a => a.id === req.params.id);
  if (!ad) return res.json({ success: false, error: "Ad not found" });

  res.json({
    success: true,
    ad: {
      id: ad.id,
      name: ad.name,
      size: ad.size,
      active: ad.active,
      dataUrl: `data:image/png;base64,${ad.imageData}`
    }
  });
});

// Toggle ad active status
router.put("/ads/:id/toggle", express.json(), (req, res) => {
  const ads = loadAds();
  const ad = ads.find(a => a.id === req.params.id);
  if (!ad) return res.json({ success: false, error: "Ad not found" });

  ad.active = Boolean(req.body.active);
  saveAds(ads);
  res.json({ success: true, ad: { id: ad.id, active: ad.active } });
});

// Get active ad by size (returns data URL)
router.get("/ads/active/:size", (req, res) => {
  const ads = loadAds();
  const requestedSize = req.params.size;
  const activeAd = ads.find(a => a.active && a.size === requestedSize);

  if (!activeAd) {
    return res.json({ success: true, activeAd: null });
  }

  res.json({
    success: true,
    activeAd: {
      id: activeAd.id,
      name: activeAd.name,
      size: activeAd.size,
      dataUrl: `data:image/png;base64,${activeAd.imageData}`
    }
  });
});

router.get("/ads/active-all", (req, res) => {
  const ads = loadAds();
  const activeAds = ads.filter(a => a.active).map(a => ({
    id: a.id, name: a.name, size: a.size, dataUrl: `data:image/png;base64,${a.imageData}`
  }));
  res.json({ success: true, activeAds });
});

module.exports = router;