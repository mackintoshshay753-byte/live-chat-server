const express = require('express');
const router = express.Router();
const path = require('path');

router.get("/", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
router.get("/home", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'home.html')));
router.get("/settings", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'settings.html')));
router.get("/users/profile", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'profile.html')));

module.exports = router;