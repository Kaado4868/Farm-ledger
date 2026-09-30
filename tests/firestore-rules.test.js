const fs=require('fs');
const path=require('path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {Timestamp}=require('firebase/firestore');

(async()=>{
 const rules=fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8');
 const env=await initializeTestEnvironment({projectId:'farm-ledger-rules-test',firestore:{rules}});
 try{
  const email='member@example.com',farm='farm-test';
  await env.withSecurityRulesDisabled(async ctx=>{
   const d=ctx.firestore();
   await d.collection('farms').doc(farm).collection('members').doc(email).set({email,farmId:farm,role:'member',status:'active'});
   await d.collection('notifications').doc('n1').set({farmId:farm,title:'Test',message:'Hello',type:'in_app',createdBy:'abdulkadirbukar2006@gmail.com',readBy:[],createdAt:Timestamp.now()});
  });
  const user=env.authenticatedContext(email,{email_verified:true}).firestore();
  const good={farmId:farm,author:email,type:'purchase',animalType:'goat',amount:50000,description:'Purchased goats',date:'2026-09-30',animalCount:2,schemaVersion:2};
  await assertSucceeds(user.collection('transactions').doc('good').set(good));
  await assertFails(user.collection('transactions').doc('bad-type').set({...good,type:'forged'}));
  await assertFails(user.collection('transactions').doc('bad-author').set({...good,author:'other@example.com'}));
  await assertFails(user.collection('transactions').doc('bad-date').set({...good,date:'2026-02-30'}));
  await assertSucceeds(user.collection('notifications').doc('n1').update({readBy:[email]}));
  await assertFails(user.collection('notifications').doc('n1').update({readBy:['other@example.com']}));
  await assertSucceeds(user.collection('custodyEvents').doc('ce1').set({farmId:farm,inventoryId:'goat-001',action:'handover',actor:email,date:'2026-09-30',transactionId:'good'}));
  await assertFails(user.collection('custodyEvents').doc('ce2').set({farmId:farm,inventoryId:'goat-002',action:'return',actor:'other@example.com',date:'2026-09-30',transactionId:'good'}));
  console.log('Firestore rules tests passed.');
 }finally{await env.cleanup();}
})().catch(err=>{console.error(err);process.exit(1);});
