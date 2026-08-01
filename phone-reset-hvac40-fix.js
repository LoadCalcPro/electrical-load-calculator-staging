(function(){
  'use strict';

  const METHOD_KEY='loadcalcpro_generator_mobile_heating_method_v1';
  const METHODS={CENTRAL:'central65',FORTY:'separate40',HEATPUMP:'heatpump'};
  let selectedMethod='';

  function value(id){
    const el=document.getElementById(id);
    const n=el ? Number(el.value) : 0;
    return Number.isFinite(n) && n>0 ? n : 0;
  }
  function rowServiceVA(row){return value('q'+row)*value('v'+row);}
  function remainingQty(row){return Math.max(Math.floor(value('q'+row))-managedQuantity(row),0);}
  function remainingVA(row){return remainingQty(row)*value('v'+row);}
  function totalHeatQty(){return Math.floor(value('q38'))+Math.floor(value('q40'));}
  function totalHeatVA(){return rowServiceVA(38)+rowServiceVA(40);}

  function addStyles(){
    if(document.getElementById('heatingMethodStyles')) return;
    const style=document.createElement('style');
    style.id='heatingMethodStyles';
    style.textContent=`
      .heating-method-panel{margin:0 0 12px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc}
      .heating-method-title{margin:0 0 9px;color:#0f172a;font-size:18px;font-weight:900}
      .heating-method-choice{display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:9px;width:100%;min-height:54px;margin:7px 0 0;border:1px solid #cbd5e1;border-radius:9px;padding:7px 9px;background:#fff;color:#111827;text-align:left;cursor:pointer}
      .heating-method-choice:first-of-type{margin-top:0}.heating-method-choice.selected{border-color:#15803d;background:#ecfdf5}
      .heating-method-check{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:2px solid #22a447;border-radius:8px;background:#f7fff9;color:#15803d;font-family:'Segoe UI Symbol',Arial,sans-serif;font-size:22px;font-weight:900}
      .heating-method-text{font-size:16px;line-height:1.25;font-weight:800}
      .heating-input-disabled{opacity:.45}.heating-input-disabled input,.heating-input-disabled button{pointer-events:none}
      #phoneHeat40Row{display:none}#phoneHeat40Row.show{display:block}
      #phoneHeat40Row .heat40-auto-field{width:100%;min-height:48px;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;background:#eef2f7;color:#64748b;font-size:18px;font-weight:800;text-align:left}
    `;
    document.head.appendChild(style);
  }

  function ensureMethodPanel(){
    let panel=document.getElementById('heatingMethodPanel');
    if(panel) return panel;
    const hvacCard=Array.from(document.querySelectorAll('main .card')).find(function(card){
      const h=card.querySelector('.card-heading');
      return h && h.textContent.replace(/\s+/g,' ').trim()==='HVAC and Continuous Loads';
    });
    if(!hvacCard) return null;
    const body=hvacCard.querySelector('.card-body');
    const note=body && body.querySelector('.section-note');
    if(!body) return null;
    panel=document.createElement('div');
    panel.id='heatingMethodPanel';
    panel.className='heating-method-panel';
    panel.innerHTML=`
      <div class="heating-method-title">Heating Method (Required)</div>
      <button type="button" class="heating-method-choice" data-method="${METHODS.CENTRAL}"><span class="heating-method-check"></span><span class="heating-method-text">Cooling Only / Central Electric Heat (65%)</span></button>
      <button type="button" class="heating-method-choice" data-method="${METHODS.FORTY}"><span class="heating-method-check"></span><span class="heating-method-text">Four or More Separately Controlled Electric Heating Systems (40%)</span></button>
      <button type="button" class="heating-method-choice" data-method="${METHODS.HEATPUMP}"><span class="heating-method-check"></span><span class="heating-method-text">Heat Pump with Supplemental Electric Heat</span></button>`;
    if(note) note.insertAdjacentElement('afterend',panel); else body.insertBefore(panel,body.firstChild);
    panel.querySelectorAll('.heating-method-choice').forEach(function(btn){btn.addEventListener('click',function(){selectMethod(btn.dataset.method);});});
    return panel;
  }

  function ensure40Row(){
    const old=document.getElementById('hvac40Row');
    if(old) old.remove();
    let row=document.getElementById('phoneHeat40Row');
    if(row) return row;
    const q40=document.getElementById('q40');
    const heat2Row=q40 ? q40.closest('.load-row') : null;
    if(!heat2Row) return null;
    row=document.createElement('div');
    row.id='phoneHeat40Row';
    row.className='load-row';
    row.innerHTML=`<div class="load-name">Heat at 40%</div><div class="load-inputs inline-load-row"><div class="input-block"><input id="q41" class="heat40-auto-field" type="number" readonly placeholder="Qty"></div><div class="input-block"><input id="v41" class="heat40-auto-field" type="text" readonly placeholder="Auto"></div><div class="inline-managed-controls"><button id="m41" class="managed-check" type="button"></button><button id="mq41" class="managed-qty" type="button">0</button></div></div><div id="e41" hidden></div><div id="f41" hidden></div>`;
    heat2Row.insertAdjacentElement('afterend',row);
    row.querySelector('#m41').addEventListener('click',function(){toggleManaged(41);});
    row.querySelector('#mq41').addEventListener('click',function(){reduceManagedQuantity(41);});
    return row;
  }

  function heatingRows(){
    return [38,40].map(function(r){const el=document.getElementById('q'+r);return el?el.closest('.load-row'):null;}).filter(Boolean);
  }
  function saveMethod(){try{localStorage.setItem(METHOD_KEY,selectedMethod);}catch(e){}}
  function restoreMethod(){
    try{const saved=localStorage.getItem(METHOD_KEY)||'';if(Object.values(METHODS).includes(saved)) selectedMethod=saved;}catch(e){}
  }
  function updateMethodUI(){
    const panel=ensureMethodPanel();
    if(panel){
      panel.querySelectorAll('.heating-method-choice').forEach(function(btn){
        const active=btn.dataset.method===selectedMethod;
        btn.classList.toggle('selected',active);
        btn.setAttribute('aria-pressed',active?'true':'false');
        const mark=btn.querySelector('.heating-method-check');if(mark) mark.textContent=active?'✓':'';
      });
    }
    const enabled=!!selectedMethod;
    heatingRows().forEach(function(row){
      row.classList.toggle('heating-input-disabled',!enabled);
      row.querySelectorAll('input,button').forEach(function(control){control.disabled=!enabled;});
    });
    const row40=ensure40Row();if(row40) row40.classList.toggle('show',selectedMethod===METHODS.FORTY);
  }
  function selectMethod(method){selectedMethod=method;saveMethod();updateMethodUI();if(typeof calculate==='function') calculate();}

  window.hvacLoadCalculation=function(){
    const row40=ensure40Row();
    const ac1=rowServiceVA(37),ac2=rowServiceVA(39),serviceAC=ac1+ac2;
    const heat1=rowServiceVA(38),heat2=rowServiceVA(40),serviceHeatTotal=heat1+heat2,serviceHeatQty=totalHeatQty();
    const generatorAC=remainingVA(37)+remainingVA(39),generatorHeatTotal=remainingVA(38)+remainingVA(40);
    let serviceHeating=0,generatorHeating=0,serviceHVAC=serviceAC,generatorHVAC=generatorAC;

    if(selectedMethod===METHODS.CENTRAL){
      serviceHeating=serviceHeatTotal*.65;generatorHeating=generatorHeatTotal*.65;
      serviceHVAC=Math.max(serviceAC,serviceHeating);generatorHVAC=Math.max(generatorAC,generatorHeating);
    }else if(selectedMethod===METHODS.FORTY){
      serviceHeating=serviceHeatTotal*.40;
      const managed40=managedQuantity(41),generatorHeatQty=Math.max(serviceHeatQty-managed40,0),avg=serviceHeatQty?serviceHeatTotal/serviceHeatQty:0;
      generatorHeating=generatorHeatQty*avg*.40;
      serviceHVAC=Math.max(serviceAC,serviceHeating);generatorHVAC=Math.max(generatorAC,generatorHeating);
      const q41=document.getElementById('q41'),v41=document.getElementById('v41');
      if(q41) q41.value=serviceHeatQty?String(serviceHeatQty):'';
      if(v41) v41.value=serviceHeatQty?Math.round(serviceHeating).toLocaleString('en-US')+' VA':'';
      updateManagedControl(41);
    }else if(selectedMethod===METHODS.HEATPUMP){
      serviceHeating=serviceAC+(serviceHeatTotal*.65);generatorHeating=generatorAC+(generatorHeatTotal*.65);
      serviceHVAC=Math.max(serviceAC,serviceHeating);generatorHVAC=Math.max(generatorAC,generatorHeating);
    }

    const serviceACControls=serviceAC>=serviceHeating,generatorACControls=generatorAC>=generatorHeating;
    if(selectedMethod===METHODS.FORTY){
      setOutput('e37',serviceACControls?ac1:0);setOutput('e38',0);setOutput('e39',serviceACControls?ac2:0);setOutput('e40',0);setOutput('e41',!serviceACControls?serviceHeating:0);
      setOutput('f37',generatorACControls?remainingVA(37):0);setOutput('f38',0);setOutput('f39',generatorACControls?remainingVA(39):0);setOutput('f40',0);setOutput('f41',!generatorACControls?generatorHeating:0);
    }else{
      managedQuantities[41]=0;updateManagedControl(41);
      setOutput('e37',serviceACControls?ac1:0);setOutput('e38',!serviceACControls&&selectedMethod?heat1*.65:0);setOutput('e39',serviceACControls?ac2:0);setOutput('e40',!serviceACControls&&selectedMethod?heat2*.65:0);setOutput('e41',0);
      setOutput('f37',generatorACControls?remainingVA(37):0);setOutput('f38',!generatorACControls&&selectedMethod?remainingVA(38)*.65:0);setOutput('f39',generatorACControls?remainingVA(39):0);setOutput('f40',!generatorACControls&&selectedMethod?remainingVA(40)*.65:0);setOutput('f41',0);
    }
    if(row40) row40.classList.toggle('show',selectedMethod===METHODS.FORTY);
    saveManagedQuantities();
    return {service:serviceHVAC,generator:generatorHVAC,serviceAC:serviceAC,generatorAC:generatorAC,serviceHeating:serviceHeating,generatorHeating:generatorHeating,heatingMethod:selectedMethod};
  };

  const oldCalculate=window.calculate;
  window.calculate=function(){
    const general=generalLoadCalculation(),appliances=applianceLoadCalculation(),demand=combinedDemandCalculation(general,appliances),hvac=window.hvacLoadCalculation(),continuous=window.continuousLoadCalculation?window.continuousLoadCalculation():continuousLoadCalculation();
    const serviceTotal=demand.service+hvac.service+continuous.service,generatorTotal=demand.generator+hvac.generator+continuous.generator;
    setOutput('e44',hvac.service+continuous.service);setOutput('f44',hvac.generator+continuous.generator);setOutput('e45',serviceTotal);setOutput('f45',generatorTotal);
    const voltage=serviceVoltage();displayAmps('serviceAmps',calculateAmps(serviceTotal,voltage));displayAmps('generatorAmps',calculateAmps(generatorTotal,voltage));
    if(typeof updateManagedControls==='function') updateManagedControls();
    if(typeof saveState==='function') saveState();
    if(typeof updatePrintReport==='function') updatePrintReport();
  };

  const oldClear=window.clearInputs;
  window.clearInputs=function(){selectedMethod='';try{localStorage.removeItem(METHOD_KEY);}catch(e){}managedQuantities[41]=0;if(typeof oldClear==='function') oldClear.apply(this,arguments);updateMethodUI();};

  function init(){addStyles();ensureMethodPanel();ensure40Row();restoreMethod();updateMethodUI();if(typeof calculate==='function') calculate();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
