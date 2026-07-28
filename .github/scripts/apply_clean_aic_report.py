from pathlib import Path
import re

path = Path("aic_calculator.html")
text = path.read_text(encoding="utf-8")

css = r'''

/* AIC selectable print layouts */
.result { display:none!important; }
.formula { background:transparent!important; border:0!important; padding:0!important; }
.formula-report-panel { background:transparent!important; border:0!important; border-radius:0!important; padding:8px 0!important; }
.formula-report { border-top:1px solid #d7e0e8; border-bottom:1px solid #d7e0e8; padding:8px 0; }
.formula-report-line.aic-final { font-weight:700; }
.print-layout-control { display:flex; align-items:center; gap:6px; color:#334155; font-size:12px; font-weight:700; white-space:nowrap; }
.print-layout-control select { width:auto; min-width:112px; padding:7px 28px 7px 9px; border-radius:8px; font-size:13px; }
.print-pages { display:none; }

@media (max-width:700px) {
  .print-layout-control { grid-column:1/-1; width:100%; justify-content:space-between; }
  .print-layout-control select { flex:1; max-width:190px; min-height:42px; }
}

@media print {
  @page { size:letter portrait; margin:.25in; }
  html, body { background:#fff!important; }
  body { zoom:1!important; }
  body > :not(.print-pages) { display:none!important; }
  .print-pages { display:block!important; }
  .print-page {
    height:10.5in;
    display:grid;
    grid-template-rows:auto minmax(0,1fr);
    gap:.10in;
    overflow:hidden;
    break-after:page;
    page-break-after:always;
    color:#111827;
    font-family:Arial,Helvetica,sans-serif;
  }
  .print-page:last-child { break-after:auto; page-break-after:auto; }
  .print-page-header {
    padding:0 0 .07in;
    border-bottom:2px solid #1e3a8a;
  }
  .print-page-brand { font-size:18px; line-height:1.05; font-weight:800; color:#1e3a8a; }
  .print-page-brand .brand-x { color:#0f766e; }
  .print-page-title { margin-top:2px; font-size:11px; line-height:1.15; font-weight:700; color:#111827; }
  .print-page-grid {
    min-height:0;
    display:grid;
    gap:.10in;
    align-items:stretch;
  }
  .print-page[data-layout="1"] .print-page-grid { grid-template-columns:1fr; grid-template-rows:1fr; }
  .print-page[data-layout="2"] .print-page-grid { grid-template-columns:1fr; grid-template-rows:repeat(2,minmax(0,1fr)); }
  .print-page[data-layout="4"] .print-page-grid { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); }
  .print-page[data-layout="8"] .print-page-grid { grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(4,minmax(0,1fr)); gap:.07in; }
  .print-report-card {
    min-width:0;
    min-height:0;
    border:1px solid #64748b;
    border-radius:3px;
    padding:.09in .11in;
    overflow:hidden;
    break-inside:avoid;
    page-break-inside:avoid;
  }
  .clean-print-report {
    display:block!important;
    width:100%;
    min-width:0;
    height:100%;
    overflow:hidden;
  }
  .print-report-panel {
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-weight:800;
    margin:0 0 4px;
    padding:0 0 3px;
    border-bottom:1px solid #cbd5e1;
    color:#0f172a;
  }
  .print-report-section { margin:0; min-width:0; }
  .print-report-section + .print-report-section { margin-top:4px; padding-top:3px; border-top:1px solid #e2e8f0; }
  .print-report-section h3 {
    margin:0 0 2px;
    color:#1e3a8a;
    text-transform:uppercase;
    letter-spacing:.03em;
  }
  .print-report-row,
  .compact-formula-row {
    display:grid;
    grid-template-columns:minmax(0,1fr) minmax(72px,38%);
    column-gap:6px;
    align-items:baseline;
    width:100%;
    min-width:0;
  }
  .print-report-label,
  .compact-formula-label {
    min-width:0;
    overflow-wrap:anywhere;
    text-align:left;
    font-weight:700;
  }
  .print-report-value,
  .compact-formula-value {
    min-width:0;
    max-width:100%;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    text-align:right;
    justify-self:stretch;
    font-variant-numeric:tabular-nums;
  }
  .compact-formula-row { font-family:Consolas,Monaco,monospace; }
  .compact-formula-row.aic-final { margin-top:1px; font-weight:800; }

  .print-page[data-layout="1"] .print-report-card { padding:.18in .22in; }
  .print-page[data-layout="1"] .print-report-panel { font-size:14px; margin-bottom:10px; padding-bottom:7px; }
  .print-page[data-layout="1"] .print-report-section + .print-report-section { margin-top:12px; padding-top:9px; }
  .print-page[data-layout="1"] .print-report-section h3 { font-size:10px; margin-bottom:6px; }
  .print-page[data-layout="1"] .print-report-row,
  .print-page[data-layout="1"] .compact-formula-row { font-size:10.5px; line-height:1.7; grid-template-columns:minmax(0,1fr) 190px; }

  .print-page[data-layout="2"] .print-report-panel { font-size:11px; }
  .print-page[data-layout="2"] .print-report-section h3 { font-size:8.5px; }
  .print-page[data-layout="2"] .print-report-row,
  .print-page[data-layout="2"] .compact-formula-row { font-size:8.7px; line-height:1.42; grid-template-columns:minmax(0,1fr) 150px; }

  .print-page[data-layout="4"] .print-report-panel { font-size:9px; }
  .print-page[data-layout="4"] .print-report-section h3 { font-size:7px; }
  .print-page[data-layout="4"] .print-report-row,
  .print-page[data-layout="4"] .compact-formula-row { font-size:7.25px; line-height:1.3; }

  .print-page[data-layout="8"] .print-report-card { padding:.055in .075in; }
  .print-page[data-layout="8"] .print-report-panel { font-size:7.3px; margin-bottom:2px; padding-bottom:2px; }
  .print-page[data-layout="8"] .print-report-section + .print-report-section { margin-top:2px; padding-top:2px; }
  .print-page[data-layout="8"] .print-report-section h3 { font-size:5.8px; margin-bottom:1px; }
  .print-page[data-layout="8"] .print-report-row,
  .print-page[data-layout="8"] .compact-formula-row { font-size:5.8px; line-height:1.18; grid-template-columns:minmax(0,1fr) minmax(62px,38%); column-gap:4px; }
}
'''

marker_pattern = re.compile(
    r"\n/\* (?:Compact AIC screen and (?:four-panel print report|aligned boxed print report)|AIC selectable print layouts) \*/.*?(?=\n\s*</style>)",
    flags=re.S,
)
if marker_pattern.search(text):
    text = marker_pattern.sub(css.rstrip(), text, count=1)
else:
    text = text.replace("</style>", css + "\n</style>", 1)

# Add the print-layout selector immediately before the Print button.
text = re.sub(
    r'<button type="button" class="no-print" onclick="preparePrint\(\)">Print</button>',
    '<label class="no-print print-layout-control" for="printLayout">Print Layout '
    '<select id="printLayout" aria-label="Reports per printed page">'
    '<option value="1">1 per page</option>'
    '<option value="2">2 per page</option>'
    '<option value="4" selected>4 per page</option>'
    '<option value="8">8 per page</option>'
    '</select></label>'
    '<button type="button" class="no-print" onclick="preparePrint()">Print</button>',
    text,
    count=1,
)

# Keep the dormant original header wording consistent, although the new engine creates one header per page.
text = text.replace(
    'Available Fault Current Calculation Report',
    'Available Fault Current (AIC) Report',
)

new_builder = r'''function buildCleanPrintReports() {
  document.querySelectorAll('#calculationsContainer > .card').forEach((card, index) => {
    const n = index + 1;
    let report = card.querySelector('.clean-print-report');
    if (!report) {
      report = document.createElement('div');
      report.className = 'clean-print-report';
      card.appendChild(report);
    }

    const wire = constants[el('wireSize', n)?.value];
    const C = wire ? wire[constantKey(n)] : null;
    const L = readNumber('distance', n);
    const I = readNumber('utilityFault', n);
    const E = readNumber('volts', n);
    const N = readNumber('conductors', n);
    const phase = readNumber('phase', n);
    const valid = [L,I,E,N,phase,C].every(Number.isFinite) && E > 0 && N > 0 && phase > 0 && C > 0;
    const F = valid ? (phase * L * I) / (N * C * E) : NaN;
    const M = valid ? 1 / (1 + F) : NaN;
    const AIC = valid ? I * M : NaN;
    const phaseLabel = phaseText(n);
    const phaseFactor = phase === 2 ? '2' : phase === 1.732 ? '1.732' : '—';
    const headingNode = n === 1 ? document.getElementById('calculationName1') : el('calculationHeading', n);
    const panelName = printText(headingNode?.value, n === 1 ? 'Main Service' : `Downstream Panel ${n - 1}`);

    report.innerHTML = `
      <div class="print-report-panel">${panelName}</div>
      <section class="print-report-section">
        <h3>Input Summary</h3>
        <div class="print-report-row"><span class="print-report-label">Utility Fault Current</span><span class="print-report-value">${reportNumber('utilityFault', n, ' A')}</span></div>
        <div class="print-report-row"><span class="print-report-label">Distance</span><span class="print-report-value">${reportNumber('distance', n, ' ft')}</span></div>
        <div class="print-report-row"><span class="print-report-label">Conduit Type</span><span class="print-report-value">${conduitText(n)}</span></div>
        <div class="print-report-row"><span class="print-report-label">Wire Type</span><span class="print-report-value">${selectedText('wireType', n)}</span></div>
        <div class="print-report-row"><span class="print-report-label">Wire Size</span><span class="print-report-value">${selectedText('wireSize', n)}</span></div>
        <div class="print-report-row"><span class="print-report-label">C Constant</span><span class="print-report-value">${Number.isFinite(C) ? fmt(C,0) : '—'}</span></div>
        <div class="print-report-row"><span class="print-report-label">Conductors per Phase</span><span class="print-report-value">${reportNumber('conductors', n)}</span></div>
        <div class="print-report-row"><span class="print-report-label">Voltage</span><span class="print-report-value">${reportNumber('volts', n, ' V')}</span></div>
        <div class="print-report-row"><span class="print-report-label">Phase</span><span class="print-report-value">${phaseLabel}</span></div>
      </section>
      <section class="print-report-section">
        <h3>Formulas and Values</h3>
        <div class="compact-formula-row"><span class="compact-formula-label">F = ${phaseFactor} × L × I ÷ (N × C × V)</span><span class="compact-formula-value">${Number.isFinite(F) ? F.toFixed(4) : '—'}</span></div>
        <div class="compact-formula-row"><span class="compact-formula-label">M = 1 ÷ (1 + F)</span><span class="compact-formula-value">${Number.isFinite(M) ? M.toFixed(4) : '—'}</span></div>
        <div class="compact-formula-row aic-final"><span class="compact-formula-label">AIC = I × M</span><span class="compact-formula-value">${Number.isFinite(AIC) ? `${fmt(AIC,0)} AMPS` : '—'}</span></div>
      </section>`;
  });
}'''

text = re.sub(
    r"function buildCleanPrintReports\(\) \{.*?\n\}",
    new_builder,
    text,
    count=1,
    flags=re.S,
)

new_prepare = r'''const PRINT_LAYOUT_KEY = 'loadCalcProAicPrintLayout';

function selectedPrintLayout() {
  const select = document.getElementById('printLayout');
  const value = Number(select?.value || 4);
  return [1,2,4,8].includes(value) ? value : 4;
}

function restorePrintLayout() {
  const select = document.getElementById('printLayout');
  if (!select) return;
  const saved = Number(localStorage.getItem(PRINT_LAYOUT_KEY));
  if ([1,2,4,8].includes(saved)) select.value = String(saved);
  select.addEventListener('change', () => localStorage.setItem(PRINT_LAYOUT_KEY, select.value));
}

function removePrintPages() {
  document.getElementById('printPages')?.remove();
}

function createPrintPages(layout) {
  removePrintPages();
  const printableCards = Array.from(document.querySelectorAll('#calculationsContainer > .card'))
    .filter((card, index) => hasCalculationData(index + 1));

  if (!printableCards.length) return 0;

  const printPages = document.createElement('div');
  printPages.id = 'printPages';
  printPages.className = 'print-pages';

  for (let start = 0; start < printableCards.length; start += layout) {
    const page = document.createElement('section');
    page.className = 'print-page';
    page.dataset.layout = String(layout);
    page.innerHTML = `
      <header class="print-page-header">
        <div class="print-page-brand">⚡ LoadCalcPro<span class="brand-x">X</span></div>
        <div class="print-page-title">Available Fault Current (AIC) Report</div>
      </header>
      <div class="print-page-grid"></div>`;

    const grid = page.querySelector('.print-page-grid');
    printableCards.slice(start, start + layout).forEach(card => {
      const wrapper = document.createElement('article');
      wrapper.className = 'print-report-card';
      wrapper.appendChild(card.querySelector('.clean-print-report').cloneNode(true));
      grid.appendChild(wrapper);
    });
    printPages.appendChild(page);
  }

  document.body.appendChild(printPages);
  return printableCards.length;
}

function preparePrint() {
  buildCleanPrintReports();
  const layout = selectedPrintLayout();
  localStorage.setItem(PRINT_LAYOUT_KEY, String(layout));
  const reportCount = createPrintPages(layout);
  if (!reportCount) {
    alert('Enter calculation information before printing.');
    return;
  }
  window.print();
  setTimeout(removePrintPages, 500);
}'''

text = re.sub(
    r"function preparePrint\(\) \{.*?\n\}",
    new_prepare,
    text,
    count=1,
    flags=re.S,
)

# Restore the remembered layout during normal initialization.
if "restorePrintLayout();" not in text:
    text = text.replace(
        "  updatePanelControls();\n}",
        "  updatePanelControls();\n  restorePrintLayout();\n}",
        1,
    )

path.write_text(text, encoding="utf-8")
