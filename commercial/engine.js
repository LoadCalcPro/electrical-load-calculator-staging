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
function calculate(s){
 const errors=[];
 const check=(v,label,integer=false)=>{if(v!==''&&v!==undefined&&(!Number.isFinite(Number(v))||Number(v)<0||(integer&&!Number.isInteger(Number(v)))))errors.push(label+' must be a nonnegative '+(integer?'whole number.':'number.'));};
 const occ=OCCUPANCIES[s.occupancy];
 const groups=['other','kitchen','motors','continuous'];
 const touched=Boolean(s.occupancy)||number(s.sqft)>0||number(s.actualLighting)>0||number(s.showWindowFt)>0||number(s.trackFt)>0||number(s.signQty)>0||Boolean(s.signRequired)||number(s.receptacles)>0||number(s.cooling)>0||number(s.heating)>0||groups.some(g=>(s[g]||[]).some(r=>number(r.qty)||number(r.va)));
 if(touched&&!occ)errors.push('Select an occupancy type.');
 check(s.sqft,'Square footage');if(touched&&!number(s.sqft))errors.push('Enter the building square footage.');
 check(s.actualLighting,'Actual lighting load');
 const minimumLighting=number(s.sqft)*(occ?.va||0), lightingBase=Math.max(minimumLighting,number(s.actualLighting));
 const ld=lightingDemand(lightingBase,occ?.demand||'other',Boolean(s.hotelAllLighting)), lighting=sum(Object.values(ld).filter(v=>typeof v==='number'));
 const showWindow=number(s.showWindowFt)*200*1.25;
 const track=number(s.trackFt)>0?Math.ceil(number(s.trackFt)/2)*150*1.25:0;
 const signs=Math.max(number(s.signQty),number(s.signRequired)?1:0)*1200*1.25;
 const lightingOther=showWindow+track+signs;
 check(s.receptacles,'Receptacle quantity',true);
 const receptacleCountVA=number(s.receptacles)*180;
 const receptacleOfficeVA=s.occupancy==='office'?number(s.sqft):0;
 const receptacleConnected=Math.max(receptacleCountVA,receptacleOfficeVA);
 const receptacles=Math.min(receptacleConnected,10000)+Math.max(receptacleConnected-10000,0)*.5;
 groups.forEach(g=>(s[g]||[]).forEach((r,i)=>{const name=r.label||g+' '+(i+1);check(r.qty,name+' quantity',true);check(r.va,name+' VA');if((number(r.qty)>0)!==(number(r.va)>0))errors.push('Complete quantity and VA for '+name+'.');}));
 const other=sum((s.other||[]).map(load));
 const kitchenRows=(s.kitchen||[]).filter(r=>load(r)>0), kitchenCount=sum(kitchenRows.map(r=>number(r.qty))), kitchenConnected=sum(kitchenRows.map(load)), kitchenFactorValue=kitchenFactor(kitchenCount), kitchen=kitchenConnected*kitchenFactorValue;
 check(s.cooling,'Cooling load');check(s.heating,'Heating load');
 if((number(s.cooling)||number(s.heating))&&!s.hvacMode)errors.push('Choose the HVAC operating arrangement.');
 const hvac=s.hvacMode==='simultaneous'?number(s.cooling)+number(s.heating):Math.max(number(s.cooling),number(s.heating));
 const motorBase=sum((s.motors||[]).map(load));check(s.includedMotor,'Largest included motor component VA');
 const largestMotor=Math.max(number(s.includedMotor),...(s.motors||[]).filter(r=>load(r)>0).map(r=>number(r.va))), motorAdder=largestMotor*.25;
 (s.continuous||[]).forEach(r=>{if(r.ev&&r.managed&&!number(r.managedVa))errors.push('Enter the maximum managed EV load for '+(r.label||'EV Charger')+'.');});
 const continuous=sum((s.continuous||[]).filter(r=>load(r)>0).map(r=>r.ev?(r.managed?number(r.managedVa):number(r.qty)*Math.max(7200,number(r.va))):load(r)*(r.factor===1?1:1.25)));
 const total=lighting+lightingOther+receptacles+other+kitchen+hvac+motorBase+motorAdder+continuous;
 const voltage=number(s.voltage), phase=Number(s.phase);
 if(!voltage)errors.push('Select a service voltage.');if(![1,3].includes(phase))errors.push('Select single-phase or three-phase.');
 const amps=voltage?total/(phase===3?Math.sqrt(3)*voltage:voltage):0;
 return {touched,occupancy:occ,minimumLighting,lightingBase,lightingDemand:ld,lighting,showWindow,track,signs,lightingOther,receptacleCountVA,receptacleOfficeVA,receptacleConnected,receptacles,other,kitchenCount,kitchenConnected,kitchenFactor:kitchenFactorValue,kitchen,hvac,motorBase,largestMotor,motorAdder,continuous,total,amps,errors:[...new Set(errors)]};
}
const api={OCCUPANCIES,lightingDemand,kitchenFactor,calculate};if(typeof module!=='undefined')module.exports=api;else root.CommercialEngine=api;
})(typeof window!=='undefined'?window:globalThis);
