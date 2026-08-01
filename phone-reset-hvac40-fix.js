(function(){
  'use strict';

  function value(id){
    const el=document.getElementById(id);
    const n=el ? Number(el.value) : 0;
    return Number.isFinite(n) && n>0 ? n : 0;
  }

  function totalHeatQty(){
    return Math.floor(value('q38'))+Math.floor(value('q40'));
  }

  function totalHeatVA(){
    return (value('q38')*value('v38'))+(value('q40')*value('v40'));
  }

  function remainingQty(row){
    return Math.max(Math.floor(value('q'+row))-managedQuantity(row),0);
  }

  function remainingVA(row){
    return remainingQty(row)*value('v'+row);
  }

  function addStyles(){
    if(document.getElementById('phoneHvac40Styles')) return;
    const style=document.createElement('style');
    style.id='phoneHvac40Styles';
    style.textContent=`
      #phoneHeat40Row{display:none;}
      #phoneHeat40Row.show{display:block;}
      #phoneHeat40Row .heat40-auto-field{
        width:100%;min-height:46px;border:1px solid #cbd5e1;border-radius:8px;
        padding:9px 10px;background:#eef2f7;color:#64748b;font-size:18px;
        font-weight:800;text-align:left;
      }
      .hvac-control-disabled{opacity:.45;pointer-events:none;}
    `;
    document.head.appendChild(style);
  }

  function addRow(){
    const oldHidden=document.getElementById('hvac40Row');
    if(oldHidden) oldHidden.remove();

    let row=document.getElementById('phoneHeat40Row');
    if(row) return row;

    const q40=document.getElementById('q40');
    const heat2Row=q40 ? q40.closest('.load-row') : null;
    if(!heat2Row) return null;

    row=document.createElement('div');
    row.id='phoneHeat40Row';
    row.className='load-row';
    row.innerHTML=`
      <div class="load-name">Heat at 40%</div>
      <div class="load-inputs inline-load-row">
        <div class="input-block">
          <input id="q41" class="heat40-auto-field" type="number" readonly placeholder="Qty" aria-label="Heating units at 40 percent">
        </div>
        <div class="input-block">
          <input id="v41" class="heat40-auto-field" type="text" readonly placeholder="Auto" aria-label="Calculated heating load at 40 percent">
        </div>
        <div class="inline-managed-controls">
          <button id="m41" class="managed-check" type="button" aria-label="Manage Heat at 40 percent load"></button>
          <button id="mq41" class="managed-qty" type="button" aria-label="Reduce managed heating quantity">0</button>
        </div>
      </div>
      <div id="e41" hidden></div>
      <div id="f41" hidden></div>`;

    heat2Row.insertAdjacentElement('afterend',row);

    document.getElementById('m41').addEventListener('click',function(){
      toggleManaged(41);
    });
    document.getElementById('mq41').addEventListener('click',function(){
      reduceManagedQuantity(41);
    });

    return row;
  }

  function disableStandardHVACManaged(disabled){
    [37,38,39,40].forEach(function(row){
      ['m','mq'].forEach(function(prefix){
        const control=document.getElementById(prefix+row);
        if(control){
          control.disabled=disabled;
          control.classList.toggle('hvac-control-disabled',disabled);
        }
      });
    });
  }

  function installFinalFix(){
    addStyles();
    addRow();

    window.hvacLoadCalculation=function(){
      const row=addRow();
      const ac1Service=value('q37')*value('v37');
      const heat1Service=value('q38')*value('v38');
      const ac2Service=value('q39')*value('v39');
      const heat2Service=value('q40')*value('v40');

      const serviceAC=ac1Service+ac2Service;
      const serviceHeatQty=totalHeatQty();
      const serviceHeatTotal=totalHeatVA();
      const serviceHeating=serviceHeatQty>=4
        ? serviceHeatTotal*0.40
        : (serviceHeatQty>0 ? serviceHeatTotal*0.65 : 0);
      const fortyPercentMode=serviceHeatQty>=4 && serviceHeating>=serviceAC;
      const serviceHVAC=Math.max(serviceAC,serviceHeating);

      if(row) row.classList.toggle('show',fortyPercentMode);
      disableStandardHVACManaged(fortyPercentMode);

      let generatorAC=0;
      let generatorHeating=0;

      if(fortyPercentMode){
        const q41=document.getElementById('q41');
        const v41=document.getElementById('v41');
        if(q41) q41.value=String(serviceHeatQty);
        if(v41) v41.value=Math.round(serviceHeating).toLocaleString('en-US')+' VA';

        /* Service remains based on all original heating units.
           Row 41 only removes selected units from the generator load. */
        const managed40=managedQuantity(41);
        const generatorHeatQty=Math.max(serviceHeatQty-managed40,0);
        const averageVAEach=serviceHeatQty>0 ? serviceHeatTotal/serviceHeatQty : 0;
        generatorHeating=generatorHeatQty*averageVAEach*0.40;

        updateManagedControl(41);

        setOutput('e37',0);setOutput('e38',0);setOutput('e39',0);setOutput('e40',0);
        setOutput('f37',0);setOutput('f38',0);setOutput('f39',0);setOutput('f40',0);
        setOutput('e41',serviceHeating);
        setOutput('f41',generatorHeating);
      }else{
        managedQuantities[41]=0;
        updateManagedControl(41);

        generatorAC=remainingVA(37)+remainingVA(39);
        const generatorHeatQty=remainingQty(38)+remainingQty(40);
        const generatorHeatTotal=remainingVA(38)+remainingVA(40);
        generatorHeating=generatorHeatQty>0 ? generatorHeatTotal*0.65 : 0;

        const serviceACControls=serviceAC>=serviceHeating;
        const generatorACControls=generatorAC>=generatorHeating;

        setOutput('e37',serviceACControls?ac1Service:0);
        setOutput('e38',!serviceACControls?heat1Service*0.65:0);
        setOutput('e39',serviceACControls?ac2Service:0);
        setOutput('e40',!serviceACControls?heat2Service*0.65:0);
        setOutput('e41',0);

        setOutput('f37',generatorACControls?remainingVA(37):0);
        setOutput('f38',!generatorACControls?remainingVA(38)*0.65:0);
        setOutput('f39',generatorACControls?remainingVA(39):0);
        setOutput('f40',!generatorACControls?remainingVA(40)*0.65:0);
        setOutput('f41',0);
      }

      saveManagedQuantities();

      return {
        service:serviceHVAC,
        generator:fortyPercentMode?generatorHeating:Math.max(generatorAC,generatorHeating),
        serviceAC:serviceAC,
        generatorAC:generatorAC,
        serviceHeating:serviceHeating,
        generatorHeating:generatorHeating,
        fortyPercentMode:fortyPercentMode
      };
    };

    const priorCalculate=window.calculate;
    window.calculate=function(){
      const generalLoad=generalLoadCalculation();
      const applianceLoads=applianceLoadCalculation();
      const demandLoads=combinedDemandCalculation(generalLoad,applianceLoads);
      const hvacLoads=window.hvacLoadCalculation();
      const continuousLoads=window.continuousLoadCalculation
        ? window.continuousLoadCalculation()
        : continuousLoadCalculation();

      const serviceTotalVA=demandLoads.service+hvacLoads.service+continuousLoads.service;
      const generatorTotalVA=demandLoads.generator+hvacLoads.generator+continuousLoads.generator;

      setOutput('e44',hvacLoads.service+continuousLoads.service);
      setOutput('f44',hvacLoads.generator+continuousLoads.generator);
      setOutput('e45',serviceTotalVA);
      setOutput('f45',generatorTotalVA);

      const voltage=serviceVoltage();
      displayAmps('serviceAmps',calculateAmps(serviceTotalVA,voltage));
      displayAmps('generatorAmps',calculateAmps(generatorTotalVA,voltage));

      if(typeof updateManagedControls==='function') updateManagedControls();
      if(typeof saveState==='function') saveState();
      if(typeof updatePrintReport==='function') updatePrintReport();
    };

    if(typeof window.calculate==='function') window.calculate();
  }

  function reset(){
    try{
      localStorage.removeItem('loadcalcpro_generator_optional_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_nec2023_v1');
      localStorage.removeItem('loadcalcpro_generator_mobile_managed_quantities_v1');
    }catch(e){}

    ['projectName','projectNumber','projectAddress','projectCityState'].forEach(function(id){
      const el=document.getElementById(id);if(el)el.value='';
    });

    document.querySelectorAll('input[id^="q"],input[id^="v"]').forEach(function(el){
      if(el.id==='q6') el.value='2';
      else if(el.id==='q7') el.value='1';
      else if(el.id==='v5') el.value='3';
      else if(el.id==='v6'||el.id==='v7') el.value='1500';
      else if(el.id!=='q41'&&el.id!=='v41') el.value='';
    });

    const voltage=document.getElementById('q46');
    if(voltage) voltage.value='240';

    Object.keys(managedQuantities).forEach(function(key){delete managedQuantities[key];});
    saveManagedQuantities();
    document.querySelectorAll('.managed-check').forEach(function(el){el.classList.remove('checked');el.textContent='';});
    document.querySelectorAll('.managed-qty').forEach(function(el){el.classList.remove('show');el.textContent='0';});
    if(typeof window.calculate==='function') window.calculate();
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

  window.addEventListener('load',function(){
    setTimeout(installFinalFix,0);
  });
})();
