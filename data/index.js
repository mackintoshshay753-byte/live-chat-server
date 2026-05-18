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
  groups: [],        // ✅ MUST HAVE THIS
  nextGroupId: 1     // ✅ MUST HAVE THIS
};

let data = { ...DEFAULT_DATA };

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
    console.log("✅ Data loaded — ID 1 & all users preserved");
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