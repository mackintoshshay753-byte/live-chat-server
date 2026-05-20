const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { data, saveData } = require('../data');
const { clean }          = require('../helpers');

// ─── Constants ────────────────────────────────────────────────
const UPLOAD_FOLDER   = path.join(__dirname, '../public/uploads/groups');
const DEFAULT_ICON    = '/uploads/groups/default-group.png';
const MAX_FILE_BYTES  = 5 * 1024 * 1024;          // 5 MB
const MAX_DESC_LEN    = 500;
const MAX_NAME_LEN    = 50;

// Allowed extensions AND their expected magic bytes (first 4 bytes)
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const MAGIC: Record<string, Buffer> = {};  // see checkMagic() below

if (!fs.existsSync(UPLOAD_FOLDER)) fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });

// ─── Magic-byte validation ────────────────────────────────────
// Clients control Content-Type; we verify the actual file bytes.
function checkMagic(filePath) {
  const buf = Buffer.alloc(12);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);

  const hex = buf.toString('hex');
  // JPEG: ffd8ff  PNG: 89504e47  GIF: 47494638  WEBP: 52494646????57454250
  return (
    hex.startsWith('ffd8ff')         ||   // JPEG
    hex.startsWith('89504e47')       ||   // PNG
    hex.startsWith('47494638')       ||   // GIF
    (hex.startsWith('52494646') && buf.slice(8, 12).toString('ascii') === 'WEBP') // WEBP
  );
}

// ─── Safe unlink ──────────────────────────────────────────────
function safeUnlink(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_) {}
}

// ─── Auth middleware ──────────────────────────────────────────
// Verifies the requesting user actually exists in accounts.
// NOTE: this is lightweight identity confirmation, not a signed
// session token. For stronger auth, issue JWTs on login and
// verify them here instead.
function requireUser(req, res, next) {
  const userId = Number(req.body.requestingUserId);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const account = Object.values(data.accounts).find(a => a.id === userId);
  if (!account) return res.status(401).json({ error: 'Not authenticated' });

  req.authedUserId = userId;
  next();
}

// ─── Multer config ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_FOLDER),
  filename:    (_req, file, cb) => {
    // Derive extension from mimetype — never trust originalname
    const mimeToExt = {
      'image/jpeg': '.jpg',
      'image/png':  '.png',
      'image/gif':  '.gif',
      'image/webp': '.webp',
    };
    const ext    = mimeToExt[file.mimetype] ?? '.bin';
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `group-${suffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits:     { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg','image/png','image/gif','image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, GIF, WEBP files are allowed'), false);
    }
  },
});

// ─── Helper: find group or 404 ────────────────────────────────
function findGroup(id, res) {
  const group = data.groups.find(g => g.id === Number(id));
  if (!group) { res.status(404).json({ error: 'Group not found' }); return null; }
  return group;
}

// ─── Helper: verify requester is group owner ──────────────────
function requireOwner(group, req, res) {
  if (group.createdById !== req.authedUserId) {
    res.status(403).json({ error: 'Only the group owner can do this' });
    return false;
  }
  return true;
}

// ─── POST /api/groups/create ──────────────────────────────────
router.post('/create', requireUser, upload.single('groupIcon'), (req, res) => {
  let uploadedPath = req.file?.path;
  try {
    const { name, description } = req.body;
    const cleanName = clean(name || '');

    if (cleanName.length < 3 || cleanName.length > MAX_NAME_LEN) {
      safeUnlink(uploadedPath);
      return res.status(400).json({ success: false, error: `Name must be 3–${MAX_NAME_LEN} characters` });
    }

    // Validate magic bytes if a file was uploaded
    if (req.file && !checkMagic(req.file.path)) {
      safeUnlink(uploadedPath);
      return res.status(400).json({ success: false, error: 'Invalid image file' });
    }

    // Resolve creator from authed ID — never trust body fields for identity
    const creatorAccount = Object.values(data.accounts).find(a => a.id === req.authedUserId);
    const creatorUsername = Object.keys(data.accounts).find(
      k => data.accounts[k].id === req.authedUserId
    );

    const iconUrl = req.file ? `/uploads/groups/${req.file.filename}` : DEFAULT_ICON;

    const newGroup = {
      id:          data.nextGroupId++,
      name:        cleanName,
      iconUrl,
      createdBy:   creatorUsername,
      createdById: req.authedUserId,
      description: clean(description || '').slice(0, MAX_DESC_LEN),
      createdDate: new Date().toISOString(),
      members: [{ userId: req.authedUserId, username: creatorUsername, role: 'owner' }],
    };

    data.groups.push(newGroup);
    saveData();
    res.json({ success: true, groupId: newGroup.id });
  } catch (err) {
    safeUnlink(uploadedPath);
    console.error('Create group error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── GET /api/groups/:id ──────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const group = findGroup(req.params.id, res);
    if (!group) return;
    res.json(group);
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/groups/:id/join ────────────────────────────────
router.post('/:id/join', requireUser, (req, res) => {
  try {
    const group = findGroup(req.params.id, res);
    if (!group) return;

    const alreadyMember = group.members.some(m => m.userId === req.authedUserId);
    if (alreadyMember) return res.status(409).json({ success: false, error: 'Already a member' });

    const username = Object.keys(data.accounts).find(
      k => data.accounts[k].id === req.authedUserId
    );

    group.members.push({ userId: req.authedUserId, username, role: 'member' });
    saveData();
    res.json({ success: true, message: 'Joined group' });
  } catch (err) {
    console.error('Join group error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── POST /api/groups/:id/update-icon ────────────────────────
router.post('/:id/update-icon', requireUser, upload.single('groupIcon'), (req, res) => {
  let uploadedPath = req.file?.path;
  try {
    const group = findGroup(req.params.id, res);
    if (!group) { safeUnlink(uploadedPath); return; }
    if (!requireOwner(group, req, res)) { safeUnlink(uploadedPath); return; }
    if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded' });

    if (!checkMagic(req.file.path)) {
      safeUnlink(uploadedPath);
      return res.status(400).json({ success: false, error: 'Invalid image file' });
    }

    // Delete old icon
    if (group.iconUrl && !group.iconUrl.includes('default-group.png')) {
      safeUnlink(path.join(__dirname, '../public', group.iconUrl));
    }

    group.iconUrl = `/uploads/groups/${req.file.filename}`;
    saveData();
    res.json({ success: true, newIconUrl: group.iconUrl });
  } catch (err) {
    safeUnlink(uploadedPath);
    console.error('Update icon error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── POST /api/groups/:id/update-description ─────────────────
router.post('/:id/update-description', requireUser, (req, res) => {
  try {
    const group = findGroup(req.params.id, res);
    if (!group) return;
    if (!requireOwner(group, req, res)) return;

    group.description = clean(req.body.description || '').slice(0, MAX_DESC_LEN);
    saveData();
    res.json({ success: true });
  } catch (err) {
    console.error('Update description error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── POST /api/groups/:id/change-owner ───────────────────────
router.post('/:id/change-owner', requireUser, (req, res) => {
  try {
    const group = findGroup(req.params.id, res);
    if (!group) return;
    if (!requireOwner(group, req, res)) return;

    const newOwnerId = Number(req.body.newOwnerId);
    if (!newOwnerId || newOwnerId === req.authedUserId)
      return res.status(400).json({ success: false, error: 'Invalid new owner' });

    const newOwnerMember = group.members.find(m => m.userId === newOwnerId);
    if (!newOwnerMember)
      return res.status(400).json({ success: false, error: 'User is not in this group' });

    // ✅ Capture old owner ID BEFORE mutating createdById
    const oldOwnerId = group.createdById;

    group.createdById = newOwnerId;
    group.createdBy   = newOwnerMember.username;

    // Update roles using the captured old ID
    group.members.forEach(m => {
      if (m.userId === oldOwnerId) m.role = 'member';
      if (m.userId === newOwnerId) m.role = 'owner';
    });

    saveData();
    res.json({ success: true });
  } catch (err) {
    console.error('Change owner error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;