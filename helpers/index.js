const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');
const toxicity = require('@tensorflow-models/toxicity');

const modelPromise = toxicity.load(0.9);

function normalizeText(text) {
  if (!text) return '';

  const CHAR_MAP = {
    '0':'o','1':'i','3':'e','4':'a','5':'s',
    '$':'s','@':'a','!':'i'
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

    const inputs = [
      `username is ${norm}`,
      `this is a username: ${norm}`
    ];

    const results = await model.classify(inputs);

    return results.some(pred =>
      pred.results.some(r => r.match === true)
    );

  } catch (err) {
    console.error("AI moderation error:", err);
    return false; // fail safe
  }
}

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// ✅ IMPORTANT: NEVER throw for user input
async function createProfile(username) {
  const cleanedUsername = clean(username);

  if (!cleanedUsername) {
    return { error: "Username required" };
  }

  if (data.userProfiles[cleanedUsername]) {
    return data.userProfiles[cleanedUsername];
  }

  const bad = await isInappropriate(cleanedUsername);

  if (bad) {
    return { error: "Username contains inappropriate content" };
  }

  const profile = {
    id: data.nextUserId++,
    username: cleanedUsername,
    joinDate: new Date().toISOString(),
    lastOnline: new Date().toISOString(),
    theme: "light",
    bio: ""
  };

  data.userProfiles[cleanedUsername] = profile;
  data.usernameToId[cleanedUsername] = profile.id;

  saveData();
  return profile;
}

function getProfileById(id) {
  id = Number(id);
  if (!id) return null;

  const profile = Object.values(data.userProfiles)
    .find(p => Number(p.id) === id);

  if (!profile) return null;

  const currentUsername =
    Object.keys(data.userProfiles)
      .find(name => data.userProfiles[name].id === profile.id);

  return {
    id: profile.id,
    username: currentUsername || profile.username,
    joinDate: profile.joinDate,
    lastOnline: profile.lastOnline || null,
    theme: profile.theme,
    bio: profile.bio || ""
  };
}

module.exports = {
  clean,
  createProfile,
  getProfileById,
  isInappropriate
};