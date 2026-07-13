const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "chatDB";
const COLLECTION_NAME = "appData";

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
  nextOutfitId: 5,
  outfitCatalog: {
    1: { id:1, name:"Default Male", price:0, head:"/images/avatars/head/male.png", thumbnail:"/images/avatars/thumbnail/male.png", uploadedBy:1, uploadedAt: new Date().toISOString(), sales:0, views:0 },
    2: { id:2, name:"Default Male Alt", price:0, head:"/images/avatars/head/male2.png", thumbnail:"/images/avatars/thumbnail/male_2.png", uploadedBy:1, uploadedAt: new Date().toISOString(), sales:0, views:0 },
    3: { id:3, name:"Default Female", price:0, head:"/images/avatars/head/female.png", thumbnail:"/images/avatars/thumbnail/female.png", uploadedBy:1, uploadedAt: new Date().toISOString(), sales:0, views:0 },
    4: { id:4, name:"Default Female Alt", price:0, head:"/images/avatars/head/female2.png", thumbnail:"/images/avatars/thumbnail/female_2.png", uploadedBy:1, uploadedAt: new Date().toISOString(), sales:0, views:0 }
  },
  userOutfits: {}
};

let mongoClient, db, appDataCol;
let data = { ...DEFAULT_DATA };
const ACTUAL_OWNER_USERNAME = "sadieandshay87";
let isSaving = false, savePending = false, isConnected = false;

async function connectMongo() {
  if (isConnected) return;
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
    });
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    appDataCol = db.collection(COLLECTION_NAME);
    isConnected = true;
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connect failed:", err.message);
    throw err;
  }
}

async function loadData() {
  try {
    await connectMongo();
    const stored = await appDataCol.findOne({ _id: "main" });
    data = stored ? { ...DEFAULT_DATA, ...stored.data } : { ...DEFAULT_DATA };
    console.log("✅ Data loaded from MongoDB");

    Object.entries(data.userProfiles || {}).forEach(([uname, prof]) => {
      if (!data.accounts[uname]) data.accounts[uname] = { id: prof.id };
      data.accounts[uname].role = prof.role || "user";
    });

    if (data.userProfiles[ACTUAL_OWNER_USERNAME]) {
      data.userProfiles[ACTUAL_OWNER_USERNAME].role = "owner";
      data.accounts[ACTUAL_OWNER_USERNAME].role = "owner";
      await saveData();
    }
  } catch (err) {
    console.error("⚠️ Load failed — starting fresh:", err.message);
    data = { ...DEFAULT_DATA };
    await saveData();
  }
}

async function saveData() {
  if (isSaving) { savePending = true; return; }
  isSaving = true;
  try {
    await connectMongo();
    await appDataCol.replaceOne(
      { _id: "main" },
      { _id: "main", data, updatedAt: new Date().toISOString() },
      { upsert: true }
    );
  } catch (err) {
    console.error("❌ Save failed:", err.message);
  } finally {
    isSaving = false;
    if (savePending) { savePending = false; await saveData(); }
  }
}

function setRoleOnSignup(username, role = "user") {
  return username === ACTUAL_OWNER_USERNAME ? "owner" : role;
}

module.exports = { 
  get data() { return data },
  setData: newData => { data = newData },
  loadData, saveData, setRoleOnSignup, ACTUAL_OWNER_USERNAME 
};