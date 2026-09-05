/* LoadCalcPro X Generator — persistent storage authority.
   Loaded after script.js and before app-runtime.js.
   One storage key owns the calculator state. Saved work is protected during
   startup until the user chooses Continue Previous Calculation or Start New. */
(function(){
'use strict';

const KEY =
  (typeof STORAGE_KEY !== 'undefined' && STORAGE_KEY)
    ? STORAGE_KEY
    : 'loadcalcpro_generator_mobile_nec2023_v1';

const MANAGED_KEY =
  (typeof MANAGED_QTY_STORAGE_KEY !== 'undefined' && MANAGED_QTY_STORAGE_KEY)
    ? MANAGED_QTY_STORAGE_KEY
    : 'loadcalcpro_generator_mobile_managed_quantities_v1';

function readState(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return null;
    const data=JSON.parse(raw);
    return data && typeof data==='object' ? data : null;
  }catch(e){
    return null;
  }
}

function meaningful(data){
  if(!data)return false;

  const project=Object.values(data.project||{}).some(function(value){
    return String(value===null||value===undefined?'':value).trim()!=='';
  });

  const inputs=Object.entries(data.inputs||{}).some(function(entry){
    if(entry[0]==='q46')return false;
    const text=String(entry[1]===null||entry[1]===undefined?'':entry[1]).trim();
    if(!text)return false;
    const n=Number(text);
    return Number.isFinite(n) ? n!==0 : true;
  });

  const descriptions=Object.values(data.descriptions||{}).some(function(value){
    return String(value===null||value===undefined?'':value).trim()!=='';
  });

  const managed=Object.values(data.managedQuantities||{}).some(function(value){
    return Number(value)>0;
  });

  return project || inputs || descriptions || managed;
}

/* Capture the saved state before any DOMContentLoaded startup code can run.
   This prevents a late startup calculation from replacing saved work with
   the blank form before the restore decision is made. */
const bootState=readState();
let bootDecisionPending=meaningful(bootState);

function buildState(){
  if(typeof calculatorState === 'function'){
    return calculatorState();
  }

  const state={
    savedAt:new Date().toISOString(),
    project:{},
    inputs:{},
    descriptions:{},
    managedQuantities:{}
  };

  ['projectName','projectNumber','projectAddress','projectCityState']
    .forEach(function(id){
      const el=document.getElementById(id);
      state.project[id]=el ? el.value : '';
    });

  document.querySelectorAll('input[id^="q"],input[id^="v"],select[id^="q"]')
    .forEach(function(el){
      state.inputs[el.id]=el.value;
    });

  document.querySelectorAll('input[id^="d"]')
    .forEach(function(el){
      state.descriptions[el.id]=el.value;
    });

  if(typeof managedQuantities !== 'undefined' && managedQuantities){
    state.managedQuantities={...managedQuantities};
  }

  return state;
}

function writesAllowed(){
  if(bootDecisionPending)return false;
  if(typeof suppressAutoSave!=='undefined' && suppressAutoSave)return false;
  if(typeof restorePromptOpen!=='undefined' && restorePromptOpen)return false;
  return true;
}

function writeState(){
  if(!writesAllowed())return false;

  try{
    localStorage.setItem(KEY,JSON.stringify(buildState()));

    if(typeof saveManagedQuantities === 'function'){
      saveManagedQuantities();
    }else if(typeof managedQuantities !== 'undefined'){
      localStorage.setItem(MANAGED_KEY,JSON.stringify(managedQuantities||{}));
    }

    return true;
  }catch(e){
    return false;
  }
}

/* Replace the legacy save/read/check functions with the single authority. */
window.saveState=function(showMessage){
  const ok=writeState();

  if(showMessage!==false && typeof showSaveStatus==='function'){
    showSaveStatus(ok ? 'Calculation saved' : 'Unable to save calculation');
  }

  return ok;
};

window.savedState=function(){
  if(bootDecisionPending && bootState){
    return bootState;
  }
  return readState();
};

window.hasSavedCalculation=function(){
  if(bootDecisionPending)return true;
  return meaningful(readState());
};

/* Release startup protection only when the user makes the restore choice. */
const originalContinue=window.continuePreviousCalculation;
if(typeof originalContinue==='function'){
  window.continuePreviousCalculation=function(){
    bootDecisionPending=false;
    return originalContinue.apply(this,arguments);
  };
}

const originalStartNewSaved=window.startNewFromSavedPrompt;
if(typeof originalStartNewSaved==='function'){
  window.startNewFromSavedPrompt=function(){
    bootDecisionPending=false;
    return originalStartNewSaved.apply(this,arguments);
  };
}

const originalStartNewButton=window.startNewCalculationFromButton;
if(typeof originalStartNewButton==='function'){
  window.startNewCalculationFromButton=function(){
    bootDecisionPending=false;
    return originalStartNewButton.apply(this,arguments);
  };
}

/* Save immediately when any user-editable calculator field changes. */
function onEdit(event){
  const el=event && event.target;
  if(!el || !el.id)return;

  if(
    el.matches(
      '#projectName,#projectNumber,#projectAddress,#projectCityState,'+
      'input[id^="q"],input[id^="v"],input[id^="d"],select[id^="q"]'
    )
  ){
    writeState();
  }
}

document.addEventListener('input',onEdit,true);
document.addEventListener('change',onEdit,true);

/* pagehide and visibilitychange cover browser, phone, and app-like navigation. */
window.addEventListener('pagehide',writeState);

document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){
    writeState();
  }
});

})();
