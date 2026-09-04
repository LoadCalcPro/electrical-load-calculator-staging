/* NEC 2023, single dwelling service load. Pure functions shared by screen and report. */
(function(root){
'use strict';
const sum = a => a.reduce((n,v)=>n+v,0);
const number = v => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
const load = r => number(r.qty)*number(r.va);
function general(va){return {first:Math.min(va,3000),middle:Math.min(Math.max(va-3000,0),117000)*.35,last:Math.max(va-120000,0)*.25};}
const A=[0,80,75,70,66,62,59,56,53,51,49,47,45,43,41,40,39,38,37,36,35,34,33,32,31,30];
const B=[0,80,65,55,50,45,43,40,36,35,34,32,32,32,32,32,28,28,28,28,28,26,26,26,26,26];
const C=[0,8,11,14,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40];
function cooking(rows){
 if(rows.some(r=>number(r.qty)>0&&!Number.isInteger(Number(r.qty))))return {total:0,method:'Enter a whole-number quantity'};
 const indexed=rows.map((r,index)=>({...r,index})), active=indexed.filter(r=>load(r)>0), rowUsed=rows.map(()=>0);
 const nameplate=active.filter(r=>number(r.va)<=1750||number(r.va)>27000);
 const groupA=active.filter(r=>number(r.va)>1750&&number(r.va)<3500);
 const groupB=active.filter(r=>number(r.va)>=3500&&number(r.va)<=8750);
 const ranges=active.filter(r=>number(r.va)>8750&&number(r.va)<=27000);
 const full=sum(nameplate.map(load));
 const na=sum(groupA.map(r=>number(r.qty))), nb=sum(groupB.map(r=>number(r.qty))), nr=sum(ranges.map(r=>number(r.qty)));
 const fa=na<=25?A[na]:30, fb=nb<=25?B[nb]:nb<=30?24:nb<=40?22:nb<=50?20:nb<=60?18:16;
 const demandA=sum(groupA.map(load))*fa/100, demandB=sum(groupB.map(load))*fb/100;
 let demandC=0, increase=0;
 if(nr){
  const columnC=(nr<=25?C[nr]:nr<=40?15+nr:25+.75*nr)*1000;
  // Notes 1 and 2 apply only to the ranges in the over-8.75-kW group.
  const average=sum(ranges.map(r=>number(r.qty)*Math.max(12000,number(r.va))))/nr;
  increase=ranges.some(r=>number(r.va)>12000)?Math.floor((average-12000)/1000+.5):0;
  demandC=columnC*(1+.05*increase);
 }
 nameplate.forEach(r=>{rowUsed[r.index]=load(r);});
 groupA.forEach(r=>{rowUsed[r.index]=load(r)*fa/100;});
 groupB.forEach(r=>{rowUsed[r.index]=load(r)*fb/100;});
 const rangesConnected=sum(ranges.map(load));
 ranges.forEach(r=>{rowUsed[r.index]=rangesConnected?demandC*load(r)/rangesConnected:0;});
 const parts=[];
 if(nr)parts.push('Column C'+(increase?' + '+(increase*5)+'%':''));
 if(na)parts.push('Column A');
 if(nb)parts.push('Column B');
 if(full)parts.push('other cooking at 100%');
 return {total:full+demandA+demandB+demandC,method:parts.length?'Table 220.55 — '+parts.join(' + '):'Nameplate at 100%',count:na+nb+nr,rowUsed};
}
function dryerFactor(n){return n<=4?1:n===5?.85:n===6?.75:n===7?.65:n===8?.60:n===9?.55:n===10?.50:n===11?.47:n<=23?(47-(n-11))/100:n<=42?(35-.5*(n-23))/100:.25;}
function calculate(s){
 const errors=[];
 const check=(v,label,integer=false)=>{if(v!==''&&v!==undefined&&(!Number.isFinite(Number(v))||Number(v)<0||(integer&&!Number.isInteger(Number(v)))))errors.push(label+' must be a nonnegative '+(integer?'whole number.':'number.'));};
 check(s.sqft,'Square footage');check(s.small,'Small appliance circuits',true);check(s.laundry,'Laundry circuits',true);
 const groups=['appliances','cooking','dryers','motors','continuous'];
 groups.forEach(g=>(s[g]||[]).forEach((r,i)=>{
  const name=r.label||g+' '+(i+1);check(r.qty,name+' quantity',true);check(r.va,name+' VA');
  if((number(r.qty)>0)!==(number(r.va)>0))errors.push('Complete quantity and VA for '+name+'.');
 }));
 (s.continuous||[]).forEach((r,i)=>{if(r.ev&&r.managed){check(r.managedVa,(r.label||'EV Charger')+' maximum managed VA');if(!number(r.managedVa))errors.push('Enter the maximum managed EV load for '+(r.label||'EV Charger')+'.');}});
 const touched=number(s.sqft)>0||number(s.small)>0||number(s.laundry)>0||groups.some(g=>(s[g]||[]).some(r=>number(r.qty)||number(r.va)))||(s.hvac||[]).some(h=>number(h.cool)||number(h.heat));
 if(touched){if(!number(s.sqft))errors.push('Enter the dwelling square footage.');if(number(s.small)<2)errors.push('Enter at least two small appliance circuits.');if(number(s.laundry)<1)errors.push('Enter at least one laundry circuit.');}
 const generalConnected=number(s.sqft)*3+number(s.small)*1500+number(s.laundry)*1500, demand=general(generalConnected);
 const apps=s.appliances||[], eligible=apps.filter(r=>r.fixed&&(number(r.va)>=500||r.quarterHP)&&load(r)>0), eligibleCount=sum(eligible.map(r=>number(r.qty))), eligibleVA=sum(eligible.map(load));
 const appliances=sum(apps.map(load))-eligibleVA+eligibleVA*(eligibleCount>=4?.75:1);
 // Table 220.55 is applied once to all completed cooking-appliance entries.
 // Row values remain connected loads for an auditable worksheet; the demand is a group result.
 const cookingInputs=s.cooking||[], combinedCooking=cooking(cookingInputs);
 const cookingRows=cookingInputs.map((r,i)=>({connected:load(r),used:combinedCooking.rowUsed?.[i]||0}));
 const cook={...combinedCooking,method:combinedCooking.method,rows:cookingRows,connected:sum(cookingRows.map(r=>r.connected))};
 const dryerCount=sum((s.dryers||[]).filter(r=>load(r)>0).map(r=>number(r.qty))), dryerConnected=sum((s.dryers||[]).filter(r=>load(r)>0).map(r=>number(r.qty)*Math.max(5000,number(r.va)))), dryers=dryerConnected*dryerFactor(dryerCount);
 const motorBase=sum((s.motors||[]).map(load));
 // Existing appliance motor component is entered separately to avoid adding its base twice.
 check(s.applianceMotor,'Largest appliance motor VA');
 if(number(s.applianceMotor)>sum(apps.map(load)))errors.push('The appliance motor component cannot exceed the entered appliance loads.');
 const otherMotor=Math.max(number(s.applianceMotor),...(s.motors||[]).filter(r=>load(r)>0).map(r=>number(r.va)));
 const alternatives=(s.hvac||[]).map((h,i)=>{
  ['cool','heat','coolMotor','heatMotor'].forEach(k=>check(h[k],'HVAC '+(i+1)+' '+k));
  const c=number(h.cool),t=number(h.heat),cm=number(h.coolMotor),hm=number(h.heatMotor);
  if(cm>c||hm>t)errors.push('HVAC '+(i+1)+': motor VA cannot exceed its equipment load.');
  if(c>0&&h.coolMotor==='')errors.push('HVAC '+(i+1)+': enter the largest compressor/motor VA (not MCA).');
  if((c||t)&&!h.mode)errors.push('Choose the operating arrangement for HVAC '+(i+1)+'.');
  if(h.mode==='simultaneous')return [{base:c+t,motor:Math.max(cm,hm),label:'Cooling / heat pump + heating at 100%'}];
  return [{base:c,motor:cm,label:'Cooling / heat pump at 100%'},{base:t,motor:hm,label:'Heating at 100%'}];
 });
 const picks=alternatives.map(a=>a.reduce((best,v)=>v.base>best.base||(v.base===best.base&&v.motor>best.motor)?v:best,a[0]));
 const base=sum(picks.map(v=>v.base));let chosen=picks, combined=base+.25*Math.max(otherMotor,...picks.map(v=>v.motor));
 // Test each operating alternative with its motor adder before choosing the governing load.
 alternatives.forEach((options,i)=>options.forEach(v=>{const candidate=picks.slice();candidate[i]=v;const value=base-picks[i].base+v.base+.25*Math.max(otherMotor,...candidate.map(x=>x.motor));if(value>combined){combined=value;chosen=candidate;}}));
 const hvac=sum(chosen.map(v=>v.base)), largestMotor=Math.max(otherMotor,...chosen.map(v=>v.motor)), motorAdder=largestMotor*.25;
 const continuous=sum((s.continuous||[]).filter(r=>load(r)>0).map(r=>r.ev?(r.managed?number(r.managedVa):number(r.qty)*Math.max(7200,number(r.va))):number(r.qty)*number(r.va)*(r.factor===1?1:1.25)));
 const total=demand.first+demand.middle+demand.last+appliances+cook.total+dryers+motorBase+hvac+motorAdder+continuous;
 const voltage=Number(s.voltage);if(![208,240].includes(voltage))errors.push('Select 208 or 240 volts.');
 return {generalConnected,demand,appliances,eligibleCount,eligibleVA,cooking:cook,dryerCount,dryerConnected,dryers,motorBase,hvac,hvacModes:chosen,largestMotor,motorAdder,continuous,total,amps:total/voltage,errors:[...new Set(errors)],touched};
}
const api={general,cooking,dryerFactor,calculate};if(typeof module!=='undefined')module.exports=api;else root.StandardEngine=api;
})(typeof window!=='undefined'?window:globalThis);
