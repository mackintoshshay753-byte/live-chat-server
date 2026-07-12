const express = require('express');
const router = express.Router();
const { data } = require('../data');

function getChatId(a, b) {
  const [x, y] = [Number(a), Number(b)].sort((u, v) => u - v);
  return `chat:${x}:${y}`;
}

// Get chat history between two users
router.get("/messages/:userId1/:userId2", (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    if (!userId1 || !userId2 || isNaN(userId1) || isNaN(userId2)) {
      return res.status(400).json({ success: false, message: "Invalid user IDs" });
    }
    const convId = getChatId(userId1, userId2);
    const messages = data.messages[convId] || [];
    res.json({ success: true, messages });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;