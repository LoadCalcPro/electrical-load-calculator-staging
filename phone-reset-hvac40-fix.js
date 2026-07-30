(function(){
  'use strict';

  function value(id){
    const el=document.getElementById(id);
    const n=el ? Number(el.value) : 0;
    return Number.isFinite(n) && n>0 ? n : 0;
  }

  function addStyles(){
    if(document.getElementById('phoneHvac40Styles')) return;
    const style=document.createElement('style');
    style.id='phoneHvac40Styles';
    style.textContent='.hvac-40-row{margin-top:10px;padding:11px 12px;border:1px solid #93c5fd;border-radius:8px;background:#eff6ff}.hvac-40-title{color:#1e3a8a;font-size:17px;font-weight:900}.hvac-40-detail{margin-top:4px;color:#374151;font-size:15px;line-height:1.35}.hvac-40-value{margin-top:5px;color:#0f172a;font-size:18px;font-weight:900}';
    document.head.appendChild(style);
  }

  function addRow(){
    if(document.getElementById('phoneHeat40Row')) return;
    const names=Array.from(document.querySelectorAll('.load-name'));
    const heat2=names.find(function(el){return el.textContent.replace(/\s+/g,' ').trim()==='Heating Group 2';});
    const heat2Row=heat2 ? heat2.closest('.load-row') : null;
    if(!heat2Row) return;
    const row=document.createElement('div');
    row.id='phoneHeat40Row';
    row.className='hvac-40-row';
    row.innerHTML='<div class="hvac-40-title">Heat at 40%</div><div class="hvac-40-detail">Automatically used when the total heating quantity is 4 or more, if it is larger than the air-conditioning load.</div><div id="phoneHeat40Value" class="hvac-40-value"></div>';
    heat2Row.insertAdjacentElement('afterend',row);
  }

  function updateRow(){
    addRow();
    const out=document.getElementById('phoneHeat40Value');
    if(!out) return;
    const qty=value('q38')+value('q40');
    const va=(value('q38')*value('v38'))+(value('q40')*value('v40'));
    out.textContent=qty>=4 ? 'Heating quantity: '+qty+' | 40% load: '+Math.round(va*0.40).toLocaleString()+' VA' : 'Enter 4 or more total heating units to apply the 40% calculation.';
  }

  function reset(){
    try{
      localStorage.removeItem('loadcalcpro_generator_optional_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_managed_quantities_v1');
    }catch(e){}

    ['projectName','projectNumber','projectAddress','projectCityState'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});

    document.querySelectorAll('input[id^="q"],input[id^="v"]').forEach(function(el){
      if(el.id==='q6') el.value='2';
      else if(el.id==='q7') el.value='1';
      else if(el.id==='v5') el.value='3';
      else if(el.id==='v6'||el.id==='v7') el.value='1500';
      else el.value='';
    });

    const voltage=document.getElementById('q46');
    if(voltage) voltage.value='240';

    document.querySelectorAll('.managed-check').forEach(function(el){el.classList.remove('checked');el.textContent='';});
    document.querySelectorAll('.managed-qty').forEach(function(el){el.classList.remove('show');el.textContent='0';});

    if(typeof calculate==='function') calculate();
    updateRow();
  }

  window.clearInputs=reset;
  window.startNewCalculationFromButton=function(){if(confirm('Start a new calculation? This will clear the current entries on this calculator.')) reset();};
  window.startNewFromSavedPrompt=function(){if(confirm('Start a new calculation? Your previously saved calculation will be replaced.')){const modal=document.getElementById('restoreModal');if(modal)modal.classList.remove('show');reset();}};

  const oldCalculate=window.calculate;
  if(typeof oldCalculate==='function'){
    window.calculate=function(){oldCalculate.apply(this,arguments);updateRow();};
  }

  addStyles();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateRow); else updateRow();
})();
