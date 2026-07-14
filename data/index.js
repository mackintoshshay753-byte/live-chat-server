const fs = require('fs').promises;
const { existsSync, renameSync } = require('fs');
const path = require('path');

const DEFAULT_CATALOG = require('./catalogtable');
const DATA_PATH = path.join(__dirname, 'chat-data.json');
const TEMP_DATA_PATH = path.join(__dirname, 'chat-data.tmp.json');

const DEFAULT_DATA = {
  nextUserId: 1,
  registeredNames: {},
  accounts: {},
  userProfiles: {},
  usernameToId: {},
  friendRequests: {},
  friends: {},
  usernameHistory: [],
  messages: {},
  moderationLogs: [],
  deletedAccounts: {},
  groups: [],
  nextGroupId: 1,
  ads: {},
  nextOutfitId: 6, // Matches your highest catalog ID +1
  outfitCatalog: DEFAULT_CATALOG,
  userOutfits: {},
};

let data = { ...DEFAULT_DATA };
const OWNER_USER_ID = 1; // ✅ Owner is fixed to ID 1 forever

let isSaving = false;
let savePending = false;

async function loadData() {
  try {
    if (!existsSync(DATA_PATH)) {
      console.log("📄 No data file — starting fresh");
      await saveData();
      return;
    }

    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    
    data = { ...DEFAULT_DATA, ...loaded };

    // Sync roles from userProfiles into accounts
    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      data.accounts[uname].role = prof.role || "user";
    });

    // ✅ Force OWNER role for User ID 1 (always works, even if username changes)
    const ownerProfile = Object.values(data.userProfiles || {}).find(p => Number(p.id) === OWNER_USER_ID);
    if (ownerProfile) {
      if (ownerProfile.role !== "owner") {
        ownerProfile.role = "owner";
        if (data.accounts[ownerProfile.username]) {
          data.accounts[ownerProfile.username].role = "owner";
        }
        await saveData();
        console.log(`✅ User ID ${OWNER_USER_ID} set as Owner`);
      }
    } else {
      console.log(`ℹ️ First registered user will get ID ${OWNER_USER_ID} and Owner role`);
    }

    console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Data corruption/error detected — backing up and restarting fresh:", err.message);
    
    if (existsSync(DATA_PATH)) {
      renameSync(DATA_PATH, `${DATA_PATH}.bak-${Date.now()}.json`);
    }
    
    data = { ...DEFAULT_DATA };
    await saveData();
  }
}

async function saveData() {
  if (isSaving) {
    savePending = true;
    return;
  }
  
  isSaving = true;

  try {
    const payload = JSON.stringify(data, null, 2);
    await fs.writeFile(TEMP_DATA_PATH, payload, 'utf8');
    await fs.rename(TEMP_DATA_PATH, DATA_PATH);
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  } finally {
    isSaving = false;
    
    if (savePending) {
      savePending = false;
      await saveData();
    }
  }
}

// ✅ Assign Owner role to anyone registering with ID 1
function setRoleOnSignup(userId, role = "user") {
  return Number(userId) === OWNER_USER_ID ? "owner" : role;
}

module.exports = { 
  get data() { return data; },
  setData: (newData) => { data = newData; },
  loadData, 
  saveData, 
  setRoleOnSignup,
  OWNER_USER_ID
};