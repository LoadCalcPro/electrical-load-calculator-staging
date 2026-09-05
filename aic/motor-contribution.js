(function(){
  'use strict';

  const MOTOR_STORAGE_KEY='loadCalcProAicMotorContributionV1';
  const frame=document.getElementById('aicFrame');
  if(!frame)return;

  /* NEC Table 430.248 — single-phase AC motors. The 230 V column is used for 220–240 V systems. */
  const singlePhaseFLC={
    '208':{
      '0.1667':2.4,'0.25':3.2,'0.3333':4.0,'0.5':5.4,'0.75':7.6,'1':8.8,
      '1.5':11.0,'2':13.2,'3':18.7,'5':30.8,'7.5':44.0,'10':55.0
    },
    '240':{
      '0.1667':2.2,'0.25':2.9,'0.3333':3.6,'0.5':4.9,'0.75':6.9,'1':8.0,
      '1.5':10.0,'2':12.0,'3':17.0,'5':28.0,'7.5':40.0,'10':50.0
    }
  };

  /* NEC Table 430.250 — induction-type squirrel-cage and wound-rotor three-phase AC motors.
     240 V systems use the 230 V column, 480 V systems use the 460 V column,
     and 600 V systems use the 575 V column (550–600 V system range). */
  const threePhaseFLC={
    '208':{
      '0.5':2.4,'0.75':3.5,'1':4.6,'1.5':6.6,'2':7.5,'3':10.6,'5':16.7,'7.5':24.2,
      '10':30.8,'15':46.2,'20':59.4,'25':74.8,'30':88,'40':114,'50':143,'60':169,
      '75':211,'100':273,'125':343,'150':396,'200':528
    },
    '240':{
      '0.5':2.2,'0.75':3.2,'1':4.2,'1.5':6.0,'2':6.8,'3':9.6,'5':15.2,'7.5':22,
      '10':28,'15':42,'20':54,'25':68,'30':80,'40':104,'50':130,'60':154,
      '75':192,'100':248,'125':312,'150':360,'200':480
    },
    '480':{
      '0.5':1.1,'0.75':1.6,'1':2.1,'1.5':3.0,'2':3.4,'3':4.8,'5':7.6,'7.5':11,
      '10':14,'15':21,'20':27,'25':34,'30':40,'40':52,'50':65,'60':77,'75':96,
      '100':124,'125':156,'150':180,'200':240,'250':302,'300':361,'350':414,
      '400':477,'450':515,'500':590
    },
    '600':{
      '0.5':0.9,'0.75':1.3,'1':1.7,'1.5':2.4,'2':2.7,'3':3.9,'5':6.1,'7.5':9,
      '10':11,'15':17,'20':22,'25':27,'30':32,'40':41,'50':52,'60':62,'75':77,
      '100':99,'125':125,'150':144,'200':192,'250':242,'300':289,'350':336,
      '400':382,'450':412,'500':472
    }
  };

  const hpLabels={
    '0.1667':'1/6','0.25':'1/4','0.3333':'1/3','0.5':'1/2','0.75':'3/4','1':'1',
    '1.5':'1 1/2','2':'2','3':'3','5':'5','7.5':'7 1/2','10':'10','15':'15','20':'20',
    '25':'25','30':'30','40':'40','50':'50','60':'60','75':'75','100':'100','125':'125',
    '150':'150','200':'200','250':'250','300':'300','350':'350','400':'400','450':'450','500':'500'
  };

  function innerDoc(){try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}}
  function innerWin(){try{return frame.contentWindow}catch(e){return null}}
  function panelNumber(card,index){return Number(card.dataset.panelIndex||card.dataset.calc||index+1)||index+1}
  function loadState(){try{return JSON.parse(localStorage.getItem(MOTOR_STORAGE_KEY)||'{}')||{}}catch(e){return{}}}
  function saveState(state){try{localStorage.setItem(MOTOR_STORAGE_KEY,JSON.stringify(state))}catch(e){}}
  function clearAllMotorState(){try{localStorage.removeItem(MOTOR_STORAGE_KEY)}catch(e){}}
  function removeMotorUi(){
    const d=innerDoc();
    if(!d)return;
    d.querySelectorAll('.motor-contribution-wrap').forEach(node=>node.remove());
    d.querySelectorAll('.motor-calc-summary').forEach(node=>node.remove());
  }
  function blankRow(){return {phase:'',voltage:'',hp:'',quantity:'1',factor:'4',customFactor:''}}
  function getPanelState(n){
    const state=loadState();
    const saved=state[String(n)];
    if(!saved)return {enabled:false,rows:[]};
    return {enabled:saved.enabled===true,rows:Array.isArray(saved.rows)&&saved.rows.length?saved.rows:[blankRow()]};
  }
  function setPanelState(n,panelState){const state=loadState();state[String(n)]=panelState;saveState(state)}
  function removePanelState(n){const state=loadState();delete state[String(n)];saveState(state)}
  function flcTable(phase){return phase==='single'?singlePhaseFLC:phase==='three'?threePhaseFLC:null}
  function flcValue(row){
    const table=flcTable(row.phase);
    if(!table||!table[row.voltage])return null;
    const value=table[row.voltage][row.hp];
    return Number.isFinite(value)?value:null;
  }
  function factorValue(row){
    if(row.factor==='custom'){
      const v=Number(row.customFactor);
      return Number.isFinite(v)&&v>0?v:null;
    }
    const v=Number(row.factor);
    return Number.isFinite(v)&&v>0?v:null;
  }
  function rowContribution(row){
    const flc=flcValue(row),qty=Number(row.quantity),factor=factorValue(row);
    if(!Number.isFinite(flc)||!Number.isFinite(qty)||qty<1||!Number.isFinite(factor))return null;
    return flc*qty*factor;
  }
  function panelContribution(n){
    const p=getPanelState(n);
    if(!p.enabled)return 0;
    return p.rows.reduce((sum,row)=>{const c=rowContribution(row);return sum+(Number.isFinite(c)?c:0)},0);
  }
  function formatNumber(value,digits){
    return Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';
  }
  function numberFromNode(node){
    if(!node)return null;
    const value=String(node.value??node.textContent??'').replace(/,/g,'').trim();
    if(value==='')return null;
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }
  function voltageOptions(phase,current){
    const values=phase==='single'?['208','240']:phase==='three'?['208','240','480','600']:[];
    return '<option value="">Select voltage</option>'+values.map(v=>`<option value="${v}"${v===current?' selected':''}>${v} V</option>`).join('');
  }
  function hpOptions(row){
    const table=flcTable(row.phase);
    const values=table&&table[row.voltage]?Object.keys(table[row.voltage]).sort((a,b)=>Number(a)-Number(b)):[];
    return '<option value="">Select horsepower</option>'+values.map(v=>`<option value="${v}"${v===row.hp?' selected':''}>${hpLabels[v]||v} HP</option>`).join('');
  }
  function motorStyles(d){
    if(d.getElementById('loadCalcProMotorStyles'))return;
    const style=d.createElement('style');
    style.id='loadCalcProMotorStyles';
    style.textContent=`
      @media screen{
        .motor-contribution-wrap{margin-top:14px;padding-top:13px;border-top:1px solid #dbe3ec}
        .motor-add-toggle{background:#fff!important;color:#1e3a8a!important;border:1px solid #1e3a8a!important;padding:9px 13px!important}
        .motor-contribution-panel{margin-top:10px;padding:14px;border:1px solid #d1dbe7;border-radius:12px;background:#fff}
        .motor-panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:11px}
        .motor-panel-title{font-size:15px;font-weight:800;color:#17365d}
        .motor-panel-note{max-width:760px;margin-top:4px;color:#64748b;font-size:12px;line-height:1.45;font-weight:500}
        .motor-row{padding:12px 0;border-top:1px solid #e2e8f0}
        .motor-row:first-of-type{border-top:0;padding-top:0}
        .motor-row-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;align-items:end}
        .motor-field label{display:block;margin:0 0 5px;color:#475569;font-size:12px;font-weight:700}
        .motor-field input,.motor-field select{min-height:40px;padding:7px 8px;font-size:13px}
        .motor-readout{min-height:40px;display:flex;align-items:center;padding:7px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:13px;font-weight:700;color:#0f172a}
        .motor-custom-factor{margin-top:6px}
        .motor-row-actions{display:flex;justify-content:flex-end;margin-top:8px}
        .motor-row-actions button,.motor-footer button,.motor-panel-header button{min-height:36px;padding:7px 10px;font-size:12px;border-radius:8px}
        .motor-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0}
        .motor-total{font-size:13px;font-weight:800;color:#0f3557}
        .motor-calc-summary{margin-top:9px;padding-top:8px;border-top:1px solid #cbd5e1;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
        .motor-work-block{margin-top:8px}
        .motor-work-title{font-size:13px;font-weight:800;color:#17365d;margin-bottom:5px}
        .motor-work-line{display:grid;grid-template-columns:92px 1fr;gap:8px;font-size:13px;line-height:1.45;margin:2px 0}
        .motor-work-label{font-weight:800;color:#475569}
        .motor-work-value{font-family:Consolas,Monaco,monospace;overflow-wrap:anywhere}
        .motor-total-work{margin-top:7px;padding-top:6px;border-top:1px solid #e2e8f0;font-weight:800}
        @media(max-width:850px){.motor-row-grid{grid-template-columns:1fr 1fr 1fr}}
        @media(max-width:560px){.motor-row-grid{grid-template-columns:1fr 1fr}.motor-panel-header,.motor-footer{align-items:flex-start;flex-direction:column}.motor-work-line{grid-template-columns:1fr}}
      }
      @media print{.motor-contribution-wrap,.motor-calc-summary{display:none!important}}
    `;
    d.head.appendChild(style);
  }
  function readRowFromDom(rowEl){
    return {
      phase:rowEl.querySelector('[data-motor-field="phase"]')?.value||'',
      voltage:rowEl.querySelector('[data-motor-field="voltage"]')?.value||'',
      hp:rowEl.querySelector('[data-motor-field="hp"]')?.value||'',
      quantity:rowEl.querySelector('[data-motor-field="quantity"]')?.value||'1',
      factor:rowEl.querySelector('[data-motor-field="factor"]')?.value||'4',
      customFactor:rowEl.querySelector('[data-motor-field="customFactor"]')?.value||''
    };
  }
  function readPanelFromDom(panel){return {enabled:true,rows:Array.from(panel.querySelectorAll('.motor-row')).map(readRowFromDom)}}
  function updateRowDisplays(rowEl,row){
    const voltage=rowEl.querySelector('[data-motor-field="voltage"]');
    const hp=rowEl.querySelector('[data-motor-field="hp"]');
    const custom=rowEl.querySelector('.motor-custom-factor');
    if(voltage)voltage.innerHTML=voltageOptions(row.phase,row.voltage);
    if(hp)hp.innerHTML=hpOptions(row);
    if(custom)custom.style.display=row.factor==='custom'?'block':'none';
    const flc=flcValue(row),contribution=rowContribution(row);
    const flcNode=rowEl.querySelector('[data-motor-readout="flc"]');
    const contributionNode=rowEl.querySelector('[data-motor-readout="contribution"]');
    if(flcNode)flcNode.textContent=Number.isFinite(flc)?formatNumber(flc,1)+' A':'—';
    if(contributionNode)contributionNode.textContent=Number.isFinite(contribution)?formatNumber(contribution,0)+' A':'—';
  }
  function buildMotorRow(d,row,index){
    const rowEl=d.createElement('div');
    rowEl.className='motor-row';
    rowEl.dataset.motorIndex=String(index);
    rowEl.innerHTML=`
      <div class="motor-row-grid">
        <div class="motor-field"><label>Phase</label><select data-motor-field="phase"><option value="">Select phase</option><option value="single"${row.phase==='single'?' selected':''}>Single phase</option><option value="three"${row.phase==='three'?' selected':''}>Three phase</option></select></div>
        <div class="motor-field"><label>Voltage</label><select data-motor-field="voltage"></select></div>
        <div class="motor-field"><label>Horsepower</label><select data-motor-field="hp"></select></div>
        <div class="motor-field"><label>Quantity</label><input data-motor-field="quantity" type="number" min="1" step="1" value="${row.quantity||'1'}"></div>
        <div class="motor-field"><label>Estimated Contribution Factor</label><select data-motor-field="factor"><option value="4"${row.factor==='4'?' selected':''}>4 × FLC</option><option value="5"${row.factor==='5'?' selected':''}>5 × FLC</option><option value="6"${row.factor==='6'?' selected':''}>6 × FLC</option><option value="custom"${row.factor==='custom'?' selected':''}>Custom</option></select><input class="motor-custom-factor" data-motor-field="customFactor" type="number" min="0.1" step="0.1" placeholder="Custom factor" value="${row.customFactor||''}"></div>
        <div class="motor-field"><label>NEC Table FLC</label><div class="motor-readout" data-motor-readout="flc">—</div></div>
      </div>
      <div class="motor-row-grid" style="margin-top:9px">
        <div class="motor-field" style="grid-column:1/-1"><label>Calculated Motor Contribution</label><div class="motor-readout" data-motor-readout="contribution">—</div></div>
      </div>
      <div class="motor-row-actions"><button type="button" class="secondary motor-remove-row">Remove Motor</button></div>
    `;
    updateRowDisplays(rowEl,row);
    return rowEl;
  }
  function updatePanelTotal(panel,n){
    const node=panel.querySelector('.motor-total');
    if(node)node.textContent='Total Motor Contribution: '+formatNumber(panelContribution(n),0)+' A';
  }
  function renderMotorPanel(card,n,panelState){
    const d=innerDoc();
    let wrap=card.querySelector('.motor-contribution-wrap');
    if(!wrap){
      wrap=d.createElement('div');
      wrap.className='motor-contribution-wrap no-print';
      const buttons=card.querySelector('.button-row');
      card.insertBefore(wrap,buttons||null);
    }
    wrap.innerHTML='';
    if(!panelState.enabled){
      const button=d.createElement('button');
      button.type='button';
      button.className='secondary motor-add-toggle';
      button.textContent='+ Add Motor Contribution';
      button.addEventListener('click',()=>{
        const next={enabled:true,rows:[blankRow()]};
        setPanelState(n,next);
        renderMotorPanel(card,n,next);
        recalculate(n);
        resizeParent();
      });
      wrap.appendChild(button);
      return;
    }

    const panel=d.createElement('div');
    panel.className='motor-contribution-panel';
    panel.innerHTML=`
      <div class="motor-panel-header">
        <div><div class="motor-panel-title">Motor Contribution</div><div class="motor-panel-note">FLC is looked up from NEC Table 430.248 (single phase) or the induction-motor portion of Table 430.250 (three phase). The contribution factor is an estimate; use actual motor/system short-circuit characteristics when available. Do not model a non-regenerative VFD-fed motor as a conventional induction-motor contribution unless the equipment data supports it.</div></div>
        <button type="button" class="secondary motor-remove-section">Remove Section</button>
      </div>
      <div class="motor-rows"></div>
      <div class="motor-footer"><button type="button" class="secondary motor-add-row">+ Add Another Motor</button><div class="motor-total">Total Motor Contribution: 0 A</div></div>
    `;
    const rows=panel.querySelector('.motor-rows');
    const sourceRows=panelState.rows.length?panelState.rows:[blankRow()];
    sourceRows.forEach((row,index)=>rows.appendChild(buildMotorRow(d,row,index)));
    wrap.appendChild(panel);
    updatePanelTotal(panel,n);

    panel.addEventListener('change',event=>handleMotorInput(event,panel,n));
    panel.addEventListener('input',event=>handleMotorInput(event,panel,n));
    panel.querySelector('.motor-add-row').addEventListener('click',()=>{
      const current=readPanelFromDom(panel);
      current.rows.push(blankRow());
      setPanelState(n,current);
      renderMotorPanel(card,n,current);
      recalculate(n);
      resizeParent();
    });
    panel.querySelector('.motor-remove-section').addEventListener('click',()=>{
      removePanelState(n);
      renderMotorPanel(card,n,{enabled:false,rows:[]});
      recalculate(n);
      resizeParent();
    });
    panel.querySelectorAll('.motor-remove-row').forEach((button,index)=>button.addEventListener('click',()=>{
      const current=readPanelFromDom(panel);
      current.rows.splice(index,1);
      if(!current.rows.length)current.rows.push(blankRow());
      setPanelState(n,current);
      renderMotorPanel(card,n,current);
      recalculate(n);
      resizeParent();
    }));
  }
  function handleMotorInput(event,panel,n){
    const rowEl=event.target.closest('.motor-row');
    if(!rowEl)return;
    let row=readRowFromDom(rowEl);
    if(event.target.matches('[data-motor-field="phase"]')){row.voltage='';row.hp=''}
    if(event.target.matches('[data-motor-field="voltage"]'))row.hp='';
    updateRowDisplays(rowEl,row);
    const current=readPanelFromDom(panel);
    setPanelState(n,current);
    updatePanelTotal(panel,n);
    recalculate(n);
    resizeParent();
  }
  function recalculate(n){
    const w=innerWin();
    if(w&&typeof w.calculate==='function'){try{w.calculate(n)}catch(e){}}
  }
  function resizeParent(){try{window.dispatchEvent(new Event('resize'))}catch(e){}}
  function formulaCalculationHtml(d,n,baseAic,contribution,total){
    const suffix=n===1?'':n;
    const L=numberFromNode(d.getElementById('distance'+suffix));
    const I=numberFromNode(d.getElementById('utilityFault'+suffix));
    const E=numberFromNode(d.getElementById('volts'+suffix));
    const N=numberFromNode(d.getElementById('conductors'+suffix));
    const phase=numberFromNode(d.getElementById('phase'+suffix));
    const C=numberFromNode(d.getElementById('cConstant'+suffix));
    if(![L,I,E,N,phase,C].every(Number.isFinite))return '';
    const F=(phase*L*I)/(N*C*E);
    const M=1/(1+F);
    const phaseFactor=phase===2?'2':'1.732';
    const motorState=getPanelState(n);
    let motorHtml='';
    if(motorState.enabled&&contribution>0){
      const motorRows=motorState.rows.map((row,index)=>{
        const flc=flcValue(row),factor=factorValue(row),qty=Number(row.quantity),rowTotal=rowContribution(row);
        if(!Number.isFinite(flc)||!Number.isFinite(factor)||!Number.isFinite(qty)||!Number.isFinite(rowTotal))return '';
        return `<div class="motor-work-block"><div class="motor-work-title">Motor ${motorState.rows.length>1?index+1:''}</div><div class="motor-work-line"><span class="motor-work-label">Formula</span><span class="motor-work-value">Motor Contribution = NEC Table FLC × Quantity × Estimated Contribution Factor</span></div><div class="motor-work-line"><span class="motor-work-label">Calculation</span><span class="motor-work-value">${formatNumber(flc,1)} × ${qty} × ${formatNumber(factor,1)} = ${formatNumber(rowTotal,0)} A</span></div></div>`;
      }).join('');
      motorHtml=`${motorRows}<div class="motor-work-line motor-total-work"><span class="motor-work-label">Formula</span><span class="motor-work-value">Total AIC = Available Fault Current + Motor Contribution</span></div><div class="motor-work-line"><span class="motor-work-label">Calculation</span><span class="motor-work-value">${formatNumber(baseAic,0)} + ${formatNumber(contribution,0)} = ${formatNumber(total,0)} A</span></div>`;
    }
    return `<div class="motor-calc-summary">
      <div class="motor-work-block"><div class="motor-work-title">Fault Current Factor</div><div class="motor-work-line"><span class="motor-work-label">Formula</span><span class="motor-work-value">F = ${phaseFactor} × L × I ÷ (N × C × V)</span></div><div class="motor-work-line"><span class="motor-work-label">Calculation</span><span class="motor-work-value">F = ${phaseFactor} × ${formatNumber(L,0)} × ${formatNumber(I,0)} ÷ (${formatNumber(N,0)} × ${formatNumber(C,0)} × ${formatNumber(E,0)}) = ${F.toFixed(4)}</span></div></div>
      <div class="motor-work-block"><div class="motor-work-title">Multiplier</div><div class="motor-work-line"><span class="motor-work-label">Formula</span><span class="motor-work-value">M = 1 ÷ (1 + F)</span></div><div class="motor-work-line"><span class="motor-work-label">Calculation</span><span class="motor-work-value">M = 1 ÷ (1 + ${F.toFixed(4)}) = ${M.toFixed(4)}</span></div></div>
      <div class="motor-work-block"><div class="motor-work-title">Available Fault Current</div><div class="motor-work-line"><span class="motor-work-label">Formula</span><span class="motor-work-value">Isc = I × M</span></div><div class="motor-work-line"><span class="motor-work-label">Calculation</span><span class="motor-work-value">Isc = ${formatNumber(I,0)} × ${M.toFixed(4)} = ${formatNumber(baseAic,0)} A</span></div></div>
      ${motorHtml}
    </div>`;
  }
  function applyMotorToCalculatedResult(w,d,n){
    const suffix=n===1?'':n;
    const result=d.getElementById('aicResult'+suffix);
    const details=d.getElementById('calcDetails'+suffix);
    if(!result||!details)return;
    details.querySelector('.motor-calc-summary')?.remove();
    const base=Number(String(result.textContent||'').replace(/,/g,'').trim());
    if(!Number.isFinite(base))return;
    const contribution=panelContribution(n);
    const total=base+contribution;
    result.textContent=Math.round(total).toLocaleString();
    const work=formulaCalculationHtml(d,n,base,contribution,total);
    if(work)details.insertAdjacentHTML('beforeend',work);
  }
  function installCalculationWrapper(){
    const w=innerWin(),d=innerDoc();
    if(!w||!d||w.__loadCalcProMotorWrapped||typeof w.calculate!=='function')return;
    const original=w.calculate;
    let active=false;
    w.calculate=function(n){
      if(active)return original.call(w,n);
      active=true;
      try{original.call(w,n);applyMotorToCalculatedResult(w,d,n)}finally{active=false}
    };
    w.__loadCalcProMotorWrapped=true;
  }
  function installMotorSections(){
    const d=innerDoc();if(!d)return;
    motorStyles(d);
    const state=loadState();
    Array.from(d.querySelectorAll('#calculationsContainer > .card')).forEach((card,index)=>{
      const n=panelNumber(card,index);
      if(!card.querySelector('.motor-contribution-wrap')){
        const saved=state[String(n)];
        renderMotorPanel(card,n,saved?getPanelState(n):{enabled:false,rows:[]});
      }
    });
  }
  function installResetHooks(){
    const d=innerDoc();if(!d||d.__loadCalcProMotorResetHook)return;
    d.__loadCalcProMotorResetHook=true;
    d.addEventListener('click',event=>{
      const reset=event.target.closest('#resetBtn,[data-reset]');
      if(reset){
        const card=reset.closest('.card');
        if(card){
          const index=Array.from(d.querySelectorAll('#calculationsContainer > .card')).indexOf(card);
          const n=panelNumber(card,index);
          setTimeout(()=>{
            removePanelState(n);
            card.querySelector('.motor-contribution-wrap')?.remove();
            renderMotorPanel(card,n,{enabled:false,rows:[]});
            recalculate(n);
            resizeParent();
          },0);
        }
      }
      if(event.target.closest('#startNewBtn')){
        clearAllMotorState();
        setTimeout(()=>{
          removeMotorUi();
          installMotorSections();
          recalculate(1);
          resizeParent();
        },0);
      }
    },true);
  }
  function install(){
    const d=innerDoc();if(!d)return;
    installCalculationWrapper();
    installMotorSections();
    installResetHooks();
    try{
      const w=innerWin();
      if(w&&typeof w.calculate==='function'){
        Array.from(d.querySelectorAll('#calculationsContainer > .card')).forEach((card,index)=>w.calculate(panelNumber(card,index)));
      }
    }catch(e){}
    resizeParent();
  }

  frame.addEventListener('load',()=>{
    install();
    setTimeout(install,150);
    setTimeout(install,650);
    const d=innerDoc();
    if(d)d.addEventListener('click',()=>setTimeout(install,40),true);
  });

  document.getElementById('newCalculationBtn')?.addEventListener('click',()=>{
    clearAllMotorState();
    removeMotorUi();
    setTimeout(install,40);
  },true);

  try{
    const d=innerDoc();
    if(d&&d.readyState==='complete')install();
  }catch(e){}
})();