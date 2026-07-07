const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const sizeOf = require("image-size");

// --- Setup storage ---
const uploadDir = path.join(__dirname, "../public/uploads/ads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Use JSON file for storage
const adsDbPath = path.join(__dirname, "../data/ads.json");
// Make sure the data folder exists too
if (!fs.existsSync(path.dirname(adsDbPath))) {
  fs.mkdirSync(path.dirname(adsDbPath), { recursive: true });
}

const ensureDb = () => {
  if (!fs.existsSync(adsDbPath)) fs.writeFileSync(adsDbPath, JSON.stringify([]));
};
const loadAds = () => {
  ensureDb();
  return JSON.parse(fs.readFileSync(adsDbPath, "utf8"));
};
const saveAds = (ads) => fs.writeFileSync(adsDbPath, JSON.stringify(ads, null, 2));

// --- Multer config ---
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${uuidv4()}.png`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png") cb(null, true);
    else cb(new Error("Only PNG files allowed"), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB max
});

// --- Validate image size ---
const validateSize = (filePath) => {
  try {
    const dimensions = sizeOf(filePath);
    const validSizes = ["160x600", "728x90", "300x250"];
    return {
      valid: validSizes.includes(`${dimensions.width}x${dimensions.height}`),
      size: `${dimensions.width}x${dimensions.height}`
    };
  } catch (err) {
    return { valid: false, size: null };
  }
};

// --- API Endpoints ---

// Create new ad
router.post("/ads", upload.single("ad"), (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id || "guest";

    if (!name || !req.file) {
      return res.json({ success: false, error: "Name and PNG file required" });
    }

    const { valid, size } = validateSize(req.file.path);
    if (!valid) {
      fs.unlinkSync(req.file.path);
      return res.json({ success: false, error: "Only sizes allowed: 160x600, 728x90, 300x250" });
    }

    const ads = loadAds();
    const ad = {
      id: uuidv4(),
      userId,
      name,
      size: size,
      imageUrl: `/uploads/ads/${req.file.filename}`,
      active: false,
      createdAt: new Date().toISOString()
    };

    ads.push(ad);
    saveAds(ads);

    res.json({ success: true, ad });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Get current user's ads
router.get("/ads", (req, res) => {
  const userId = req.user?.id || "guest";
  const userAds = loadAds().filter(a => a.userId === userId);
  res.json({ success: true, ads: userAds });
});

// Toggle ad active status
router.put("/ads/:id/toggle", express.json(), (req, res) => {
  const ads = loadAds();
  const ad = ads.find(a => a.id === req.params.id);
  if (!ad) return res.json({ success: false, error: "Ad not found" });

  ad.active = Boolean(req.body.active);
  saveAds(ads);
  res.json({ success: true, ad });
});

// Get active ad by size
router.get("/ads/active/:size", (req, res) => {
  const ads = loadAds();
  const requestedSize = req.params.size;
  const activeAd = ads.find(a => a.active && a.size === requestedSize);
  res.json({ success: true, activeAd: activeAd || null });
});

module.exports = router;