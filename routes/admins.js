const express = require("express");
const router = express.Router();

const { data, saveData } = require("../data");
const { hasRole } = require("./permissions");

const VALID_ROLES = [
  "user",
  "moderator",
  "admin",
  "owner"
];

// Helper: get user from BOTH accounts and userProfiles
function getUserById(userId) {
  userId = Number(userId);
  let user = null;
  let username = null;
  let role = "user";

  // 1. Check accounts first
  const accEntry = Object.entries(data.accounts).find(([_, a]) => a.id === userId);
  if (accEntry) {
    username = accEntry[0];
    role = accEntry[1].role || "user";
    user = accEntry[1];
  }

  // 2. If not found or role is missing, check userProfiles
  const profile = Object.values(data.userProfiles).find(p => p.id === userId);
  if (profile) {
    username = profile.username;
    role = profile.role || "user";
    // Sync back to accounts so it's always in one place
    if (!data.accounts[username] || data.accounts[username].role !== role) {
      data.accounts[username] = { id: userId, role };
      saveData();
    }
  }

  return user ? { username, role, ...user } : profile ? { username, role, id: userId } : null;
}

// Change a user's role
router.post("/set-role", (req, res) => {
  try {
    const { actorId, targetId, role } = req.body;

    if (!actorId || !targetId || !role) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }

    if (!hasRole(actorId, "owner", data)) {
      return res.status(403).json({ success: false, error: "Owner permissions required" });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: "Invalid role" });
    }

    const target = getUserById(targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Update BOTH places
    if (data.accounts[target.username]) {
      data.accounts[target.username].role = role;
    }
    if (data.userProfiles[target.username]) {
      data.userProfiles[target.username].role = role;
    }

    if (!data.moderationLogs) data.moderationLogs = [];
    data.moderationLogs.push({
      type: "ROLE_CHANGE",
      actorId: Number(actorId),
      targetId: Number(targetId),
      newRole: role,
      timestamp: new Date().toISOString()
    });

    saveData();
    res.json({ success: true, role });

  } catch (err) {
    console.error("Set Role Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get all moderation logs
router.get("/logs", (req, res) => {
  try {
    res.json({ success: true, logs: data.moderationLogs || [] });
  } catch (err) {
    console.error("Logs Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get all staff members
router.get("/staff", (req, res) => {
  try {
    const staff = [];

    // Check both accounts AND profiles
    const seenIds = new Set();

    // From accounts
    Object.entries(data.accounts).forEach(([username, acc]) => {
      const role = acc.role || "user";
      if (role !== "user" && !seenIds.has(acc.id)) {
        seenIds.add(acc.id);
        staff.push({ id: acc.id, username, role });
      }
    });

    // From profiles (in case missing from accounts)
    Object.values(data.userProfiles || {}).forEach(profile => {
      const role = profile.role || "user";
      if (role !== "user" && !seenIds.has(profile.id)) {
        seenIds.add(profile.id);
        staff.push({ id: profile.id, username: profile.username, role });
        // Sync back to accounts
        data.accounts[profile.username] = { id: profile.id, role };
        saveData();
      }
    });

    res.json({ success: true, staff });

  } catch (err) {
    console.error("Staff Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get role of specific user
router.get("/role/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const user = getUserById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({
      success: true,
      id: user.id,
      username: user.username,
      role: user.role
    });

  } catch (err) {
    console.error("Role Error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;