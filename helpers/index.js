const sanitizeHtml = require('sanitize-html');
const { data, saveData } = require('../data');
const toxicity = require('@tensorflow-models/toxicity');

let modelPromise = toxicity.load(0.8); // load once

function normalizeText(text) {
  if (!text) return '';
  const CHAR_MAP = { '0':'o','1':'i','3':'e','4':'a','5':'s','$':'s','@':'a','!':'i' };

  return text.toLowerCase()
    .trim()
    .split('')
    .map(c => CHAR_MAP[c] || c)
    .join('')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1');
}

// AI toxicity check
async function isInappropriate(text) {
  const model = await modelPromise;
  if (!text) return false;

  const norm = normalizeText(text);

  const results = await model.classify([norm]);

  return results.some(pred =>
    pred.results.some(r => r.match === true)
  );
}

function clean(input) {
  return sanitizeHtml(String(input || '').trim(), {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// FIX: must be async
async function createProfile(username) {
  const cleanedUsername = clean(username);

  if (data.userProfiles[cleanedUsername]) {
    return data.userProfiles[cleanedUsername];
  }

  if (await isInappropriate(cleanedUsername)) {
    throw new Error('Username contains inappropriate content');
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