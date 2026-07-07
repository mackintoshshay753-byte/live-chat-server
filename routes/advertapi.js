const express = require("express");
const router = express.Router();
const multer = require("multer");
const sizeOf = require("image-size");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

// ✅ PARSE USER ID FROM HEADER FIRST — THIS WAS MISSING BEFORE
router.use((req, res, next) => {
  const userId = req.headers["x-user-id"] || "guest";
  req.user = { id: userId };
  next();
});

router.use(express.json());

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "image/png") cb(null, true);
    else cb(new Error("Only PNG files allowed"), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

const adsDbPath = path.join(__dirname, "../data/ads.json");

const ensureDb = () => {
  const dir = path.dirname(adsDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(adsDbPath)) fs.writeFileSync(adsDbPath, "[]");
};
const loadAds = () => {
  ensureDb();
  return JSON.parse(fs.readFileSync(adsDbPath, "utf8"));
};
const saveAds = (ads) => fs.writeFileSync(adsDbPath, JSON.stringify(ads, null, 2));

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

// --------------------------
// ROUTES
// --------------------------

router.post("/ads", upload.single("ad"), (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name || !req.file) {
      return res.json({ success: false, error: "Name and PNG file required" });
    }

    const { valid, size } = validateSize(req.file.buffer);
    if (!valid) {
      return res.json({ success: false, error: "Only sizes allowed: 160x600, 728x90, 300x250" });
    }

    const base64 = req.file.buffer.toString("base64");
    const ads = loadAds();

    const ad = {
      id: uuidv4(),
      userId,
      name,
      size,
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

// ✅ ONLY return ads belonging to THIS user
router.get("/ads", (req, res) => {
  const userId = req.user.id;
  const allAds = loadAds();
  const userAds = allAds.filter(a => a.userId === userId);

  const lightAds = userAds.map(a => ({
    id: a.id,
    name: a.name,
    size: a.size,
    active: a.active,
    createdAt: a.createdAt
  }));

  res.json({ success: true, ads: lightAds });
});

router.get("/ads/:id/render", (req, res) => {
  const userId = req.user.id;
  const ads = loadAds();
  const ad = ads.find(a => a.id === req.params.id && a.userId === userId);

  if (!ad) return res.json({ success: false, error: "Ad not found or not yours" });

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

router.put("/ads/:id/toggle", (req, res) => {
  const userId = req.user.id;
  const ads = loadAds();
  const ad = ads.find(a => a.id === req.params.id && a.userId === userId);

  if (!ad) return res.json({ success: false, error: "Ad not found or not yours" });

  ad.active = Boolean(req.body.active);
  saveAds(ads);
  res.json({ success: true, ad: { id: ad.id, active: ad.active } });
});

router.delete("/ads/:id", (req, res) => {
  const userId = req.user.id;
  let ads = loadAds();
  const adIndex = ads.findIndex(a => a.id === req.params.id && a.userId === userId);

  if (adIndex === -1) return res.json({ success: false, error: "Ad not found or not yours" });

  ads.splice(adIndex, 1);
  saveAds(ads);
  res.json({ success: true, message: "Ad deleted" });
});

// Public route — shows all active ads for homepage
router.get("/ads/active/:size", (req, res) => {
  const ads = loadAds();
  const activeAd = ads.find(a => a.active && a.size === req.params.size);
  res.json({ success: true, activeAd: activeAd || null });
});

router.get("/ads/active-all", (req, res) => {
  const ads = loadAds();
  const activeAds = ads.filter(a => a.active).map(a => ({
    id: a.id,
    name: a.name,
    size: a.size,
    dataUrl: `data:image/png;base64,${a.imageData}`
  }));
  res.json({ success: true, activeAds });
});

module.exports = router;