/* LoadCalcPro staging hotfix: keep each heat-pump system Yes/No answer independent. */
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
      /* Older HVAC code still reads one global answer. Keep it permissive so it cannot overwrite per-system selections. */
      localStorage.setItem(LEGACY_HP_KEY, 'yes');
    }catch(e){}
  }

  function refreshQuestion(index){
    const answers = readAnswers();
    const current = answers[String(index)] || '';
    document.querySelectorAll('.v543-hp-option[data-v543-hp-index="' + index + '"]').forEach(function(button){
      const selected = button.dataset.v543HpAnswer === current;
      button.classList.toggle('selected', selected);
      const mark = button.querySelector('.v543-hp-check');
      if(mark) mark.textContent = selected ? '✓' : '';
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

    if(typeof window.calculate === 'function'){
      window.calculate();
    }else if(typeof calculate === 'function'){
      calculate();
    }
  }, true);
})();
