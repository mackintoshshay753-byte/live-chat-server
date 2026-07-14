const fs = require('fs').promises, { existsSync, renameSync } = require('fs'), path = require('path');

const DATA_PATH = path.join(__dirname, 'chat-data.json'), TEMP_DATA_PATH = path.join(__dirname, 'chat-data.tmp.json');
const ACTUAL_OWNER_USERNAME = "sadieandshay87";

const DEFAULT_DATA = {
  nextUserId: 1, registeredNames: {}, accounts: {}, userProfiles: {}, usernameToId: {},
  friendRequests: {}, friends: {}, usernameHistory: [], messages: {}, moderationLogs: [],
  deletedAccounts: {}, groups: [], nextGroupId: 1, ads: {}, nextOutfitId: 5,
  outfitCatalog: {
    1: { id:1, name:"Default Male", price:0, head:"/images/avatars/head/male.png", thumbnail:"/images/avatars/thumbnail/male.png", uploadedBy:1, uploadedAt:new Date().toISOString(), sales:0, views:0 },
    2: { id:2, name:"Default Male", price:0, head:"/images/avatars/head/male2.png", thumbnail:"/images/avatars/thumbnail/male_2.png", uploadedBy:1, uploadedAt:new Date().toISOString(), sales:0, views:0 },
    3: { id:3, name:"Default Female", price:0, head:"/images/avatars/head/female.png", thumbnail:"/images/avatars/thumbnail/female.png", uploadedBy:1, uploadedAt:new Date().toISOString(), sales:0, views:0 },
    4: { id:4, name:"Default Female", price:0, head:"/images/avatars/head/female2.png", thumbnail:"/images/avatars/thumbnail/female_2.png", uploadedBy:1, uploadedAt:new Date().toISOString(), sales:0, views:0 }
  },
  userOutfits: {}
};

let data = structuredClone(DEFAULT_DATA), isSaving = false, savePending = false;

async function loadData() {
  try {
    if (!existsSync(DATA_PATH)) { console.log("📄 No data file — starting fresh"); return saveData(); }
    const loaded = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
    data = { ...structuredClone(DEFAULT_DATA), ...loaded, outfitCatalog: { ...DEFAULT_DATA.outfitCatalog, ...loaded.outfitCatalog } };

    Object.entries(data.userProfiles || {}).forEach(([u, p]) => {
      if (!data.accounts[u]) data.accounts[u] = { id: p.id };
      data.accounts[u].role = p.role || "user";
    });

    if (data.userProfiles[ACTUAL_OWNER_USERNAME]?.role !== "owner") {
      data.userProfiles[ACTUAL_OWNER_USERNAME] = { ...data.userProfiles[ACTUAL_OWNER_USERNAME], role: "owner" };
      data.accounts[ACTUAL_OWNER_USERNAME] = { ...data.accounts[ACTUAL_OWNER_USERNAME], role: "owner" };
      await saveData();
      console.log(`✅ ${ACTUAL_OWNER_USERNAME} set as Owner`);
    } else console.log("✅ Data loaded successfully");
  } catch (err) {
    console.error("⚠️ Error — resetting:", err.message);
    if (existsSync(DATA_PATH)) try { renameSync(DATA_PATH, `${DATA_PATH}.bak-${Date.now()}.json`) } catch {}
    data = structuredClone(DEFAULT_DATA); await saveData();
  }
}

async function saveData() {
  if (isSaving) return savePending = true;
  isSaving = true;
  try {
    await fs.writeFile(TEMP_DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(TEMP_DATA_PATH, DATA_PATH);
  } catch (err) { console.error("❌ Save failed:", err.message) }
  finally { isSaving = false; if (savePending) { savePending = false; await saveData() } }
}

const setRoleOnSignup = (u, r="user") => u.toLowerCase() === ACTUAL_OWNER_USERNAME.toLowerCase() ? "owner" : r;

module.exports = { get data() { return data }, setData: d => data = d, loadData, saveData, setRoleOnSignup, ACTUAL_OWNER_USERNAME };