const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');

const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  friendRequests: {},
  friends: {},
  groups: [],
  nextGroupId: 1,
  ads: [],
  moderationLogs: []
};

let data = { ...DEFAULT_DATA };

// ----------------------
// EXACT SAME SAVE/LOAD AS YOUR ORIGINAL + AUTO-OWNER
// ----------------------
function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No file — creating new");
    saveData();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };

    // ✅ AUTO-SET YOU AS OWNER — NO MATTER THE USER ID
    const MY_OWNER_USERNAME = "sadieandshay87";
    if (data.accounts[MY_OWNER_USERNAME]) {
      data.accounts[MY_OWNER_USERNAME].role = "owner";
      console.log(`✅ ${MY_OWNER_USERNAME} confirmed as Owner`);
    } else {
      console.log(`ℹ️ ${MY_OWNER_USERNAME} not found yet — will become Owner when you sign up`);
    }

    console.log("✅ Data loaded — all users preserved");
  } catch (err) {
    console.error("⚠️ Data read error — backup saved, starting fresh");
    if (fs.existsSync(DATA_PATH)) fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}.json`);
    saveData();
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  }
}

module.exports = { data, loadData, saveData };