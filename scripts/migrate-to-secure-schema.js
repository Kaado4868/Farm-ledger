const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();

const DRY_RUN = process.env.DRY_RUN !== "false";
const CONFIRM_MIGRATION = process.env.CONFIRM_MIGRATION || "";
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();

if (!DRY_RUN && CONFIRM_MIGRATION !== "YES") {
  throw new Error("Live migration requires CONFIRM_MIGRATION=YES.");
}

function log(action, details) {
  console.log(JSON.stringify({ action, ...details }));
}

async function discoverFarms() {
  const farms = new Set();

  const metadata = await db.collection("metadata").doc("farmList").get();
  if (metadata.exists) {
    for (const farmId of metadata.data().farms || []) farms.add(String(farmId));
  }

  const users = await db.collection("users").get();
  users.forEach(doc => {
    const farmId = doc.data().farmId;
    if (farmId) farms.add(String(farmId));
  });

  const transactions = await db.collection("transactions").get();
  transactions.forEach(doc => {
    const farmId = doc.data().farmId;
    if (farmId) farms.add(String(farmId));
  });

  return { farms, users, transactions };
}

async function migrateUsers(users) {
  for (const doc of users.docs) {
    const old = doc.data();
    const email = String(old.email || doc.id).trim().toLowerCase();
    if (!email) continue;

    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error) {
      log("skip_user", { email, reason: error.code || error.message });
      continue;
    }

    const uid = userRecord.uid;
    const farmId = String(old.farmId || "");
    const status = old.status === "revoked" ? "revoked" : (farmId ? "approved" : "pending");

    const userRef = db.collection("users").doc(uid);
    const userData = {
      uid,
      email,
      displayName: old.displayName || userRecord.displayName || "",
      farmId,
      role: "member",
      status,
      createdAt: old.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      migratedFromLegacy: true,
      legacyUserId: doc.id
    };

    log("user", { legacyId: doc.id, uid, farmId, status });
    if (!DRY_RUN) await userRef.set(userData, { merge: true });

    if (farmId && status !== "revoked") {
      const memberRef = db.collection("farms").doc(farmId).collection("members").doc(uid);
      const memberData = {
        uid,
        email,
        role: "member",
        status: "active",
        assignedAt: old.updatedAt || old.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        migratedFromLegacy: true
      };
      if (!DRY_RUN) await memberRef.set(memberData, { merge: true });
    }
  }
}

async function migrateFarms(farms) {
  for (const farmId of farms) {
    const ref = db.collection("farms").doc(farmId);
    log("farm", { farmId });
    if (!DRY_RUN) {
      await ref.set({
        farmId,
        name: farmId,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        migratedFromLegacy: true
      }, { merge: true });
    }
  }
}

async function migrateTransactions(transactions) {
  for (const doc of transactions.docs) {
    const old = doc.data();
    const farmId = String(old.farmId || "");
    if (!farmId) {
      log("skip_transaction", { id: doc.id, reason: "missing farmId" });
      continue;
    }

    let authorUid = "";
    const authorEmail = String(old.author || old.email || "").trim().toLowerCase();
    if (authorEmail) {
      try {
        authorUid = (await auth.getUserByEmail(authorEmail)).uid;
      } catch (_) {}
    }

    const ref = db.collection("farms").doc(farmId).collection("transactions").doc(doc.id);
    const data = {
      ...old,
      farmId,
      authorUid: authorUid || old.authorUid || "legacy-unknown",
      migratedFromLegacy: true,
      migratedAt: FieldValue.serverTimestamp()
    };

    log("transaction", { id: doc.id, farmId, authorUid: data.authorUid });
    if (!DRY_RUN) await ref.set(data, { merge: true });
  }
}

async function setSuperAdmin() {
  if (!SUPER_ADMIN_EMAIL) {
    log("super_admin", { skipped: true, reason: "SUPER_ADMIN_EMAIL not provided" });
    return;
  }

  const user = await auth.getUserByEmail(SUPER_ADMIN_EMAIL);
  log("super_admin", { email: SUPER_ADMIN_EMAIL, uid: user.uid });
  if (!DRY_RUN) await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
}

(async () => {
  console.log(DRY_RUN ? "DRY RUN: no data will be changed." : "LIVE MIGRATION: writing secure schema.");
  const { farms, users, transactions } = await discoverFarms();
  await migrateFarms(farms);
  await migrateUsers(users);
  await migrateTransactions(transactions);
  await setSuperAdmin();
  console.log("Migration complete.");
  if (DRY_RUN) console.log("Run with DRY_RUN=false CONFIRM_MIGRATION=YES to write data.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
