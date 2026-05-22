const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const MESSAGES_FILE = path.join(__dirname, '../data/messages.json');

// Read messages + create file if missing
const readMessages = async () => {
  try {
    await fs.access(MESSAGES_FILE);
  } catch {
    await fs.mkdir(path.dirname(MESSAGES_FILE), { recursive: true });
    await fs.writeFile(MESSAGES_FILE, JSON.stringify([], null, 2));
    return [];
  }
  const data = await fs.readFile(MESSAGES_FILE, 'utf8');
  return JSON.parse(data);
};

// Write messages
const writeMessages = async (data) => {
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(data, null, 2));
};

// Send message
router.post('/send', async (req, res) => {
  try {
    const { fromId, fromUsername, toId, toUsername, subject = '', content } = req.body;
    if (!fromId || !toId || !content) {
      return res.json({ success: false, error: 'Missing required fields' });
    }

    const messages = await readMessages();
    const newMessage = {
      id: Date.now(),
      fromId: Number(fromId),
      fromUsername,
      toId: Number(toId),
      toUsername,
      subject,
      content,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      read: false
    };

    messages.push(newMessage);
    await writeMessages(messages);
    res.json({ success: true, message: 'Message sent' });
  } catch (err) {
    res.json({ success: false, error: 'Server error while sending message' });
  }
});

// Get inbox
router.get('/inbox/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const messages = await readMessages();
    const inbox = messages.filter(m => m.toId === userId);
    res.json({ success: true, messages: inbox });
  } catch (err) {
    res.json({ success: false, error: 'Server error while fetching inbox' });
  }
});

// Get sent
router.get('/sent/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const messages = await readMessages();
    const sent = messages.filter(m => m.fromId === userId);
    res.json({ success: true, messages: sent });
  } catch (err) {
    res.json({ success: false, error: 'Server error while fetching sent messages' });
  }
});

// Mark as read
router.post('/read', async (req, res) => {
  try {
    const { messageId } = req.body;
    const messages = await readMessages();
    const msg = messages.find(m => m.id === Number(messageId));
    if (msg) {
      msg.read = true;
      await writeMessages(messages);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Message not found' });
    }
  } catch (err) {
    res.json({ success: false, error: 'Server error while updating message' });
  }
});

module.exports = router;