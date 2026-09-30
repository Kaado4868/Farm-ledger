/*
 * One-time migration helper.
 * Run with Application Default Credentials against a backup/project copy first.
 * It copies approved users/{email}.farmId into farms/{farmId}/members/{email}.
 */
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function main(){
  const snap = await db.collection('users').get();
  let migrated = 0;
  for(const doc of snap.docs){
    const data = doc.data() || {};
    const email = String(doc.id || data.email || '').toLowerCase();
    const farmId = String(data.farmId || '');
    if(!email || !farmId || data.status !== 'approved') continue;
    await db.doc(`farms/${farmId}/members/${email}`).set({
      email,
      farmId,
      role: data.role || 'member',
      status: 'active',
      migratedFromUserDoc: true,
      migratedAt: admin.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
    migrated++;
  }
  console.log(`Migrated ${migrated} approved farm memberships.`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
