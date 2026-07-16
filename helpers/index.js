const sanitizeHtml = require('sanitize-html');
const bcrypt = require('bcrypt');
const { data, saveData, setRoleOnSignup } = require('../data');
const toxicity = require('@tensorflow-models/toxicity');

const modelPromise = toxicity.load(0.7);

function normalizeText(text) {
  if (!text) return '';
  const CHAR_MAP = { '0':'o', '1':'i', '3':'e', '4':'a', '5':'s', '$':'s', '@':'a', '!':'i' };
  return text.toLowerCase().trim()
    .split('').map(c => CHAR_MAP[c] || c).join('')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/(.)\1+/g, '$1');
}

async function isInappropriate(text) {
  if (!text) return false;
  try {
    const model = await modelPromise;
    const norm = normalizeText(text);
    const results = await model.classify([norm, `username is ${norm}`, `this is a username: ${norm}`]);
    return results.some(pred => pred.results?.some(r => r.match === true));
  } catch (err) {
    console.error("Toxicity check error:", err.message);
    return false;
  }
}

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
  });
}

async function createProfile(username, password) {
  const cleanedUsername = clean(username);
  if (!cleanedUsername) return { success: false, message: "Username required" };
  
  if (!password || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { success: false, message: "Password must be 8+ characters with letters and numbers" };
  }
  if (cleanedUsername.length < 3 || cleanedUsername.length > 20) {
    return { success: false, message: "Username must be 3–20 characters" };
  }
  if (/\s/.test(cleanedUsername) || !/^[a-zA-Z0-9_]+$/.test(cleanedUsername)) {
    return { success: false, message: "Only letters, numbers and underscores allowed; no spaces" };
  }

  const lowerName = cleanedUsername.toLowerCase();
  if (data.registeredNames[lowerName] || data.userProfiles[cleanedUsername]) {
    return { success: false, message: "Username already taken" };
  }

  const bad = await isInappropriate(cleanedUsername);
  if (bad) return { success: false, message: "Username is not appropriate" };

  const hashedPassword = await bcrypt.hash(password, 12);

  const newUserId = data.nextUserId;
  const userRole = setRoleOnSignup(newUserId);

  const profile = {
    id: newUserId,
    username: cleanedUsername,
    joinDate: new Date().toISOString(),
    lastOnline: null,
    isOnline: false,
    theme: "light",
    bio: "",
    birthday: null,
    gender: null,
    status: "",
    role: userRole
  };

  data.userProfiles[cleanedUsername] = profile;
  data.accounts[cleanedUsername] = {
    id: profile.id,
    hash: hashedPassword,
    role: userRole,
    joinDate: profile.joinDate,
    theme: "light",
    verified: false,
    banned: false,
    banReason: "",
    banUntil: null
  };
  data.registeredNames[lowerName] = true;
  data.usernameToId[cleanedUsername] = profile.id;

  data.nextUserId++;
  await saveData();
  return { success: true, user: profile };
}

function getProfileById(id) {
  id = Number(id);
  if (!id) return null;
  const profile = Object.values(data.userProfiles).find(p => p && Number(p.id) === id);
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    joinDate: profile.joinDate || null,
    lastOnline: profile.lastOnline || null,
    isOnline: profile.isOnline || false,
    theme: profile.theme || "light",
    bio: profile.bio || "",
    birthday: profile.birthday || null,
    gender: profile.gender || null,
    status: profile.status || "",
    role: profile.role || "user"
  };
}

async function updateStatus(userId, newStatus) {
  userId = Number(userId);
  const profile = Object.values(data.userProfiles).find(p => p && Number(p.id) === userId);
  if (!profile) return { success: false, error: "User not found" };
  const cleanedStatus = clean(newStatus).slice(0, 254);
  profile.status = cleanedStatus;
  profile.lastOnline = new Date().toISOString();
  await saveData();
  return { success: true, status: profile.status };
}

module.exports = { clean, createProfile, getProfileById, isInappropriate, updateStatus };