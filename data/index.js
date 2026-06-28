const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json');

// Start EMPTY — no pre-made accounts
const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  friendRequests: {},
  friends: {},
  moderationLogs: [],
  deletedAccounts: {} // Added for archive
};

let data = { ...DEFAULT_DATA };
const ACTUAL_OWNER_USERNAME = "sadieandshay87";

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.log("📄 No data file — starting fresh");
    saveData();
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    data = { ...DEFAULT_DATA, ...loaded };

    // Sync roles from userProfiles into accounts
    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      data.accounts[uname].role = prof.role || "user";
    });

    // Force main owner role
    if (data.userProfiles[ACTUAL_OWNER_USERNAME]) {
      if (data.userProfiles[ACTUAL_OWNER_USERNAME].role !== "owner") {
        data.userProfiles[ACTUAL_OWNER_USERNAME].role = "owner";
        data.accounts[ACTUAL_OWNER_USERNAME].role = "owner";
        saveData();
        console.log(`✅ ${ACTUAL_OWNER_USERNAME} set as Owner`);
      }
    } else {
      console.log(`ℹ️ ${ACTUAL_OWNER_USERNAME} will be Owner when registered`);
    }

    console.log("✅ Data loaded");
  } catch (err) {
    console.error("⚠️ Data error — starting fresh");
    if (fs.existsSync(DATA_PATH)) fs.renameSync(DATA_PATH, DATA_PATH + `.bak-${Date.now()}.json`);
    data = { ...DEFAULT_DATA };
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

function setRoleOnSignup(username, role = "user") {
  return username === ACTUAL_OWNER_USERNAME ? "owner" : role;
}

module.exports = { data, loadData, saveData, setRoleOnSignup, ACTUAL_OWNER_USERNAME };