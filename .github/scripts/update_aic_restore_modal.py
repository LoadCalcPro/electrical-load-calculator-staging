from pathlib import Path

path = Path("aic_calculator.html")
text = path.read_text(encoding="utf-8")

if 'id="restoreModal"' in text:
    print("Restore modal already present; no file change needed.")
    raise SystemExit(0)

css = r'''
    .restore-modal {
      position:fixed;
      inset:0;
      z-index:10000;
      display:none;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:rgba(15,23,42,.72);
      backdrop-filter:blur(3px);
    }
    .restore-modal.show { display:flex; }
    .restore-dialog {
      width:min(500px,100%);
      overflow:hidden;
      background:#fff;
      border:1px solid #dbe3ec;
      border-radius:16px;
      box-shadow:0 28px 80px rgba(15,23,42,.34);
    }
    .restore-dialog-header {
      padding:22px 24px 16px;
      border-bottom:1px solid #e5eaf0;
    }
    .restore-dialog-kicker {
      margin:0 0 7px;
      color:#0f766e;
      font-size:12px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .restore-dialog h2 {
      margin:0;
      color:#0f172a;
      font-size:22px;
      line-height:1.25;
    }
    .restore-dialog-body {
      padding:18px 24px 8px;
      color:#475569;
      font-size:15px;
      line-height:1.55;
    }
    .restore-dialog-body p { margin:0; }
    .restore-dialog-actions {
      display:grid;
      grid-template-columns:1fr;
      gap:10px;
      padding:18px 24px 24px;
    }
    .restore-dialog-actions button {
      width:100%;
      min-height:46px;
      border-radius:9px;
      font-size:14px;
    }
    .restore-dialog-actions .restore-secondary {
      background:#fff;
      color:#1e3a8a;
      border:1px solid #1e3a8a;
    }
    @media (max-width:520px) {
      .restore-modal { padding:16px; }
      .restore-dialog-header { padding:20px 20px 15px; }
      .restore-dialog-body { padding:16px 20px 6px; }
      .restore-dialog-actions { padding:16px 20px 20px; }
    }
    @media print { .restore-modal { display:none!important; } }
'''
text = text.replace("  </style>", css + "\n  </style>", 1)

modal = r'''
  <div class="restore-modal" id="restoreModal" role="dialog" aria-modal="true" aria-labelledby="restoreModalTitle" aria-describedby="restoreModalDescription">
    <div class="restore-dialog">
      <div class="restore-dialog-header">
        <p class="restore-dialog-kicker">Saved Work</p>
        <h2 id="restoreModalTitle">Previous Calculation Found</h2>
      </div>
      <div class="restore-dialog-body">
        <p id="restoreModalDescription">We found a previously saved calculation on this device. Would you like to continue it or start a new calculation?</p>
      </div>
      <div class="restore-dialog-actions">
        <button type="button" id="continuePreviousBtn">Continue Previous Calculation</button>
        <button type="button" id="startNewBtn" class="restore-secondary">Start a New Calculation</button>
      </div>
    </div>
  </div>

'''
text = text.replace('  <div class="page">', modal + '  <div class="page">', 1)

old = r'''function loadSavedValues() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const keep = confirm('Saved AIC information was found. Do you want to keep and restore the old information?');
    if (!keep) {
      localStorage.removeItem(storageKey);
      return;
    }

    const wantedCount = Math.min(Math.max(Number(saved.panelCount) || 2, 2), MAX_PANELS);
    while (panelCount() < wantedCount) addPanel(false);

    Object.entries(saved.values || {}).forEach(([id,value]) => {
      const node = document.getElementById(id);
      if (node) node.value = value;
    });

    for (let n = 2; n <= panelCount(); n++) {
      if (n === 2) {
        el('utilityFault',2).dataset.userEdited =
          String((saved.values || {})['utilityFault2'] || '').trim() !== '' ? 'true' : 'false';
      } else {
        el('utilityFault',n).dataset.userEdited = 'true';
      }
    }
  } catch {
    localStorage.removeItem(storageKey);
  }
}
'''

new = r'''let pendingSavedAicData = null;

function hasMeaningfulSavedValues(saved) {
  if (!saved || !saved.values || typeof saved.values !== 'object') return false;
  return Object.entries(saved.values).some(([id, value]) => {
    if (id === 'utilityFault2') return false;
    return String(value || '').trim() !== '';
  });
}

function applySavedValues(saved) {
  const wantedCount = Math.min(Math.max(Number(saved.panelCount) || 2, 2), MAX_PANELS);
  while (panelCount() < wantedCount) addPanel(false);

  Object.entries(saved.values || {}).forEach(([id,value]) => {
    const node = document.getElementById(id);
    if (node) node.value = value;
  });

  for (let n = 2; n <= panelCount(); n++) {
    if (n === 2) {
      el('utilityFault',2).dataset.userEdited =
        String((saved.values || {})['utilityFault2'] || '').trim() !== '' ? 'true' : 'false';
    } else {
      el('utilityFault',n).dataset.userEdited = 'true';
    }
  }

  updateAllSelectPlaceholders();
  for (let n = 1; n <= panelCount(); n++) calculate(n);
  updatePanelControls();
}

function hideRestoreModal() {
  document.getElementById('restoreModal').classList.remove('show');
}

function loadSavedValues() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (!hasMeaningfulSavedValues(saved)) {
      localStorage.removeItem(storageKey);
      return;
    }

    pendingSavedAicData = saved;
    document.getElementById('restoreModal').classList.add('show');
    document.getElementById('continuePreviousBtn').focus();
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function continuePreviousCalculation() {
  const saved = pendingSavedAicData;
  pendingSavedAicData = null;
  hideRestoreModal();
  if (saved) applySavedValues(saved);
}

function startNewCalculation() {
  pendingSavedAicData = null;
  localStorage.removeItem(storageKey);
  hideRestoreModal();
}
'''

if old not in text:
    raise SystemExit("Expected loadSavedValues block was not found; no changes committed.")
text = text.replace(old, new, 1)

needle = "  document.getElementById('removePanelBtn').addEventListener('click', removeLastPanel);\n  updatePanelControls();"
replacement = "  document.getElementById('removePanelBtn').addEventListener('click', removeLastPanel);\n  document.getElementById('continuePreviousBtn').addEventListener('click', continuePreviousCalculation);\n  document.getElementById('startNewBtn').addEventListener('click', startNewCalculation);\n  updatePanelControls();"
if needle not in text:
    raise SystemExit("Expected initialize block was not found; no changes committed.")
text = text.replace(needle, replacement, 1)

path.write_text(text, encoding="utf-8")
print("Updated staging AIC restore modal.")
