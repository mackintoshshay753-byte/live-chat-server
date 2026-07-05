const express = require('express');
const router = express.Router();
const { data } = require('../data');

function getChatId(a, b) {
  const [x, y] = [Number(a), Number(b)].sort((u, v) => u - v);
  return `chat:${x}:${y}`;
}

// Get chat history between two users
router.get("/messages/:userId1/:userId2", (req, res) => {
  const { userId1, userId2 } = req.params;
  const convId = getChatId(userId1, userId2);
  const messages = data.messages[convId] || [];
  res.json({ success: true, messages });
});

module.exports = router;