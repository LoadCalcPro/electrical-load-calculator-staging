from pathlib import Path
import re

path = Path("aic_calculator.html")
text = path.read_text(encoding="utf-8")

css = r'''

/* Compact AIC screen and aligned boxed print report */
.result { display:none!important; }
.formula { background:transparent!important; border:0!important; padding:0!important; }
.formula-report-panel { background:transparent!important; border:0!important; border-radius:0!important; padding:8px 0!important; }
.formula-report { border-top:1px solid #d7e0e8; border-bottom:1px solid #d7e0e8; padding:8px 0; }
.formula-report-line.aic-final { font-weight:700; }

@media print {
  @page { size:letter portrait; margin:.25in; }
  html, body { background:#fff!important; }
  body { zoom:1!important; }
  .page { margin:0!important; padding:0!important; max-width:none!important; }
  .form-titlebar { display:none!important; }
  #calculationsContainer {
    display:grid!important;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:.10in;
    align-items:stretch;
  }
  #calculationsContainer > .card {
    min-width:0!important;
    border:1px solid #64748b!important;
    border-radius:3px!important;
    box-shadow:none!important;
    padding:.09in .11in!important;
    margin:0!important;
    overflow:hidden!important;
    break-inside:avoid!important;
    page-break-inside:avoid!important;
  }
  #calculationsContainer > .card > :not(.clean-print-report) { display:none!important; }
  .clean-print-report {
    display:block!important;
    width:100%!important;
    min-width:0!important;
    overflow:hidden!important;
    color:#111827;
    font-family:Arial,Helvetica,sans-serif;
  }
  .print-report-panel {
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:9px!important;
    font-weight:800!important;
    margin:0 0 4px!important;
    padding:0 0 3px!important;
    border-bottom:1px solid #cbd5e1;
    color:#0f172a!important;
  }
  .print-report-section { margin:0!important; min-width:0!important; }
  .print-report-section + .print-report-section { margin-top:4px!important; padding-top:3px; border-top:1px solid #e2e8f0; }
  .print-report-section h3 {
    font-size:7px!important;
    margin:0 0 2px!important;
    color:#1e3a8a!important;
    text-transform:uppercase;
    letter-spacing:.03em;
  }
  .print-report-row,
  .compact-formula-row {
    display:grid!important;
    grid-template-columns:minmax(0,1fr) minmax(72px,38%)!important;
    column-gap:6px!important;
    align-items:baseline!important;
    width:100%!important;
    min-width:0!important;
    font-size:7.25px!important;
    line-height:1.3!important;
  }
  .print-report-label,
  .compact-formula-label {
    min-width:0!important;
    overflow-wrap:anywhere;
    text-align:left!important;
    font-weight:700!important;
  }
  .print-report-value,
  .compact-formula-value {
    min-width:0!important;
    max-width:100%!important;
    overflow:hidden!important;
    text-overflow:ellipsis;
    white-space:nowrap!important;
    text-align:right!important;
    justify-self:stretch!important;
    font-variant-numeric:tabular-nums;
  }
  .compact-formula-row {
    font-family:Consolas,Monaco,monospace;
  }
  .compact-formula-row.aic-final {
    margin-top:1px;
    font-weight:800;
  }
  .print-report-brand,
  .print-report-title,
  .print-report-final { display:none!important; }
  .no-print,button,.button-row,.panel-controls,.note,#accessGate,.restore-modal,.logout-button{display:none!important;}
}
'''

marker_pattern = re.compile(
    r"\n/\* Compact AIC screen and (?:four-panel print report|aligned boxed print report) \*/.*?(?=\n\s*</style>)",
    flags=re.S,
)
if marker_pattern.search(text):
    text = marker_pattern.sub(css.rstrip(), text, count=1)
else:
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

path.write_text(text, encoding="utf-8")
