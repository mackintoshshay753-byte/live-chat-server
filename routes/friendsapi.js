const express = require('express');
const router = express.Router();
const { data, saveData } = require('../data');

const MAX_FRIENDS = 200;
const isValidId = id => Number.isInteger(id) && id > 0;
const userExists = id => Object.values(data.accounts || {}).some(acc => acc.id === id);

router.post("/request", (req, res) => {
  try {
    const { fromId, fromUsername, toId } = req.body;
    const fromIdNum = Number(fromId);
    const toIdNum = Number(toId);

    if (!isValidId(fromIdNum) || !isValidId(toIdNum) || fromIdNum === toIdNum)
      return res.status(400).json({ success: false, error: "Invalid IDs" });

    if (typeof fromUsername !== "string" || fromUsername.trim().length < 2 || fromUsername.trim().length > 30)
      return res.status(400).json({ success: false, error: "Invalid username" });

    if (!userExists(fromIdNum) || !userExists(toIdNum))
      return res.status(404).json({ success: false, error: "User not found" });

    if (!Array.isArray(data.friendRequests[toIdNum])) data.friendRequests[toIdNum] = [];

    const alreadyRequested = data.friendRequests[toIdNum].some(r => r.fromId === fromIdNum);
    if (alreadyRequested)
      return res.status(409).json({ success: false, error: "Request already sent" });

    const alreadyFriends = Array.isArray(data.friends?.[fromIdNum]) && data.friends[fromIdNum].includes(toIdNum);
    if (alreadyFriends)
      return res.status(409).json({ success: false, error: "Already friends" });

    if ((data.friends?.[fromIdNum]?.length || 0) >= MAX_FRIENDS)
      return res.status(403).json({ success: false, error: "You have reached the maximum number of friends" });

    if ((data.friends?.[toIdNum]?.length || 0) >= MAX_FRIENDS)
      return res.status(403).json({ success: false, error: "This user has reached the maximum number of friends" });

    data.friendRequests[toIdNum].push({
      fromId: fromIdNum,
      fromUsername: fromUsername.trim(),
      timestamp: new Date().toISOString()
    });

    saveData();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/requests/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!isValidId(userId))
      return res.status(400).json({ success: false, error: "Invalid ID" });

    const requests = Array.isArray(data.friendRequests[userId]) ? data.friendRequests[userId] : [];
    return res.status(200).json({ success: true, requests });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/accept", (req, res) => {
  try {
    const { fromId, toId } = req.body;
    const fromIdNum = Number(fromId);
    const toIdNum = Number(toId);

    if (!isValidId(fromIdNum) || !isValidId(toIdNum))
      return res.status(400).json({ success: false, error: "Invalid IDs" });

    if (!Array.isArray(data.friendRequests[toIdNum]))
      return res.status(404).json({ success: false, error: "No request found" });

    const exists = data.friendRequests[toIdNum].some(r => r.fromId === fromIdNum);
    if (!exists)
      return res.status(404).json({ success: false, error: "Request not found" });

    if ((data.friends?.[fromIdNum]?.length || 0) >= MAX_FRIENDS)
      return res.status(403).json({ success: false, error: "Sender has reached maximum friends" });

    if ((data.friends?.[toIdNum]?.length || 0) >= MAX_FRIENDS)
      return res.status(403).json({ success: false, error: "You have reached maximum friends" });

    data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);

    if (!Array.isArray(data.friends[fromIdNum])) data.friends[fromIdNum] = [];
    if (!Array.isArray(data.friends[toIdNum])) data.friends[toIdNum] = [];

    if (!data.friends[fromIdNum].includes(toIdNum)) data.friends[fromIdNum].push(toIdNum);
    if (!data.friends[toIdNum].includes(fromIdNum)) data.friends[toIdNum].push(fromIdNum);

    saveData();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/reject", (req, res) => {
  try {
    const { fromId, toId } = req.body;
    const fromIdNum = Number(fromId);
    const toIdNum = Number(toId);

    if (!isValidId(fromIdNum) || !isValidId(toIdNum))
      return res.status(400).json({ success: false, error: "Invalid IDs" });

    let removed = false;
    if (Array.isArray(data.friendRequests[toIdNum])) {
      const before = data.friendRequests[toIdNum].length;
      data.friendRequests[toIdNum] = data.friendRequests[toIdNum].filter(r => r.fromId !== fromIdNum);
      removed = data.friendRequests[toIdNum].length < before;
    }

    if (removed) saveData();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.post("/unfriend", (req, res) => {
  try {
    const { userId, friendId } = req.body;
    const userIdNum = Number(userId);
    const friendIdNum = Number(friendId);

    if (!isValidId(userIdNum) || !isValidId(friendIdNum) || userIdNum === friendIdNum)
      return res.status(400).json({ success: false, error: "Invalid IDs" });

    let changed = false;
    if (Array.isArray(data.friends[userIdNum])) {
      const before = data.friends[userIdNum].length;
      data.friends[userIdNum] = data.friends[userIdNum].filter(id => id !== friendIdNum);
      if (data.friends[userIdNum].length !== before) changed = true;
    }

    if (Array.isArray(data.friends[friendIdNum])) {
      const before = data.friends[friendIdNum].length;
      data.friends[friendIdNum] = data.friends[friendIdNum].filter(id => id !== userIdNum);
      if (data.friends[friendIdNum].length !== before) changed = true;
    }

    if (changed) saveData();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

router.get("/list/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!isValidId(userId))
      return res.status(400).json({ success: false, error: "Invalid ID" });

    const friendIds = Array.isArray(data.friends[userId]) ? data.friends[userId] : [];
    const friends = Object.values(data.accounts || {})
      .filter(acc => friendIds.includes(acc.id))
      .map(acc => ({ id: acc.id, username: acc.username }));

    return res.status(200).json({ success: true, friends });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;