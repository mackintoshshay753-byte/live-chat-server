const express = require('express');
const router = express.Router();
const { getProfileById } = require('../helpers');

router.get("/profile/:id", (req, res) => {
  const profile = getProfileById(req.params.id);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json(profile);
});

module.exports = router;