const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// ✅ CHANGE: Use your existing data.js instead of chat-data
const { data, saveData } = require('../data');

// --------------------------
// 📂 Save location: next to your data file, NOT in /public
// --------------------------
const ROOT_FOLDER = path.join(__dirname, '..');
const OUTFITS_FOLDER = path.join(ROOT_FOLDER, 'outfits-images');
const HEAD_FOLDER = path.join(OUTFITS_FOLDER, 'head');
const THUMB_FOLDER = path.join(OUTFITS_FOLDER, 'thumbnail');

// Create folders automatically if they don't exist
(async () => {
  try {
    await fs.mkdir(HEAD_FOLDER, { recursive: true });
    await fs.mkdir(THUMB_FOLDER, { recursive: true });
  } catch (err) {
    console.error("Failed to create outfit folders:", err);
  }
})();

// --------------------------
// File upload setup
// --------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = file.fieldname === "head" ? HEAD_FOLDER : THUMB_FOLDER;
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Make sure nextOutfitId exists
    if (!data.nextOutfitId) data.nextOutfitId = 1;
    const outfitId = data.nextOutfitId;
    const type = file.fieldname;
    cb(null, `outfit_${outfitId}_${type}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /png|jpg|jpeg|gif/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPG, and GIF files are allowed."));
    }
  }
});

// --------------------------
// Access control
// --------------------------
const ALLOWED_UPLOAD_IDS = [1]; // Only user ID 1 can upload

// --------------------------
// Routes
// --------------------------

// Get all outfits
router.get('/', (req, res) => {
  // Initialize structure if missing
  if (!data.outfitCatalog) data.outfitCatalog = {};
  res.json({ success: true, catalog: data.outfitCatalog });
});

// Serve uploaded images
router.use('/images/outfits', express.static(OUTFITS_FOLDER));

// Upload new outfit
router.post(
  '/upload',
  upload.fields([{ name: 'head', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { name, price, uploaderId } = req.body;
      const headFile = req.files?.head?.[0];
      const thumbFile = req.files?.thumbnail?.[0];

      // Check permission
      if (!ALLOWED_UPLOAD_IDS.includes(Number(uploaderId))) {
        return res.status(403).json({ success: false, message: "You are not allowed to upload outfits." });
      }

      if (!name || !price || !headFile || !thumbFile) {
        return res.status(400).json({ success: false, message: "Missing name, price, or both images." });
      }

      // Ensure IDs exist
      if (!data.nextOutfitId) data.nextOutfitId = 1;
      if (!data.outfitCatalog) data.outfitCatalog = {};

      const outfitId = data.nextOutfitId;
      const headPath = `/api/catalog/images/outfits/head/${headFile.filename}`;
      const thumbPath = `/api/catalog/images/outfits/thumbnail/${thumbFile.filename}`;

      data.outfitCatalog[outfitId] = {
        id: outfitId,
        name: name.trim(),
        price: Number(price),
        head: headPath,
        thumbnail: thumbPath,
        uploadedBy: Number(uploaderId),
        uploadedAt: new Date().toISOString()
      };

      data.nextOutfitId += 1;
      await saveData();

      res.json({ success: true, message: "Outfit uploaded successfully!", outfitId });

    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ success: false, message: err.message || "Failed to upload outfit." });
    }
  }
);

module.exports = router;