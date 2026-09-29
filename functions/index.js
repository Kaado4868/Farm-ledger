const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const auth = getAuth();

function requireAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }
  return context.auth;
}

function requireSuperAdmin(context) {
  const authContext = requireAuth(context);
  if (authContext.token.admin !== true) {
    throw new functions.https.HttpsError("permission-denied", "Super administrator access required.");
  }
  return authContext;
}

function validateFarmId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{2,60}$/.test(value)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid farm ID.");
  }
  return value;
}

function validateEmail(value) {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid email address.");
  }
  return value.trim().toLowerCase();
}

async function writeAudit(farmId, action, actorUid, details = {}) {
  await db.collection("farms").doc(farmId).collection("auditLogs").add({
    action,
    actorUid,
    details,
    createdAt: FieldValue.serverTimestamp()
  });
}

exports.createFarm = functions.https.onCall(async (data, context) => {
  const authContext = requireSuperAdmin(context);
  const farmId = validateFarmId(data?.farmId);
  const ref = db.collection("farms").doc(farmId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new functions.https.HttpsError("already-exists", "That farm already exists.");
  }

  await ref.set({
    farmId,
    name: farmId,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await writeAudit(farmId, "farm_created", authContext.uid);
  return { farmId };
});

exports.assignUserToFarm = functions.https.onCall(async (data, context) => {
  const authContext = requireSuperAdmin(context);
  const email = validateEmail(data?.email);
  const farmId = validateFarmId(data?.farmId);

  const farmRef = db.collection("farms").doc(farmId);
  const farmSnap = await farmRef.get();
  if (!farmSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Farm not found.");
  }

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new functions.https.HttpsError("not-found", "No Firebase Auth user exists for that email.");
    }
    throw error;
  }

  const batch = db.batch();
  const userRef = db.collection("users").doc(userRecord.uid);
  batch.set(userRef, {
    uid: userRecord.uid,
    email,
    displayName: userRecord.displayName || "",
    farmId,
    role: "member",
    status: "approved",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const memberRef = farmRef.collection("members").doc(userRecord.uid);
  batch.set(memberRef, {
    uid: userRecord.uid,
    email,
    role: "member",
    status: "active",
    assignedBy: authContext.uid,
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await batch.commit();
  await writeAudit(farmId, "user_assigned", authContext.uid, { userUid: userRecord.uid, email });
  return { uid: userRecord.uid, email, farmId };
});

exports.revokeUserAccess = functions.https.onCall(async (data, context) => {
  const authContext = requireSuperAdmin(context);
  const email = validateEmail(data?.email);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new functions.https.HttpsError("not-found", "User not found.");
    }
    throw error;
  }

  if (userRecord.uid === authContext.uid) {
    throw new functions.https.HttpsError("failed-precondition", "The active super administrator cannot revoke themselves.");
  }

  const userRef = db.collection("users").doc(userRecord.uid);
  const userSnap = await userRef.get();
  const farmId = userSnap.exists ? userSnap.data().farmId || "" : "";

  const batch = db.batch();
  batch.set(userRef, {
    uid: userRecord.uid,
    email,
    farmId: "",
    role: "member",
    status: "revoked",
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  if (farmId) {
    batch.set(db.collection("farms").doc(farmId).collection("members").doc(userRecord.uid), {
      uid: userRecord.uid,
      email,
      role: "member",
      status: "revoked",
      revokedBy: authContext.uid,
      revokedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }

  await batch.commit();
  if (farmId) await writeAudit(farmId, "user_revoked", authContext.uid, { userUid: userRecord.uid, email });
  return { uid: userRecord.uid, email, revoked: true };
});

exports.deleteFarm = functions.https.onCall(async (data, context) => {
  const authContext = requireSuperAdmin(context);
  const farmId = validateFarmId(data?.farmId);
  const farmRef = db.collection("farms").doc(farmId);
  const farmSnap = await farmRef.get();
  if (!farmSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Farm not found.");
  }

  const [membersSnap, txSnap, auditSnap] = await Promise.all([
    farmRef.collection("members").limit(1).get(),
    farmRef.collection("transactions").limit(1).get(),
    farmRef.collection("auditLogs").limit(1).get()
  ]);

  if (!membersSnap.empty || !txSnap.empty || !auditSnap.empty) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Farm must have no members, transactions, or audit logs before deletion."
    );
  }

  await farmRef.delete();
  return { farmId, deleted: true, actorUid: authContext.uid };
});

exports.setSuperAdmin = functions.https.onCall(async (data, context) => {
  const authContext = requireSuperAdmin(context);
  const email = validateEmail(data?.email);
  const userRecord = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(userRecord.uid, { admin: true });
  return { uid: userRecord.uid, email, admin: true };
});
