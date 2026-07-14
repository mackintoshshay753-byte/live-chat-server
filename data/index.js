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
  nextOutfitId: 6,
  outfitCatalog: { ...DEFAULT_CATALOG }, // Correct merge now
  userOutfits: {},
};

let data = { ...DEFAULT_DATA };
const OWNER_USER_ID = 1;

let isSaving = false;
let savePending = false;

// ✅ EXACT MAPPING: Gender → Default Outfit ID
function getDefaultOutfitIdForGender(gender) {
  const g = String(gender || '').toLowerCase().trim();
  switch (g) {
    case 'male': return 1;   // Matches your Default Male ID
    case 'female': return 2; // Matches your Default Female ID
    case 'other':
    default: return 1;       // Safe fallback
  }
}

async function loadData() {
  try {
    if (!existsSync(DATA_PATH)) {
      console.log("📄 No data file — starting fresh");
      await saveData();
      return;
    }

    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const loaded = JSON.parse(raw);
    
    // ✅ Preserve defaults if catalog is missing/old
    data = {
      ...DEFAULT_DATA,
      ...loaded,
      outfitCatalog: { ...DEFAULT_CATALOG, ...(loaded.outfitCatalog || {}) }
    };

    // Sync roles
    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      data.accounts[uname].role = prof.role || "user";
    });

    // Force Owner for ID 1
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
      console.log(`ℹ️ First registered user gets ID ${OWNER_USER_ID} + Owner role`);
    }

    console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Corruption detected — resetting:", err.message);
    if (existsSync(DATA_PATH)) renameSync(DATA_PATH, `${DATA_PATH}.bak-${Date.now()}.json`);
    data = { ...DEFAULT_DATA };
    await saveData();
  }
}

async function saveData() {
  if (isSaving) { savePending = true; return; }
  isSaving = true;
  try {
    await fs.writeFile(TEMP_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(TEMP_DATA_PATH, DATA_PATH);
  } catch (err) { console.error("❌ Save failed:", err.message); }
  finally {
    isSaving = false;
    if (savePending) { savePending = false; await saveData(); }
  }
}

function setRoleOnSignup(userId, role = "user") {
  return Number(userId) === OWNER_USER_ID ? "owner" : role;
}

module.exports = { 
  get data() { return data; },
  setData: (newData) => { data = newData; },
  loadData, saveData, setRoleOnSignup,
  getDefaultOutfitIdForGender, // Export for use in signup/admin
  OWNER_USER_ID
};