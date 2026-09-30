/* Farm Ledger shared ledger core. Kept dependency-free so it can run in the browser and in tests. */
(function(global){
  'use strict';
  const TYPES = Object.freeze(['purchase','death','medical','feed','herdsman','handover','other']);
  const ANIMAL_TYPES = Object.freeze(['goat','sheep','cattle','chicken','other']);
  const CUSTODY_STATES = Object.freeze(['on_farm','handed_over','returned','lost']);
  const MAX_AMOUNT = 100000000000;
  const MAX_COUNT = 1000000;

  function finiteNumber(v){ return typeof v === 'number' && Number.isFinite(v); }
  function nonNegativeNumber(v){ return finiteNumber(v) && v >= 0 && v <= MAX_AMOUNT; }
  function positiveInteger(v){ return Number.isInteger(v) && v > 0 && v <= MAX_COUNT; }
  function validDateString(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
  function validEnum(v,list){ return typeof v === 'string' && list.indexOf(v) !== -1; }

  function validateTransaction(data){
    const errors=[];
    if(!data || typeof data !== 'object') return ['record must be an object'];
    if(typeof data.farmId !== 'string' || !data.farmId.trim() || data.farmId.length > 120) errors.push('invalid farmId');
    if(typeof data.author !== 'string' || !data.author.trim() || data.author.length > 160) errors.push('invalid author');
    if(!validEnum(data.type,TYPES)) errors.push('invalid transaction type');
    if(!validEnum(data.animalType,ANIMAL_TYPES)) errors.push('invalid animal type');
    if(!nonNegativeNumber(Number(data.amount))) errors.push('invalid amount');
    if(typeof data.description !== 'string' || !data.description.trim() || data.description.length > 300) errors.push('invalid description');
    if(!validDateString(data.date)) errors.push('invalid date');
    if(data.type === 'purchase' || data.type === 'death') {
      if(!positiveInteger(Number(data.animalCount))) errors.push('animalCount must be a positive integer for livestock events');
    } else if(data.animalCount !== undefined && (!Number.isInteger(Number(data.animalCount)) || Number(data.animalCount) < 0 || Number(data.animalCount) > MAX_COUNT)) {
      errors.push('invalid animalCount');
    }
    if(data.schemaVersion !== undefined && data.schemaVersion !== 2) errors.push('unsupported schemaVersion');
    return errors;
  }

  function normalizeInventoryId(v){
    return typeof v === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(v) ? v : null;
  }

  function applyInventoryEvent(inventory,event){
    const next = Array.isArray(inventory) ? inventory.map(x=>Object.assign({},x)) : [];
    const count=Math.max(0,Number(event.animalCount)||0);
    if(event.type==='purchase'){
      for(let i=0;i<count;i++) next.push({
        id: normalizeInventoryId(event.inventoryIds && event.inventoryIds[i]) || ('legacy-'+String(event.id||'')+'-'+(i+1)),
        animalType:event.animalType || 'other',
        animalName:event.animalName || '',
        custodyState:'on_farm',
        sourceTransactionId:event.id || null
      });
    } else if(event.type==='death'){
      let remaining=count;
      for(let i=0;i<next.length && remaining>0;i++){
        if(next[i].animalType===event.animalType && next[i].custodyState==='on_farm' && !next[i].deceasedAt){
          next[i].deceasedAt=event.date; next[i].custodyState='lost'; next[i].lossTransactionId=event.id||null; remaining--;
        }
      }
      if(remaining) return {ok:false,errors:['death exceeds available on-farm inventory'],inventory:next};
    }
    return {ok:true,errors:[],inventory:next};
  }

  function calculateMetrics(records){
    const totals={}, value={}, custody={on_farm:0,handed_over:0,returned:0,lost:0};
    let spent=0, lossValue=0;
    (Array.isArray(records)?records:[]).forEach(r=>{
      const count=Math.max(0,Number(r.animalCount)||0), amount=Math.max(0,Number(r.amount)||0), animal=r.animalType||'goat';
      if(r.type==='purchase'){ totals[animal]=(totals[animal]||0)+count; value[animal]=(value[animal]||0)+amount; custody.on_farm+=count; }
      else if(r.type==='death'){ totals[animal]=(totals[animal]||0)-count; lossValue+=amount; custody.lost+=count; }
      else if(r.type==='handover'){ custody.handed_over+=count; }
      else if(r.type==='other'||r.type==='medical'||r.type==='feed'||r.type==='herdsman') spent+=amount;
    });
    Object.keys(totals).forEach(k=>{ if(totals[k]<0) totals[k]=0; });
    return {spent,lossValue,totalValue:Object.values(value).reduce((a,b)=>a+b,0),animalTotals:totals,custody};
  }

  global.FarmLedgerCore={TYPES,ANIMAL_TYPES,CUSTODY_STATES,MAX_AMOUNT,MAX_COUNT,validateTransaction,applyInventoryEvent,calculateMetrics};
})(window);
