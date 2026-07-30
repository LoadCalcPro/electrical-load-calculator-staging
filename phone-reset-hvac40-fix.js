(function(){
  'use strict';

  const HEAT40_MANAGED_KEY='loadcalcpro_phone_heat40_managed_v1';

  function value(id){
    const el=document.getElementById(id);
    const n=el ? Number(el.value) : 0;
    return Number.isFinite(n) && n>0 ? n : 0;
  }

  function heat40Checked(){
    const el=document.getElementById('m41');
    return !!(el && el.classList.contains('checked'));
  }

  function saveHeat40Managed(){
    try{localStorage.setItem(HEAT40_MANAGED_KEY,heat40Checked()?'1':'0');}catch(e){}
  }

  function restoreHeat40Managed(){
    let checked=false;
    try{checked=localStorage.getItem(HEAT40_MANAGED_KEY)==='1';}catch(e){}
    const el=document.getElementById('m41');
    if(!el) return;
    el.classList.toggle('checked',checked);
    el.textContent=checked?'✓':'';
  }

  function addStyles(){
    if(document.getElementById('phoneHvac40Styles')) return;
    const style=document.createElement('style');
    style.id='phoneHvac40Styles';
    style.textContent=`
      #phoneHeat40Row .heat40-auto-field{
        width:100%;min-height:46px;border:1px solid #cbd5e1;border-radius:8px;
        padding:9px 10px;background:#eef2f7;color:#64748b;font-size:18px;
        font-weight:800;text-align:left;
      }
    `;
    document.head.appendChild(style);
  }

  function addRow(){
    if(document.getElementById('phoneHeat40Row')) return;

    const names=Array.from(document.querySelectorAll('.load-name'));
    const heat2=names.find(function(el){
      return el.textContent.replace(/\s+/g,' ').trim()==='Heating Group 2';
    });
    const heat2Row=heat2 ? heat2.closest('.load-row') : null;
    if(!heat2Row) return;

    const row=document.createElement('div');
    row.id='phoneHeat40Row';
    row.className='load-row';
    row.innerHTML=`
      <div class="load-name">Heat at 40%</div>
      <div class="load-inputs inline-load-row">
        <div class="input-block">
          <label for="q41phone">Quantity</label>
          <input id="q41phone" class="heat40-auto-field" type="text" readonly placeholder="Qty">
        </div>
        <div class="input-block">
          <label for="v41phone">VA</label>
          <input id="v41phone" class="heat40-auto-field" type="text" readonly placeholder="Auto">
        </div>
        <div class="inline-managed-controls">
          <button id="m41" class="managed-check" type="button" aria-label="Manage Heat at 40 percent load"></button>
        </div>
      </div>
    `;

    heat2Row.insertAdjacentElement('afterend',row);

    const check=row.querySelector('#m41');
    if(check){
      check.addEventListener('click',function(){
        check.classList.toggle('checked');
        check.textContent=check.classList.contains('checked')?'✓':'';
        saveHeat40Managed();
        if(typeof calculate==='function') calculate();
      });
    }

    restoreHeat40Managed();
  }

  function updateRow(){
    addRow();
    const qtyOut=document.getElementById('q41phone');
    const vaOut=document.getElementById('v41phone');
    if(!qtyOut || !vaOut) return;

    const qty=value('q38')+value('q40');
    const totalHeat=(value('q38')*value('v38'))+(value('q40')*value('v40'));

    qtyOut.value=qty>=4 ? String(qty) : '';
    vaOut.value=qty>=4 ? Math.round(totalHeat*0.40).toLocaleString() : '';
  }

  function reset(){
    try{
      localStorage.removeItem('loadcalcpro_generator_optional_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_managed_quantities_v1');
      localStorage.removeItem(HEAT40_MANAGED_KEY);
    }catch(e){}

    ['projectName','projectNumber','projectAddress','projectCityState'].forEach(function(id){
      const el=document.getElementById(id);if(el)el.value='';
    });

    document.querySelectorAll('input[id^="q"],input[id^="v"]').forEach(function(el){
      if(el.id==='q6') el.value='2';
      else if(el.id==='q7') el.value='1';
      else if(el.id==='v5') el.value='3';
      else if(el.id==='v6'||el.id==='v7') el.value='1500';
      else if(el.id!=='q41phone' && el.id!=='v41phone') el.value='';
    });

    const voltage=document.getElementById('q46');
    if(voltage) voltage.value='240';

    document.querySelectorAll('.managed-check').forEach(function(el){
      el.classList.remove('checked');el.textContent='';
    });
    document.querySelectorAll('.managed-qty').forEach(function(el){
      el.classList.remove('show');el.textContent='0';
    });

    if(typeof calculate==='function') calculate();
    updateRow();
  }

  window.clearInputs=reset;
  window.startNewCalculationFromButton=function(){
    if(confirm('Start a new calculation? This will clear the current entries on this calculator.')) reset();
  };
  window.startNewFromSavedPrompt=function(){
    if(confirm('Start a new calculation? Your previously saved calculation will be replaced.')){
      const modal=document.getElementById('restoreModal');
      if(modal)modal.classList.remove('show');
      reset();
    }
  };

  const originalHvac=window.hvacLoadCalculation;
  if(typeof originalHvac==='function'){
    window.hvacLoadCalculation=function(){
      const result=originalHvac.apply(this,arguments);
      const heatQty=value('q38')+value('q40');
      const generatorHeatControls=result && result.generatorHeating>=result.generatorAC;

      if(heatQty>=4 && generatorHeatControls && heat40Checked()){
        result.generator=0;
        if(typeof setOutput==='function') setOutput('f41',0);
      }
      return result;
    };
  }

  const oldCalculate=window.calculate;
  if(typeof oldCalculate==='function'){
    window.calculate=function(){
      oldCalculate.apply(this,arguments);
      updateRow();
    };
  }

  addStyles();
  addRow();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){addRow();restoreHeat40Managed();updateRow();});
  }else{
    restoreHeat40Managed();
    updateRow();
  }
})();
