(function(){
  'use strict';

  const frame=document.getElementById('aicFrame');
  const layout=document.getElementById('outerPrintLayout');
  const printType=document.getElementById('outerPrintType');
  const STORAGE_KEY='loadCalcProAicCalculatorExpandablePanels';
  if(!frame||!layout||!printType)return;

  function innerDoc(){try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}}
  function innerWin(){try{return frame.contentWindow}catch(e){return null}}
  function cards(){const d=innerDoc();return d?Array.from(d.querySelectorAll('#calculationsContainer > .card')):[]}

  function savedPanelCount(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      const count=Number(saved&&saved.panelCount);
      return Number.isFinite(count)&&count>0?count:1;
    }catch(e){return 1}
  }

  function ensureOneInitialPanel(){
    if(savedPanelCount()>1)return;
    const d=innerDoc(),w=innerWin();
    if(!d||!w)return;
    const current=cards();
    while(current.length>1)current.pop().remove();
    try{if(typeof w.updatePanelControls==='function')w.updatePanelControls()}catch(e){}
  }

  function installTrialNavigation(){
    const button=document.getElementById('calculatorsBtn');
    if(!button)return;
    button.onclick=function(){
      const trialEmail=localStorage.getItem('loadcalcproTrialEmail');
      const trialCode=localStorage.getItem('loadcalcproTrialCode');
      location.href='../staging-member-dashboard.html';
    };
  }

  function clampOuterScroll(){
    const top=frame.getBoundingClientRect().top+window.scrollY;
    const bottom=top+frame.offsetHeight;
    const maxScroll=Math.max(0,bottom-window.innerHeight+12);
    if(window.scrollY>maxScroll)window.scrollTo({top:maxScroll,left:0,behavior:'auto'});
  }

  function resizeTight(clamp=false){
    const d=innerDoc();
    if(!d)return;
    frame.style.height='1px';
    requestAnimationFrame(()=>{
      const b=d.body,h=d.documentElement;
      const height=Math.max(b?b.scrollHeight:0,b?b.offsetHeight:0,h?h.scrollHeight:0,h?h.offsetHeight:0,1);
      frame.style.height=(height+4)+'px';
      if(clamp)requestAnimationFrame(clampOuterScroll);
    });
  }

  function installPrintStyles(d){
    let style=d.getElementById('drawingReadyAicPrintStyles');
    if(!style){style=d.createElement('style');style.id='drawingReadyAicPrintStyles';d.head.appendChild(style)}
    style.textContent=`
      @media print{
        .drawing-calculation-title{display:block!important;margin:0 0 7px!important;padding:0 0 5px!important;border-bottom:1px solid #777!important;font:800 11px/1.2 Arial,Helvetica,sans-serif!important;letter-spacing:.02em!important;text-transform:uppercase!important;color:#111!important}
        .print-page-header{display:block!important;border-bottom:1px solid #555!important;padding:0 0 8px!important;margin:0 0 10px!important}
        .print-page-brand{font:800 18px/1.1 Arial,Helvetica,sans-serif!important;color:#173b7a!important;margin:0 0 3px!important}
        .print-page-brand .brand-pro,.print-page-brand .brand-x{color:#0f766e!important}
        .print-page-title{font:800 12px/1.2 Arial,Helvetica,sans-serif!important;color:#111!important;margin:0!important}
        body.aic-calculation-only .print-page-header,
        body.aic-calculation-only .print-report-header,
        .print-page.calculation-only .print-page-header{display:none!important}
        body.aic-calculation-only .print-page{padding-top:0!important}
        .print-page.calculation-only .print-report-card{border:1px solid #777!important}
      }
    `;
  }

  function installMotorRowControls(d){
    let style=d.getElementById('aicMotorRowControlStyles');
    if(!style){style=d.createElement('style');style.id='aicMotorRowControlStyles';d.head.appendChild(style)}
    style.textContent='@media screen{.motor-rows .motor-row:first-child .motor-remove-row{display:none!important}.motor-rows .motor-row:first-child .motor-row-actions{display:none!important}}';
  }

  function identifyCalculationBlocks(d,generic){
    d.querySelectorAll('#printPages .print-page-header').forEach(header=>{
      const brand=header.querySelector('.print-page-brand');
      const title=header.querySelector('.print-page-title');
      if(brand)brand.innerHTML='<span>LoadCalc</span><span class="brand-pro">Pro</span> <span class="brand-x">X</span>';
      if(title)title.textContent='Available Fault Current Calculator';
    });
    d.querySelectorAll('#printPages .print-report-card').forEach(card=>{
      const report=card.querySelector('.clean-print-report');
      if(report&&!report.querySelector('.drawing-calculation-title')){
        const title=d.createElement('div');
        title.className='drawing-calculation-title';
        title.textContent='Available Fault Current Calculation';
        report.insertBefore(title,report.firstChild);
      }
    });
    d.querySelectorAll('#printPages .print-page').forEach(page=>page.classList.toggle('calculation-only',generic));
    d.body.classList.toggle('aic-calculation-only',generic);
  }

  function clearPrintMode(){
    const d=innerDoc();
    if(!d)return;
    d.body.classList.remove('aic-calculation-only');
  }

  function installDrawingPrint(){
    const d=innerDoc(),w=innerWin();
    if(!d||!w)return;
    installPrintStyles(d);
    if(w.preparePrint&&w.preparePrint.__drawingReadyAic)return;

    const wrapped=function(){
      const mode=layout.value||'full';
      const generic=printType.value==='calculation';
      if(typeof w.buildCleanPrintReports==='function'&&typeof w.createPrintPages==='function'){
        w.buildCleanPrintReports();
        const count=w.createPrintPages(mode);
        if(!count){w.alert('Enter calculation information before printing.');return}
        identifyCalculationBlocks(d,generic);
        w.print();
        return;
      }
    };
    wrapped.__drawingReadyAic=true;
    w.preparePrint=wrapped;

    if(!w.__drawingReadyAfterPrint){
      w.__drawingReadyAfterPrint=true;
      w.addEventListener('afterprint',clearPrintMode);
    }
  }

  function installRemovalCollapse(){
    const d=innerDoc();
    if(!d||d.__aicPanelCollapseInstalled)return;
    d.__aicPanelCollapseInstalled=true;
    d.addEventListener('click',event=>{
      if(event.target.closest('#removePanelBtn')){
        setTimeout(()=>resizeTight(true),0);
        setTimeout(()=>resizeTight(true),80);
      }
    },true);
    const container=d.getElementById('calculationsContainer');
    if(container&&window.MutationObserver){
      new MutationObserver(()=>setTimeout(()=>resizeTight(false),0)).observe(container,{childList:true});
    }
  }

  function install(){
    const d=innerDoc();
    if(!d)return;
    installTrialNavigation();
    ensureOneInitialPanel();
    installMotorRowControls(d);
    installDrawingPrint();
    installRemovalCollapse();
    resizeTight(false);
  }

  frame.addEventListener('load',()=>{
    install();
    setTimeout(install,150);
    setTimeout(install,700);
    setTimeout(install,1000);
  });
  layout.addEventListener('change',()=>setTimeout(installDrawingPrint,0));
  printType.addEventListener('change',()=>setTimeout(installDrawingPrint,0));
  installTrialNavigation();
  try{if(innerDoc()?.readyState==='complete')install()}catch(e){}
})();