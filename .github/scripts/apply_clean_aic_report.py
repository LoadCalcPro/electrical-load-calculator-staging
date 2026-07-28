from pathlib import Path
import re

path = Path("aic_calculator.html")
text = path.read_text(encoding="utf-8")

css = r'''

/* Compact AIC screen and four-panel print report */
.result { display:none!important; }
.formula { background:transparent!important; border:0!important; padding:0!important; }
.formula-report-panel { background:transparent!important; border:0!important; border-radius:0!important; padding:8px 0!important; }
.formula-report { border-top:1px solid #d7e0e8; border-bottom:1px solid #d7e0e8; padding:8px 0; }
.formula-report-line.aic-final { font-weight:700; }

@media print {
  @page { size:letter; margin:.25in; }
  html, body { background:#fff!important; }
  body { zoom:1!important; }
  .page { margin:0!important; padding:0!important; max-width:none!important; }
  .form-titlebar { display:none!important; }
  #calculationsContainer { display:block!important; }
  #calculationsContainer > .card {
    border:0!important;
    border-radius:0!important;
    box-shadow:none!important;
    padding:0!important;
    margin:0 0 .12in 0!important;
    break-inside:avoid!important;
    page-break-inside:avoid!important;
  }
  #calculationsContainer > .card > :not(.clean-print-report) { display:none!important; }
  .clean-print-report {
    display:block!important;
    color:#111827;
    font-family:Arial,Helvetica,sans-serif;
    border-bottom:1px solid #94a3b8;
    padding:0 0 .10in 0;
  }
  .print-report-panel {
    font-size:10px!important;
    font-weight:800!important;
    margin:0 0 5px!important;
    color:#0f172a!important;
  }
  .compact-report-grid {
    display:grid;
    grid-template-columns:1.25fr 1fr;
    gap:12px;
    align-items:start;
  }
  .print-report-section { margin:0!important; }
  .print-report-section h3 {
    font-size:8px!important;
    margin:0 0 3px!important;
    color:#1e3a8a!important;
    text-transform:uppercase;
    letter-spacing:.04em;
  }
  .print-report-row {
    display:grid!important;
    grid-template-columns:112px 1fr!important;
    gap:6px!important;
    font-size:7.5px!important;
    line-height:1.35!important;
  }
  .print-report-label { font-weight:700!important; }
  .compact-formula-row {
    display:grid;
    grid-template-columns:24px 10px 1fr auto;
    gap:3px;
    align-items:baseline;
    font-family:Consolas,Monaco,monospace;
    font-size:7.5px;
    line-height:1.45;
  }
  .compact-formula-value { font-weight:700; white-space:nowrap; }
  .print-report-brand,
  .print-report-title,
  .print-report-final { display:none!important; }
}
'''

if "/* Compact AIC screen and four-panel print report */" not in text:
    text = text.replace("</style>", css + "\n</style>", 1)

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
      <div class="compact-report-grid">
        <section class="print-report-section">
          <h3>Input Summary</h3>
          <div class="print-report-row"><span class="print-report-label">Utility Fault Current</span><span>${reportNumber('utilityFault', n, ' A')}</span></div>
          <div class="print-report-row"><span class="print-report-label">Distance</span><span>${reportNumber('distance', n, ' ft')}</span></div>
          <div class="print-report-row"><span class="print-report-label">Conduit Type</span><span>${conduitText(n)}</span></div>
          <div class="print-report-row"><span class="print-report-label">Wire Type</span><span>${selectedText('wireType', n)}</span></div>
          <div class="print-report-row"><span class="print-report-label">Wire Size</span><span>${selectedText('wireSize', n)}</span></div>
          <div class="print-report-row"><span class="print-report-label">C Constant</span><span>${Number.isFinite(C) ? fmt(C,0) : '—'}</span></div>
          <div class="print-report-row"><span class="print-report-label">Conductors per Phase</span><span>${reportNumber('conductors', n)}</span></div>
          <div class="print-report-row"><span class="print-report-label">Voltage</span><span>${reportNumber('volts', n, ' V')}</span></div>
          <div class="print-report-row"><span class="print-report-label">Phase</span><span>${phaseLabel}</span></div>
        </section>
        <section class="print-report-section">
          <h3>Formulas and Values</h3>
          <div class="compact-formula-row"><span>F</span><span>=</span><span>${phaseFactor} × L × I ÷ (N × C × V)</span><span class="compact-formula-value">${Number.isFinite(F) ? F.toFixed(4) : '—'}</span></div>
          <div class="compact-formula-row"><span>M</span><span>=</span><span>1 ÷ (1 + F)</span><span class="compact-formula-value">${Number.isFinite(M) ? M.toFixed(4) : '—'}</span></div>
          <div class="compact-formula-row"><span>AIC</span><span>=</span><span>I × M</span><span class="compact-formula-value">${Number.isFinite(AIC) ? `${fmt(AIC,0)} AMPS` : '—'}</span></div>
        </section>
      </div>`;
  });
}'''

text = re.sub(
    r"function buildCleanPrintReports\(\) \{.*?\n\}",
    new_builder,
    text,
    count=1,
    flags=re.S,
)

path.write_text(text, encoding="utf-8")
