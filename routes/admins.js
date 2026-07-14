const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { data, saveData, OWNER_USER_ID, getDefaultOutfitIdForGender } = require('../data');

// --- Helper Functions ---
function resolveTarget(target) {
  const trimmed = String(target || '').trim();
  if (!trimmed) return null;

  // Match by user ID
  if (/^\d+$/.test(trimmed)) {
    const byId = Object.values(data.userProfiles).find(p => String(p.id) === trimmed);
    if (byId) return { id: byId.id, username: byId.username, role: data.accounts[byId.username]?.role || 'user' };
  }

  // Match by username
  const lower = trimmed.toLowerCase();
  if (data.usernameToId[lower]) {
    const uid = data.usernameToId[lower];
    const prof = data.userProfiles[uid];
    return { id: uid, username: prof.username, role: data.accounts[prof.username]?.role || 'user' };
  }

  return null;
}

function isStaff(role) {
  return ['moderator', 'admin', 'owner'].includes(role);
}

// --- Routes ---

// 🔍 Find User (required for ban/role checks)
router.get('/find-user', async (req, res) => {
  try {
    const target = req.query.query;
    const acc = resolveTarget(target);
    if (!acc) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, user: { id: acc.id, role: acc.role } });
  } catch (err) {
    console.error("Find user error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// 🎭 Get User Role
router.get('/role/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const profile = Object.values(data.userProfiles).find(p => Number(p.id) === userId);
    if (!profile) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, role: data.accounts[profile.username]?.role || 'user' });
  } catch (err) {
    console.error("Get role error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ✏️ Set User Role
router.post('/set-role', async (req, res) => {
  try {
    const { actorId, target, role } = req.body;
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);

    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!isStaff(actor.role)) return res.status(403).json({ success: false, error: "Permission denied" });
    if (targetAcc.id === OWNER_USER_ID && actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Cannot change main owner role" });
    if (role === 'owner' && actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Only main owner can assign owner role" });

    // Update both accounts and profiles
    data.accounts[targetAcc.username].role = role;
    data.userProfiles[targetAcc.username].role = role;
    await saveData();

    res.json({ success: true, message: "Role updated" });
  } catch (err) {
    console.error("Set role error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// 🚫 Ban User
router.post('/ban', async (req, res) => {
  try {
    const { actorId, target, reason, days } = req.body;
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);

    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!isStaff(actor.role)) return res.status(403).json({ success: false, error: "Permission denied" });
    if (targetAcc.id === actor.id) return res.status(400).json({ success: false, error: "Cannot ban yourself" });
    if (isStaff(targetAcc.role) && actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Cannot ban staff members" });

    const profile = data.userProfiles[targetAcc.username];
    const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    profile.banned = true;
    profile.banReason = reason;
    profile.banExpires = expiresAt;

    // Log action
    data.moderationLogs.unshift({
      type: 'BAN',
      targetId: targetAcc.id,
      targetName: targetAcc.username,
      reason,
      actorId: actor.id,
      actorName: actor.username,
      timestamp: new Date().toISOString()
    });

    await saveData();
    res.json({ success: true, message: "User banned" });
  } catch (err) {
    console.error("Ban error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ✅ Unban User
router.post('/unban', async (req, res) => {
  try {
    const { actorId, target } = req.body;
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);

    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (!isStaff(actor.role)) return res.status(403).json({ success: false, error: "Permission denied" });
    if (targetAcc.id === actor.id) return res.status(400).json({ success: false, error: "Cannot unban yourself" });

    const profile = data.userProfiles[targetAcc.username];
    profile.banned = false;
    delete profile.banReason;
    delete profile.banExpires;

    data.moderationLogs.unshift({
      type: 'UNBAN',
      targetId: targetAcc.id,
      targetName: targetAcc.username,
      actorId: actor.id,
      actorName: actor.username,
      timestamp: new Date().toISOString()
    });

    await saveData();
    res.json({ success: true, message: "User unbanned" });
  } catch (err) {
    console.error("Unban error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// 🗑️ Delete / Archive Account
router.post('/delete-account', async (req, res) => {
  try {
    const { actorId, target } = req.body;
    const actor = resolveTarget(actorId);
    const targetAcc = resolveTarget(target);

    if (!actor || !targetAcc) return res.status(404).json({ success: false, error: "User not found" });
    if (actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Only main owner can delete accounts" });
    if (targetAcc.id === actor.id) return res.status(400).json({ success: false, error: "Cannot delete your own account" });

    // Move to deleted archive
    const profile = data.userProfiles[targetAcc.username];
    data.deletedAccounts[targetAcc.id] = {
      ...profile,
      deletedAt: new Date().toISOString(),
      deletedBy: actor.id
    };

    // Remove from active data
    delete data.accounts[targetAcc.username];
    delete data.userProfiles[targetAcc.username];
    delete data.usernameToId[targetAcc.username.toLowerCase()];

    await saveData();
    res.json({ success: true, message: "Account archived" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ♻️ Recover Archived Account
router.post('/recover-account', async (req, res) => {
  try {
    const { actorId, target } = req.body;
    const actor = resolveTarget(actorId);
    const trimmed = String(target || '').trim();

    if (!actor || actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Only main owner can restore accounts" });

    // Find deleted account
    let deleted = null;
    if (/^\d+$/.test(trimmed)) deleted = data.deletedAccounts[trimmed];
    else deleted = Object.values(data.deletedAccounts).find(a => a.username.toLowerCase() === trimmed.toLowerCase());

    if (!deleted) return res.status(404).json({ success: false, error: "Deleted account not found" });

    // Restore to active data
    const { deletedAt, deletedBy, ...restored } = deleted;
    data.userProfiles[restored.username] = restored;
    data.accounts[restored.username] = { id: restored.id, role: restored.role };
    data.usernameToId[restored.username.toLowerCase()] = restored.id;
    delete data.deletedAccounts[restored.id];

    await saveData();
    res.json({ success: true, message: "Account restored" });
  } catch (err) {
    console.error("Recover error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// 👑 Create New Account (Owner Only)
router.post('/create-account', async (req, res) => {
  try {
    const { actorId, username, password, gender, birthday, role, customHead, customThumbnail } = req.body;
    const actor = resolveTarget(actorId);
    const clean = String(username || '').trim();

    if (!actor || actor.id !== OWNER_USER_ID) return res.status(403).json({ success: false, error: "Only main owner can create accounts" });
    if (!clean || !password || !gender || !birthday) return res.status(400).json({ success: false, error: "Missing required fields" });
    if (data.usernameToId[clean.toLowerCase()]) return res.status(400).json({ success: false, error: "Username already taken" });

    // Generate new user ID
    const newId = data.nextUserId;
    data.nextUserId += 1;
    const joinDate = new Date().toISOString();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Assign role (force owner for ID 1)
    const finalRole = Number(newId) === OWNER_USER_ID ? "owner" : (role || "user");

    // Save account data
    data.accounts[clean] = { id: newId, role: finalRole };
    data.userProfiles[clean] = {
      id: newId,
      username: clean,
      passwordHash,
      gender: gender.toLowerCase(),
      birthday,
      joinedAt: joinDate,
      role: finalRole,
      banned: false
    };
    data.usernameToId[clean.toLowerCase()] = newId;

    // 🎨 AVATAR/ OUTFIT LOGIC — EXACTLY AS YOU WANTED!
    if (customHead && customThumbnail) {
      // ✅ Use custom avatar if both files are uploaded
      const customOutfitId = data.nextOutfitId;
      data.outfitCatalog[customOutfitId] = {
        id: customOutfitId,
        name: `Custom: ${clean}`,
        price: 0,
        head: `data:image/png;base64,${customHead.trim()}`,
        thumbnail: `data:image/png;base64,${customThumbnail.trim()}`,
        uploadedBy: OWNER_USER_ID,
        uploadedAt: joinDate,
        sales: 1,
        views: 0
      };
      data.nextOutfitId += 1;

      if (!data.userOutfits[newId]) data.userOutfits[newId] = { equipped: null, owned: [] };
      data.userOutfits[newId].owned.push(customOutfitId);
      data.userOutfits[newId].equipped = customOutfitId;
      console.log(`✅ Custom outfit ${customOutfitId} assigned to ${clean}`);
    } else {
      // ✅ RANDOM DEFAULT FOR SELECTED GENDER — male = 1/2, female = 3/4
      const defaultOutfitId = getDefaultOutfitIdForGender(gender);
      console.log(`🎲 Picked default outfit ${defaultOutfitId} for ${gender} user ${clean}`);

      if (!data.userOutfits[newId]) data.userOutfits[newId] = { equipped: null, owned: [] };
      data.userOutfits[newId].owned.push(defaultOutfitId);
      data.userOutfits[newId].equipped = defaultOutfitId;
    }

    await saveData();
    res.json({ success: true, accountId: newId });
  } catch (err) {
    console.error("Create account error:", err);
    res.status(500).json({ success: false, error: "Server error creating account" });
  }
});

// 📋 Staff List
router.get('/staff', async (req, res) => {
  try {
    const staff = Object.values(data.userProfiles)
      .filter(p => isStaff(p.role))
      .map(p => ({
        id: p.id,
        username: p.username,
        role: p.role,
        banned: p.banned || false
      }));
    res.json({ success: true, staff });
  } catch (err) {
    console.error("Staff list error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// 📜 Moderation Logs
router.get('/logs', async (req, res) => {
  try {
    const logs = (data.moderationLogs || []).slice(0, 100); // Last 100 entries
    res.json({ success: true, logs });
  } catch (err) {
    console.error("Logs error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;