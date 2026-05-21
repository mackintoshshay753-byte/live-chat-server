const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Path to your messages data file
const MESSAGES_FILE = path.join(__dirname, '../data/messages.json');

// Helper: Read messages
const readMessages = () => {
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
};

// Helper: Write messages
const writeMessages = (data) => {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
};

// ✅ Send a message
router.post('/send', (req, res) => {
  const { fromId, fromUsername, toId, toUsername, content } = req.body;
  
  if (!fromId || !toId || !content) {
    return res.json({ success: false, error: 'Missing required fields' });
  }

  const messages = readMessages();
  const newMessage = {
    id: Date.now(),
    fromId,
    fromUsername,
    toId,
    toUsername,
    content,
    timestamp: new Date().toISOString(),
    read: false
  };

  messages.push(newMessage);
  writeMessages(messages);
  
  res.json({ success: true, message: 'Message sent' });
});

// ✅ Get inbox messages (received by user)
router.get('/inbox/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const messages = readMessages();
  const inbox = messages.filter(m => Number(m.toId) === userId);
  res.json({ success: true, messages: inbox });
});

// ✅ Get sent messages (from user)
router.get('/sent/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const messages = readMessages();
  const sent = messages.filter(m => Number(m.fromId) === userId);
  res.json({ success: true, messages: sent });
});

// ✅ Mark message as read
router.post('/mark-read', (req, res) => {
  const { messageId } = req.body;
  const messages = readMessages();
  const msg = messages.find(m => m.id === messageId);
  if (msg) {
    msg.read = true;
    writeMessages(messages);
    res.json({ success: true });
  } else {
    res.json({ success: false, error: 'Message not found' });
  }
});

module.exports = router;