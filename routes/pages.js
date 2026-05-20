const express = require('express');
const router = express.Router();
const path = require('path');

router.get("/", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
router.get("/home", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'home.html')));
router.get("/users/profile", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'profile.html')));
router.get("/groups/create", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'create-group.html')));
router.get("/groups/groups", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'group.html')));
router.get("/groups/configure", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'configure.html')));
router.get("/search/users", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'search.html')));
router.get("/my/account", (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'account.html')));

module.exports = router;