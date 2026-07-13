const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Helper: Return fallback instead of crashing if file is missing
const sendPublicFile = (res, filePath) => {
  const fullPath = path.join(__dirname, '..', 'public', filePath);
  if (fs.existsSync(fullPath)) return res.sendFile(fullPath);
  res.status(200).json({
    success: false,
    message: 'Frontend file not deployed yet — API is working fine',
    path: filePath
  });
};

router.get('/', (req, res) => sendPublicFile(res, 'index.html'));
router.get('/home', (req, res) => sendPublicFile(res, 'home.html'));
router.get('/users/profile', (req, res) => sendPublicFile(res, 'profile.html'));
router.get('/groups/create', (req, res) => sendPublicFile(res, 'create-group.html'));
router.get('/groups/groups', (req, res) => sendPublicFile(res, 'group.html'));
router.get('/groups/configure', (req, res) => sendPublicFile(res, 'configure.html'));
router.get('/search/users', (req, res) => sendPublicFile(res, 'search/users.html'));
router.get('/search/groups', (req, res) => sendPublicFile(res, 'search/groups.html'));
router.get('/my/account', (req, res) => sendPublicFile(res, 'account.html'));

module.exports = router;