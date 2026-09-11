/* NEC 2023 commercial Standard Method load calculation. Pure functions. */
(function(root){
'use strict';
const sum=a=>a.reduce((n,v)=>n+v,0);
const number=v=>Number.isFinite(Number(v))?Math.max(0,Number(v)):0;
const load=r=>number(r.qty)*number(r.va);
const OCCUPANCIES={
 automotive:{label:'Automotive Facility',va:1.5,demand:'other'},
 convention:{label:'Convention Center',va:1.4,demand:'other'},
 courthouse:{label:'Courthouse',va:1.4,demand:'other'},
 dormitory:{label:'Dormitory',va:1.5,demand:'other'},
 exercise:{label:'Exercise Center',va:1.4,demand:'other'},
 fire:{label:'Fire Station',va:1.3,demand:'other'},
 gym:{label:'Gymnasium / Armory / Auditorium',va:1.7,demand:'other'},
 clinic:{label:'Health Care Clinic',va:1.6,demand:'other'},
 hospital:{label:'Hospital',va:1.6,demand:'hospital'},
 hotel:{label:'Hotel / Motel / Apartment Without Cooking',va:1.7,demand:'hotel'},
 library:{label:'Library',va:1.5,demand:'other'},
 manufacturing:{label:'Manufacturing Facility / Industrial Commercial Loft',va:2.2,demand:'other'},
 cinema:{label:'Motion Picture Theater',va:1.6,demand:'other'},
 museum:{label:'Museum',va:1.6,demand:'other'},
 office:{label:'Office / Bank',va:1.3,demand:'other'},
 parking:{label:'Parking Garage / Commercial Storage Garage',va:.3,demand:'other'},
 penitentiary:{label:'Penitentiary',va:1.2,demand:'other'},
 performing:{label:'Performing Arts Theater',va:1.5,demand:'other'},
 police:{label:'Police Station',va:1.3,demand:'other'},
 post:{label:'Post Office',va:1.6,demand:'other'},
 religious:{label:'Religious Facility',va:2.2,demand:'other'},
 restaurant:{label:'Restaurant / Club',va:1.5,demand:'other'},
 retail:{label:'Retail / Store / Barber / Beauty Parlor',va:1.9,demand:'other'},
 school:{label:'School / University',va:1.5,demand:'other'},
 arena:{label:'Sports Arena',va:1.5,demand:'other'},
 town:{label:'Town Hall',va:1.4,demand:'other'},
 transportation:{label:'Transportation Facility',va:1.2,demand:'other'},
 warehouse:{label:'Warehouse',va:1.2,demand:'warehouse'},
 workshop:{label:'Workshop',va:1.7,demand:'other'}
};
function lightingDemand(va,type,hotelAll=false){
 va=number(va);
 if(type==='hospital')return {first:Math.min(va,50000)*.4,remainder:Math.max(va-50000,0)*.2,method:'Table 220.45 — first 50,000 VA at 40%; remainder at 20%'};
 if(type==='hotel'&&!hotelAll)return {first:Math.min(va,20000),middle:Math.min(Math.max(va-20000,0),80000)*.5,remainder:Math.max(va-100000,0)*.35,method:'Table 220.45 — first 20,000 VA at 100%; next 80,000 VA at 50%; remainder at 35%'};
 if(type==='warehouse')return {first:Math.min(va,12500),remainder:Math.max(va-12500,0)*.5,method:'Table 220.45 — first 12,500 VA at 100%; remainder at 50%'};
 return {first:va,remainder:0,method:'Table 220.45 — 100%'};
}
function kitchenFactor(count){return count<=2?1:count===3?.9:count===4?.8:count===5?.7:.65;}
function restaurantDemand(va,type){
 va=number(va);const k=1000;let demand=0,steps=[];
 if(type==='all-electric'){
  if(va<=200*k){demand=va*.8;steps=[{label:'First 200 kVA at 80%',va:demand}];}
  else if(va<=325*k){demand=160*k+(va-200*k)*.1;steps=[{label:'First 200 kVA at 80%',va:160*k},{label:'Remainder through 325 kVA at 10%',va:(va-200*k)*.1}];}
  else if(va<=800*k){demand=172.5*k+(va-325*k)*.5;steps=[{label:'Demand through 325 kVA',va:172.5*k},{label:'Remainder through 800 kVA at 50%',va:(va-325*k)*.5}];}
  else{demand=410*k+(va-800*k)*.5;steps=[{label:'Demand through 800 kVA',va:410*k},{label:'Load over 800 kVA at 50%',va:(va-800*k)*.5}];}
 }else if(type==='not-all-electric'){
  if(va<=200*k){demand=va;steps=[{label:'First 200 kVA at 100%',va:demand}];}
  else if(va<=325*k){demand=200*k+(va-200*k)*.5;steps=[{label:'First 200 kVA at 100%',va:200*k},{label:'Remainder through 325 kVA at 50%',va:(va-200*k)*.5}];}
  else if(va<=800*k){demand=262.5*k+(va-325*k)*.45;steps=[{label:'Demand through 325 kVA',va:262.5*k},{label:'Remainder through 800 kVA at 45%',va:(va-325*k)*.45}];}
  else{demand=476.25*k+(va-800*k)*.2;steps=[{label:'Demand through 800 kVA',va:476.25*k},{label:'Load over 800 kVA at 20%',va:(va-800*k)*.2}];}
 }
 return {connected:va,type,demand,steps};
}
function calculate(s){
 const errors=[];
 const check=(v,label,integer=false)=>{if(v!==''&&v!==undefined&&(!Number.isFinite(Number(v))||Number(v)<0||(integer&&!Number.isInteger(Number(v)))))errors.push(label+' must be a nonnegative '+(integer?'whole number.':'number.'));};
 const occ=OCCUPANCIES[s.occupancy];
 const areaInputs=[{occupancy:s.occupancy,sqft:s.sqft,actualLighting:s.actualLighting,hotelAllLighting:s.hotelAllLighting,primary:true},...(s.occupancyAreas||[])];
 const groups=['other','kitchen','motors','continuous','special'];
 const restaurantMode=s.method==='restaurant22088';
 const touched=restaurantMode||Boolean(s.occupancy)||number(s.sqft)>0||number(s.actualLighting)>0||(s.occupancyAreas||[]).some(a=>a.occupancy||number(a.sqft)||number(a.actualLighting))||number(s.showWindowFt)>0||number(s.trackFt)>0||number(s.signQty)>0||number(s.receptacles)>0||number(s.cooling)>0||number(s.heating)>0||groups.some(g=>(s[g]||[]).some(r=>number(r.qty)||number(r.va)));
 if(restaurantMode&&!['all-electric','not-all-electric'].includes(s.restaurantType))errors.push('Select whether the restaurant is all electric or not all electric.');
 if(restaurantMode&&!s.restaurantTotalLoadServed)errors.push('Confirm that this service or feeder supplies the total load of the new restaurant.');
 if(touched&&!occ)errors.push('Select an occupancy type for Area 1.');
 const lightingAreas=areaInputs.map((a,i)=>{const areaOcc=OCCUPANCIES[a.occupancy];const active=a.primary||a.occupancy||number(a.sqft)||number(a.actualLighting);if(active&&!areaOcc)errors.push('Select an occupancy type for Area '+(i+1)+'.');check(a.sqft,'Area '+(i+1)+' square footage');if(active&&!number(a.sqft))errors.push('Enter square footage for Area '+(i+1)+'.');check(a.actualLighting,'Area '+(i+1)+' actual lighting load');const minimum=number(a.sqft)*(areaOcc?.va||0);const base=Math.max(minimum,number(a.actualLighting));const demand=lightingDemand(base,areaOcc?.demand||'other',Boolean(a.hotelAllLighting));const used=sum(Object.values(demand).filter(v=>typeof v==='number'));return {occupancy:areaOcc,minimum,base,demand,used,sqft:number(a.sqft),actualLighting:number(a.actualLighting)};}).filter((a,i)=>i===0||a.occupancy||a.sqft||a.actualLighting);
 const minimumLighting=sum(lightingAreas.map(a=>a.minimum)),lightingBase=sum(lightingAreas.map(a=>a.base)),lighting=sum(lightingAreas.map(a=>a.used));
 const ld=lightingAreas.length===1?lightingAreas[0].demand:{method:'Demand applied separately to each occupancy area'};
 const showWindow=number(s.showWindowFt)*200*1.25;
 const track=number(s.trackFt)>0?Math.ceil(number(s.trackFt)/2)*150*1.25:0;
 const signs=number(s.signQty)*1200*1.25;
 const lightingOther=showWindow+track+signs;
 check(s.receptacles,'Receptacle quantity',true);
 const receptacleCountVA=number(s.receptacles)*180;
 const receptacleOfficeVA=s.occupancy==='office'?number(s.sqft):0;
 const receptacleConnected=Math.max(receptacleCountVA,receptacleOfficeVA);
 const receptacles=Math.min(receptacleConnected,10000)+Math.max(receptacleConnected-10000,0)*.5;
 groups.forEach(g=>(s[g]||[]).forEach((r,i)=>{const name=r.label||g+' '+(i+1);check(r.qty,name+' quantity',true);check(r.va,name+' VA');if((number(r.qty)>0)!==(number(r.va)>0))errors.push('Complete quantity and VA for '+name+'.');}));
 const otherConnected=sum((s.other||[]).map(load));
 const other=sum((s.other||[]).map(r=>load(r)*(Number(r.factor)===1.25?1.25:1)));
 const kitchenRows=(s.kitchen||[]).filter(r=>load(r)>0), kitchenCount=sum(kitchenRows.map(r=>number(r.qty))), kitchenConnected=sum(kitchenRows.map(load)), kitchenFactorValue=kitchenFactor(kitchenCount), kitchenTableDemand=kitchenConnected*kitchenFactorValue;
 const kitchenUnitLoads=[];kitchenRows.forEach(r=>{for(let i=0;i<number(r.qty);i++)kitchenUnitLoads.push(number(r.va));});kitchenUnitLoads.sort((a,b)=>b-a);const kitchenTwoLargest=sum(kitchenUnitLoads.slice(0,2));const kitchen=Math.max(kitchenTableDemand,kitchenTwoLargest);
 check(s.cooling,'Cooling load');check(s.heating,'Heating load');
 if(!restaurantMode&&(number(s.cooling)||number(s.heating))&&!s.hvacMode)errors.push('Choose the HVAC operating arrangement.');
 const hvac=restaurantMode?number(s.cooling)+number(s.heating):(s.hvacMode==='simultaneous'?number(s.cooling)+number(s.heating):Math.max(number(s.cooling),number(s.heating)));
 const motorBase=sum((s.motors||[]).map(load));check(s.includedMotor,'Largest included motor component VA');
 const largestMotor=Math.max(number(s.includedMotor),...(s.motors||[]).filter(r=>load(r)>0).map(r=>number(r.va))), motorAdder=largestMotor*.25;
 (s.continuous||[]).forEach(r=>{if(r.ev&&r.managed&&!number(r.managedVa))errors.push('Enter the maximum managed EV load for '+(r.label||'EV Charger')+'.');});
 const continuousConnected=sum((s.continuous||[]).filter(r=>load(r)>0).map(r=>r.ev?(r.managed?number(r.managedVa):number(r.qty)*Math.max(7200,number(r.va))):load(r)));
 const continuous=sum((s.continuous||[]).filter(r=>load(r)>0).map(r=>r.ev?(r.managed?number(r.managedVa):number(r.qty)*Math.max(7200,number(r.va))*1.25):load(r)*(Number(r.factor)===1?1:1.25)));
 const special=sum((s.special||[]).map(load));
 const specialLightingConnected=number(s.showWindowFt)*200+(number(s.trackFt)>0?Math.ceil(number(s.trackFt)/2)*150:0)+number(s.signQty)*1200;
 const restaurantConnected=lightingBase+specialLightingConnected+receptacleConnected+otherConnected+kitchenConnected+number(s.cooling)+number(s.heating)+motorBase+continuousConnected+special;
 const restaurant=restaurantDemand(restaurantConnected,s.restaurantType);
 const standardTotal=lighting+lightingOther+receptacles+other+kitchen+hvac+motorBase+motorAdder+continuous+special;
 const total=restaurantMode?restaurant.demand:standardTotal;
 const voltage=number(s.voltage), phase=Number(s.phase);
 if(!voltage)errors.push('Select a service voltage.');if(![1,3].includes(phase))errors.push('Select single-phase or three-phase.');
 const amps=voltage?total/(phase===3?Math.sqrt(3)*voltage:voltage):0;
 return {touched,method:restaurantMode?'restaurant22088':'standard',occupancy:occ,lightingAreas,minimumLighting,lightingBase,lightingDemand:ld,lighting,showWindow,track,signs,lightingOther,specialLightingConnected,receptacleCountVA,receptacleOfficeVA,receptacleConnected,receptacles,otherConnected,other,kitchenCount,kitchenConnected,kitchenFactor:kitchenFactorValue,kitchenTableDemand,kitchenTwoLargest,kitchen,hvac,motorBase,largestMotor,motorAdder,continuousConnected,continuous,special,restaurantConnected,restaurant,standardTotal,total,amps,errors:[...new Set(errors)]};
}
const api={OCCUPANCIES,lightingDemand,kitchenFactor,restaurantDemand,calculate};if(typeof module!=='undefined')module.exports=api;else root.CommercialEngine=api;
})(typeof window!=='undefined'?window:globalThis);
