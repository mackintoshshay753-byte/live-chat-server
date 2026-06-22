const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');
const toxicity = require('@tensorflow-models/toxicity');

const modelPromise = toxicity.load(0.7);

function normalizeText(text) {
  if (!text) return '';

  const CHAR_MAP = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '$': 's',
    '@': 'a',
    '!': 'i'
  };

  return text
    .toLowerCase()
    .trim()
    .split('')
    .map(c => CHAR_MAP[c] || c)
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

async function isInappropriate(text) {
  if (!text) return false;

  try {
    const model = await modelPromise;

    const norm = normalizeText(text);

    const results = await model.classify([
      norm,
      `username is ${norm}`,
      `this is a username: ${norm}`
    ]);

    return results.some(pred =>
      pred.results?.some(r => r.match === true)
    );
  } catch (err) {
    console.error("Toxicity error:", err);
    return false;
  }
}

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

async function createProfile(username) {
  const cleanedUsername = clean(username);

  if (!cleanedUsername) {
    return { success: false, message: "Username required" };
  }

  if (cleanedUsername.length < 3 || cleanedUsername.length > 20) {
    return { success: false, message: "Username must be 3–20 characters" };
  }

  if (data.userProfiles[cleanedUsername]) {
    return {
      success: false,
      message: "Username already exists"
    };
  }

  const bad = await isInappropriate(cleanedUsername);

  if (bad) {
    return {
      success: false,
      message: "Username is not appropriate"
    };
  }

  const profile = {
    id: data.nextUserId++,
    username: cleanedUsername,
    joinDate: new Date().toISOString(),
    lastOnline: new Date().toISOString(),
    theme: "light",
    bio: "",
    birthday: null
  };

  data.userProfiles[cleanedUsername] = profile;
  data.usernameToId[cleanedUsername] = profile.id;

  saveData();

  return {
    success: true,
    user: profile
  };
}

function getProfileById(id) {
  id = Number(id);

  if (!id) return null;

  const profile = Object.values(data.userProfiles)
    .find(p => p && Number(p.id) === id);

  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    joinDate: profile.joinDate || null,
    lastOnline: profile.lastOnline || null,
    theme: profile.theme || "light",
    bio: profile.bio || "",
    birthday: profile.birthday || null
  };
}

module.exports = {
  clean,
  createProfile,
  getProfileById,
  isInappropriate
};