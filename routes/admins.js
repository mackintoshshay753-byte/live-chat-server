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

// Change a user's role
router.post("/set-role", (req, res) => {
  try {
    const {
      actorId,
      targetId,
      role
    } = req.body;

    if (!actorId || !targetId || !role) {
      return res.status(400).json({
        success: false,
        error: "Missing fields"
      });
    }

    if (!hasRole(actorId, "owner", data)) {
      return res.status(403).json({
        success: false,
        error: "Owner permissions required"
      });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: "Invalid role"
      });
    }

    const targetAccount = Object.values(data.accounts)
      .find(acc => acc.id === Number(targetId));

    if (!targetAccount) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    targetAccount.role = role;

    if (!data.moderationLogs) {
      data.moderationLogs = [];
    }

    data.moderationLogs.push({
      type: "ROLE_CHANGE",
      actorId: Number(actorId),
      targetId: Number(targetId),
      newRole: role,
      timestamp: new Date().toISOString()
    });

    saveData();

    res.json({
      success: true,
      role
    });

  } catch (err) {
    console.error("Set Role Error:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

// Get all moderation logs
router.get("/logs", (req, res) => {
  try {
    res.json({
      success: true,
      logs: data.moderationLogs || []
    });
  } catch (err) {
    console.error("Logs Error:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

// Get all staff members
router.get("/staff", (req, res) => {
  try {
    const staff = [];

    Object.entries(data.accounts).forEach(([username, account]) => {
      const role = account.role || "user";

      if (role !== "user") {
        staff.push({
          id: account.id,
          username,
          role
        });
      }
    });

    res.json({
      success: true,
      staff
    });

  } catch (err) {
    console.error("Staff Error:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

// Get role of specific user
router.get("/role/:userId", (req, res) => {
  try {
    const userId = Number(req.params.userId);

    const accountEntry = Object.entries(data.accounts)
      .find(([_, acc]) => acc.id === userId);

    if (!accountEntry) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const [username, account] = accountEntry;

    res.json({
      success: true,
      id: account.id,
      username,
      role: account.role || "user"
    });

  } catch (err) {
    console.error("Role Error:", err);

    res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

module.exports = router;