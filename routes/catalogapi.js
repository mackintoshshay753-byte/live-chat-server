const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const { data, saveData } = require('../data');

// --------------------------
// 📂 Image storage setup
// --------------------------
// Use absolute path to avoid issues
const ROOT = path.resolve(__dirname, '..');
const OUTFITS_DIR = path.join(ROOT, 'outfits-images');
const HEAD_DIR = path.join(OUTFITS_DIR, 'head');
const THUMB_DIR = path.join(OUTFITS_DIR, 'thumbnail');

// Create folders if missing
(async () => {
  try {
    await fs.mkdir(HEAD_DIR, { recursive: true });
    await fs.mkdir(THUMB_DIR, { recursive: true });
    console.log('✅ Outfit folders ready');
  } catch (err) {
    console.error('❌ Failed to create folders:', err);
  }
})();

// --------------------------
// Multer storage config
// --------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'head' ? HEAD_DIR : THUMB_DIR;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Get safe extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.gif'];
    if (!allowed.includes(ext)) return cb(new Error('Invalid file type'));

    // Ensure we have an ID
    if (!data.nextOutfitId) data.nextOutfitId = 1;
    const id = data.nextOutfitId;
    const type = file.fieldname;

    // Clean filename
    const safeName = `outfit_${id}_${type}${ext}`;
    cb(null, safeName);
  }
});

// Multer upload rules
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(png|jpeg|gif)$/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, GIF allowed'));
  }
});

// --------------------------
// Access control
// --------------------------
const ALLOWED_UPLOAD_IDS = [1];

// --------------------------
// Serve images — THIS IS KEY
// --------------------------
// Make sure Express can find and return the files
router.use('/images/outfits', express.static(OUTFITS_DIR, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// --------------------------
// Routes
// --------------------------
router.get('/', (req, res) => {
  if (!data.outfitCatalog) data.outfitCatalog = {};
  res.json({ success: true, catalog: data.outfitCatalog });
});

router.post(
  '/upload',
  upload.fields([{ name: 'head', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]),
  async (req, res) => {
    try {
      const { name, price, uploaderId } = req.body;
      const headFile = req.files?.head?.[0];
      const thumbFile = req.files?.thumbnail?.[0];

      if (!ALLOWED_UPLOAD_IDS.includes(Number(uploaderId))) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }

      if (!name || !price || !headFile || !thumbFile) {
        return res.status(400).json({ success: false, message: 'Fill all fields and select images' });
      }

      if (!data.nextOutfitId) data.nextOutfitId = 1;
      if (!data.outfitCatalog) data.outfitCatalog = {};

      const outfitId = data.nextOutfitId;

      // ✅ This URL is what your frontend will use — it works directly in <img>
      const headUrl = `/api/catalog/images/outfits/head/${headFile.filename}`;
      const thumbUrl = `/api/catalog/images/outfits/thumbnail/${thumbFile.filename}`;

      data.outfitCatalog[outfitId] = {
        id: outfitId,
        name: name.trim(),
        price: Number(price),
        head: headUrl,
        thumbnail: thumbUrl,
        uploadedBy: Number(uploaderId),
        uploadedAt: new Date().toISOString()
      };

      data.nextOutfitId += 1;
      await saveData();

      res.json({ success: true, message: '✅ Uploaded!', outfitId, headUrl, thumbUrl });

    } catch (err) {
      console.error('❌ Upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
  }
);

module.exports = router;