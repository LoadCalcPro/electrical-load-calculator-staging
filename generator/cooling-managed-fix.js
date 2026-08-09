/* LoadCalcPro staging hotfix: preserve the service-selected HVAC controller when managed loads are applied. */
(function(){
  'use strict';

  const original = window.hvacLoadCalculation;
  if (typeof original !== 'function') return;

  const METHODS_KEY = 'loadcalcpro_hvac_selected_methods_v1';
  const DATA_KEY = 'loadcalcpro_hvac_method_sections_v57';
  const MANAGED_KEY = 'loadcalcpro_hvac_method_managed_v57';
  const COUNT_KEY = 'loadcalcpro_hvac_visible_system_counts_v522';
  const HP_SYSTEM_KEY = 'loadcalcpro_hvac_heatpump_answers_v543';

  function readJSON(key, fallback){
    try {
      const value = JSON.parse(localStorage.getItem(key) || '');
      return value && typeof value === 'object' ? value : fallback;
    } catch(e){
      return fallback;
    }
  }

  function selected(){
    const value = readJSON(METHODS_KEY, []);
    return Array.isArray(value) ? value.filter(m => ['central65','separate40','heatpump'].includes(m)) : [];
  }

  function count(method){
    const counts = readJSON(COUNT_KEY, {});
    return Math.max(1, Math.min(3, Math.floor(Number(counts[method]) || 1)));
  }

  function typeFor(kind,index){ return kind + (index === 1 ? '' : index); }
  function key(method,type){ return method + '_' + type; }

  function item(method,type){
    return readJSON(DATA_KEY, {})[key(method,type)] || {};
  }

  function qty(method,type){ return Math.max(0, Math.floor(Number(item(method,type).qty) || 0)); }
  function va(method,type){ return Math.max(0, Number(item(method,type).va) || 0); }
  function total(method,type){ return qty(method,type) * va(method,type); }

  function managedQty(method,type){
    const q = qty(method,type);
    const raw = readJSON(MANAGED_KEY, {})[key(method,type)];
    const n = raw === true ? q : Math.floor(Number(raw) || 0);
    return Math.max(0, Math.min(q,n));
  }

  function remaining(method,type){
    return Math.max(qty(method,type) - managedQty(method,type),0) * va(method,type);
  }

  function aggregate(method,kind,generator){
    let value = 0;
    for(let i=1;i<=count(method);i++){
      value += (generator ? remaining : total)(method,typeFor(kind,i));
    }
    return value;
  }

  function heatFactor(method){
    if(method !== 'separate40') return 0.65;
    let units = 0;
    for(let i=1;i<=count(method);i++) units += qty(method,typeFor('heat',i));
    return units >= 4 ? 0.40 : 0.65;
  }

  function hpAnswer(index){
    const answers = readJSON(HP_SYSTEM_KEY, {});
    return answers[String(index)] || '';
  }

  function heatPumpResult(generator){
    let result = {total:0,c:0,h:0};
    for(let i=1;i<=count('heatpump');i++){
      const ac = typeFor('ac',i);
      const heat = typeFor('heat',i);
      const serviceC = total('heatpump',ac);
      const serviceH = total('heatpump',heat) * 0.65;
      const c = (generator ? remaining : total)('heatpump',ac);
      const h = (generator ? remaining : total)('heatpump',heat) * 0.65;
      const answer = hpAnswer(i);

      if(answer === 'yes'){
        result.total += c + h;
        result.c += c;
        result.h += h;
      } else if(answer === 'no'){
        if(serviceC >= serviceH){
          result.total += c;
          result.c += c;
        } else {
          result.total += h;
          result.h += h;
        }
      }
    }
    return result;
  }

  function normalResult(method,generator){
    const factor = heatFactor(method);
    const serviceC = aggregate(method,'ac',false);
    const serviceH = aggregate(method,'heat',false) * factor;
    const c = aggregate(method,'ac',generator);
    const h = aggregate(method,'heat',generator) * factor;

    return serviceC >= serviceH
      ? {total:c,c:c,h:0}
      : {total:h,c:0,h:h};
  }

  window.hvacLoadCalculation = function(){
    original();

    let service = 0, generator = 0;
    let serviceAC = 0, generatorAC = 0;
    let serviceHeating = 0, generatorHeating = 0;

    selected().forEach(method => {
      let s, g;
      if(method === 'heatpump'){
        s = heatPumpResult(false);
        g = heatPumpResult(true);
      } else {
        s = normalResult(method,false);
        g = normalResult(method,true);
      }
      service += s.total;
      generator += g.total;
      serviceAC += s.c;
      generatorAC += g.c;
      serviceHeating += s.h;
      generatorHeating += g.h;
    });

    if(typeof setOutput === 'function'){
      setOutput('e37',serviceAC);
      setOutput('e38',serviceHeating);
      setOutput('f37',generatorAC);
      setOutput('f38',generatorHeating);
    }

    return {
      service,
      generator,
      serviceAC,
      generatorAC,
      serviceHeating,
      generatorHeating,
      method:selected().join(','),
      multipleHeatTypes:selected().length > 1
    };
  };
})();

/* Staging hotfix: keep each heat-pump system's Yes/No choice independent. */
(function(){
  'use strict';

  const HP_SYSTEM_KEY = 'loadcalcpro_hvac_heatpump_answers_v543';
  const LEGACY_HP_KEY = 'loadcalcpro_hvac_multi_hp_answer_v1';

  function readAnswers(){
    try{
      const value = JSON.parse(localStorage.getItem(HP_SYSTEM_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    }catch(e){
      return {};
    }
  }

  function writeAnswers(value){
    try{
      localStorage.setItem(HP_SYSTEM_KEY, JSON.stringify(value));
      /* Keep older global-answer code permissive; the per-system map remains authoritative. */
      localStorage.setItem(LEGACY_HP_KEY, 'yes');
    }catch(e){}
  }

  function refreshQuestion(index){
    const answers = readAnswers();
    const current = answers[String(index)] || '';
    document.querySelectorAll('.v543-hp-option[data-v543-hp-index="' + index + '"]').forEach(function(button){
      const chosen = button.dataset.v543HpAnswer === current;
      button.classList.toggle('selected', chosen);
      const mark = button.querySelector('.v543-hp-check');
      if(mark) mark.textContent = chosen ? '✓' : '';
    });
  }

  document.addEventListener('click', function(event){
    const button = event.target.closest('.v543-hp-option');
    if(!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const index = String(button.dataset.v543HpIndex || '');
    const answer = String(button.dataset.v543HpAnswer || '');
    if(!index || (answer !== 'yes' && answer !== 'no')) return;

    const answers = readAnswers();
    if(answers[index] === answer){
      delete answers[index];
    }else{
      answers[index] = answer;
    }

    writeAnswers(answers);
    refreshQuestion(index);

    if(typeof calculate === 'function'){
      calculate();
    }
  }, true);
})();

/* Staging layout refinement: keep the fixed Service/Generator result boxes symmetrical. */
(function(){
  'use strict';

  function makeRow(label, valueNode, suffix){
    const row = document.createElement('div');
    row.className = 'calculation-summary-row';

    const labelNode = document.createElement('span');
    labelNode.textContent = label;

    const valueWrap = document.createElement('span');
    valueWrap.appendChild(valueNode);
    if(suffix){
      valueWrap.appendChild(document.createTextNode(suffix));
    }

    row.appendChild(labelNode);
    row.appendChild(valueWrap);
    return row;
  }

  function syncSummaryValues(){
    const serviceSource = document.getElementById('serviceTotalVAView');
    const generatorSource = document.getElementById('generatorTotalVAView');
    const serviceTarget = document.getElementById('calcSummaryServiceVA');
    const generatorTarget = document.getElementById('calcSummaryGeneratorVA');

    if(serviceSource && serviceTarget){
      serviceTarget.textContent = serviceSource.textContent || '0';
    }
    if(generatorSource && generatorTarget){
      generatorTarget.textContent = generatorSource.textContent || '0';
    }
  }

  function watch(source){
    if(!source) return;
    new MutationObserver(syncSummaryValues).observe(source,{
      childList:true,
      characterData:true,
      subtree:true
    });
  }

  function init(){
    if(document.getElementById('calculationFinalSummary')) return;

    const q42 = document.getElementById('q42');
    const additionalRow = q42 ? q42.closest('.load-row') : null;
    const managedCount = document.getElementById('bottomManagedLoadCount');
    const generatorVA = document.getElementById('generatorTotalVAView');
    const generatorLine = generatorVA ? generatorVA.closest('.total-managed-line') : null;

    if(!additionalRow || !managedCount || !generatorVA || !generatorLine) return;

    const summary = document.createElement('div');
    summary.id = 'calculationFinalSummary';
    summary.className = 'calculation-summary';
    summary.setAttribute('aria-label','Final calculation summary');

    const serviceValue = document.createElement('span');
    serviceValue.id = 'calcSummaryServiceVA';
    serviceValue.textContent = '0';

    const generatorValue = document.createElement('span');
    generatorValue.id = 'calcSummaryGeneratorVA';
    generatorValue.textContent = '0';

    summary.appendChild(makeRow('Service Load:', serviceValue, ' VA'));
    summary.appendChild(makeRow('Generator Load:', generatorValue, ' VA'));
    summary.appendChild(makeRow('Managed Quantity:', managedCount, ''));

    additionalRow.insertAdjacentElement('afterend', summary);

    generatorLine.textContent = '';
    generatorLine.appendChild(generatorVA);
    generatorLine.appendChild(document.createTextNode(' VA'));

    syncSummaryValues();
    watch(document.getElementById('serviceTotalVAView'));
    watch(generatorVA);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
