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
    style.textContent=`
      .hvac-40-row{
        padding:12px 0;
        border-bottom:1px solid #e5e7eb;
      }
      .hvac-40-title{
        margin-bottom:9px;
        color:#111827;
        font-size:18px;
        line-height:1.25;
        font-weight:900;
      }
      .hvac-40-line{
        display:grid;
        grid-template-columns:82px minmax(0,1fr) 48px;
        align-items:center;
        gap:8px;
      }
      .hvac-40-qty,
      .hvac-40-value{
        min-height:46px;
        display:flex;
        align-items:center;
        border:1px solid #cbd5e1;
        border-radius:8px;
        padding:9px 10px;
        background:#eef2f7;
        color:#111827;
        font-size:18px;
        line-height:1.2;
        text-align:left;
      }
      .hvac-40-auto{
        min-height:46px;
        display:flex;
        align-items:center;
        justify-content:center;
        border:2px solid #15803d;
        border-radius:8px;
        background:#f0fdf4;
        color:#14532d;
        font-size:14px;
        font-weight:900;
      }
      .hvac-40-note{
        margin-top:7px;
        color:#6b7280;
        font-size:14px;
        line-height:1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function addRow(){
    let row=document.getElementById('phoneHeat40Row');
    if(row) return row;

    const names=Array.from(document.querySelectorAll('.load-name'));
    const heat2=names.find(function(el){
      return el.textContent.replace(/\s+/g,' ').trim()==='Heating Group 2';
    });
    const heat2Row=heat2 ? heat2.closest('.load-row') : null;
    if(!heat2Row) return null;

    row=document.createElement('div');
    row.id='phoneHeat40Row';
    row.className='load-row hvac-40-row';
    row.innerHTML=`
      <div class="hvac-40-title">Heat at 40%</div>
      <div class="hvac-40-line">
        <div id="phoneHeat40Qty" class="hvac-40-qty">Quantity</div>
        <div id="phoneHeat40Value" class="hvac-40-value">Calculated VA</div>
        <div class="hvac-40-auto">AUTO</div>
      </div>
      <div class="hvac-40-note">Used automatically when the total quantity in Heating Group 1 and Heating Group 2 is four or more.</div>
    `;
    heat2Row.insertAdjacentElement('afterend',row);
    return row;
  }

  function updateRow(){
    addStyles();
    addRow();

    const qtyOut=document.getElementById('phoneHeat40Qty');
    const vaOut=document.getElementById('phoneHeat40Value');
    if(!qtyOut || !vaOut) return;

    const qty=value('q38')+value('q40');
    const totalHeat=(value('q38')*value('v38'))+(value('q40')*value('v40'));

    if(qty>=4){
      qtyOut.textContent=String(qty);
      vaOut.textContent=Math.round(totalHeat*0.40).toLocaleString()+' VA';
    }else{
      qtyOut.textContent='Quantity';
      vaOut.textContent='Calculated VA';
    }
  }

  function reset(){
    try{
      localStorage.removeItem('loadcalcpro_generator_optional_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_managed_quantities_v1');
    }catch(e){}

    ['projectName','projectNumber','projectAddress','projectCityState'].forEach(function(id){
      const el=document.getElementById(id);
      if(el) el.value='';
    });

    document.querySelectorAll('input[id^="q"],input[id^="v"]').forEach(function(el){
      if(el.id==='q6') el.value='2';
      else if(el.id==='q7') el.value='1';
      else if(el.id==='v5') el.value='3';
      else if(el.id==='v6'||el.id==='v7') el.value='1500';
      else el.value='';
    });

    const voltage=document.getElementById('q46');
    if(voltage) voltage.value='240';

    document.querySelectorAll('.managed-check').forEach(function(el){
      el.classList.remove('checked');
      el.textContent='';
    });
    document.querySelectorAll('.managed-qty').forEach(function(el){
      el.classList.remove('show');
      el.textContent='0';
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
      if(modal) modal.classList.remove('show');
      reset();
    }
  };

  const oldCalculate=window.calculate;
  if(typeof oldCalculate==='function'){
    window.calculate=function(){
      oldCalculate.apply(this,arguments);
      updateRow();
    };
  }

  addStyles();
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',updateRow);
  }else{
    updateRow();
  }
})();
