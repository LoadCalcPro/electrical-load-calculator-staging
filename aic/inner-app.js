const constants = {
  "8": { copperMetallic:1557, copperPvc:1559, aluminumMetallic:951, aluminumPvc:952 },
  "6": { copperMetallic:2425, copperPvc:2430, aluminumMetallic:1481, aluminumPvc:1482 },
  "4": { copperMetallic:3806, copperPvc:3826, aluminumMetallic:2346, aluminumPvc:2350 },
  "3": { copperMetallic:4774, copperPvc:4811, aluminumMetallic:2952, aluminumPvc:2961 },
  "2": { copperMetallic:5907, copperPvc:6044, aluminumMetallic:3713, aluminumPvc:3730 },
  "1": { copperMetallic:7293, copperPvc:7493, aluminumMetallic:4645, aluminumPvc:4678 },
  "1/0": { copperMetallic:8925, copperPvc:9317, aluminumMetallic:5777, aluminumPvc:5838 },
  "2/0": { copperMetallic:10755, copperPvc:11424, aluminumMetallic:7187, aluminumPvc:7301 },
  "3/0": { copperMetallic:12844, copperPvc:13923, aluminumMetallic:8826, aluminumPvc:9110 },
  "4/0": { copperMetallic:15082, copperPvc:16673, aluminumMetallic:10741, aluminumPvc:11174 },
  "250MCM": { copperMetallic:16483, copperPvc:18594, aluminumMetallic:12122, aluminumPvc:12862 },
  "300MCM": { copperMetallic:18177, copperPvc:20868, aluminumMetallic:13910, aluminumPvc:14923 },
  "350MCM": { copperMetallic:19704, copperPvc:22737, aluminumMetallic:15484, aluminumPvc:16813 },
  "400MCM": { copperMetallic:20566, copperPvc:24294, aluminumMetallic:16671, aluminumPvc:18506 },
  "500MCM": { copperMetallic:22185, copperPvc:26706, aluminumMetallic:18756, aluminumPvc:21391 },
  "600MCM": { copperMetallic:22965, copperPvc:28033, aluminumMetallic:20093, aluminumPvc:23451 },
  "750MCM": { copperMetallic:24137, copperPvc:29735, aluminumMetallic:21766, aluminumPvc:25976 },
  "1000MCM": { copperMetallic:25278, copperPvc:31491, aluminumMetallic:23478, aluminumPvc:28779 }
};

const MAX_PANELS = 7;
const storageKey = 'loadCalcProAicCalculatorExpandablePanels';
const defaults = {
  calculationHeading:'', conduit:'', wireType:'', wireSize:'',
  utilityFault:'', distance:'', volts:'', conductors:'', phase:''
};

function panelSuffix(n) { return n === 1 ? '' : String(n); }
function el(base, n) { return document.getElementById(base + panelSuffix(n)); }

function updateSelectPlaceholder(select) {
  if (!select) return;
  select.classList.toggle('placeholder', select.value === '');
}

function updateAllSelectPlaceholders() {
  document.querySelectorAll('select').forEach(updateSelectPlaceholder);
}

function readNumber(base, n) {
  const node = el(base, n);
  if (!node) return null;
  const value = String(node.value || '').trim().replace(/,/g, '').replace(/\s+/g, '');
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function fmt(n, digits=0) {
  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {maximumFractionDigits:digits, minimumFractionDigits:digits})
    : '—';
}

function constantKey(n) {
  const metal = el('wireType', n).value === 'Copper' ? 'copper' : 'aluminum';
  const raceway = el('conduit', n).value === 'Non-metallic' ? 'Pvc' : 'Metallic';
  return metal + raceway;
}

function clearAicResult(n, message='') {
  el('aicResult', n).textContent = '—';
  const details = el('calcDetails', n);
  if (message) {
    details.textContent = message;
    return;
  }
  const phaseNode = el('phase', n);
  const phaseFactor = phaseNode && phaseNode.value === '2' ? '2' : '1.732';
  details.innerHTML =
    '<div class="formula-report">' +
      '<div class="formula-report-panel">' +
        '<div class="formula-report-title">Formulas</div>' +
        '<div class="formula-report-line"><span>F</span><span>=</span><span>' + phaseFactor + ' × L × I ÷ (N × C × V)</span></div>' +
        '<div class="formula-report-line"><span>M</span><span>=</span><span>1 ÷ (1 + F)</span></div>' +
        '<div class="formula-report-line"><span>AIC</span><span>=</span><span>I × M</span></div>' +
      '</div>' +
      '<div class="formula-report-panel">' +
        '<div class="formula-report-title">Calculated Values</div>' +
        '<div class="formula-report-line"><span>F</span><span>=</span><span>—</span></div>' +
        '<div class="formula-report-line"><span>M</span><span>=</span><span>—</span></div>' +
        '<div class="formula-report-line aic-final"><span>AIC</span><span>=</span><span>—</span></div>' +
      '</div>' +
    '</div>';
}

function calculate(n) {
  const conduitNode = el('conduit', n);
  const wireTypeNode = el('wireType', n);
  const wireSizeNode = el('wireSize', n);
  const requiredSelectionsPresent =
    conduitNode && conduitNode.value !== '' &&
    wireTypeNode && wireTypeNode.value !== '' &&
    wireSizeNode && wireSizeNode.value !== '';

  const wire = requiredSelectionsPresent ? constants[wireSizeNode.value] : null;
  if (!wire) {
    el('cConstant', n).textContent = '—';
    clearAicResult(n);
    carryForward(n);
    return;
  }

  const C = wire[constantKey(n)];
  el('cConstant', n).textContent = fmt(C);

  const L = readNumber('distance', n);
  const I = readNumber('utilityFault', n);
  const E = readNumber('volts', n);
  const N = readNumber('conductors', n);
  const phase = readNumber('phase', n);

  if ([L,I,E,N,phase].some(v => v === null)) {
    clearAicResult(n);
    carryForward(n);
    return;
  }

  if ([L,I,E,N,phase,C].some(v => !Number.isFinite(v)) ||
      I < 0 || L < 0 || E <= 0 || N <= 0 || phase <= 0 || C <= 0) {
    clearAicResult(n, 'Please enter valid positive values.');
    carryForward(n);
    return;
  }

  const F = (phase * L * I) / (N * C * E);
  const M = 1 / (1 + F);
  const AIC = I * M;

  el('aicResult', n).textContent = fmt(AIC, 0);
  const phaseFactor = phase === 2 ? '2' : '1.732';
  el('calcDetails', n).innerHTML =
    '<div class="formula-report">' +
      '<div class="formula-report-panel">' +
        '<div class="formula-report-title">Formulas</div>' +
        '<div class="formula-report-line"><span>F</span><span>=</span><span>' + phaseFactor + ' × L × I ÷ (N × C × V)</span></div>' +
        '<div class="formula-report-line"><span>M</span><span>=</span><span>1 ÷ (1 + F)</span></div>' +
        '<div class="formula-report-line"><span>AIC</span><span>=</span><span>I × M</span></div>' +
      '</div>' +
      '<div class="formula-report-panel">' +
        '<div class="formula-report-title">Calculated Values</div>' +
        '<div class="formula-report-line"><span>F</span><span>=</span><span>' + F.toFixed(4) + '</span></div>' +
        '<div class="formula-report-line"><span>M</span><span>=</span><span>' + M.toFixed(4) + '</span></div>' +
        '<div class="formula-report-line aic-final"><span>AIC</span><span>=</span><span>' + fmt(AIC,0) + ' AMPS</span></div>' +
      '</div>' +
    '</div>';

  carryForward(n, AIC);
}

/* Downstream fault-current inputs are independent. Do not automatically
   carry the calculated AIC from the first calculation into panel 1. */
function carryForward() {}

function populateWireSizes(select) {
  select.innerHTML = '<option value="">Select wire size</option>' +
    Object.keys(constants).map(size => `<option value="${size}">${size}</option>`).join('');
}

function createPanel(n) {
  const section = document.createElement('section');
  section.className = 'card';
  section.dataset.calc = String(n);
  section.dataset.panelIndex = String(n);
  section.innerHTML = `
    <div class="panel-number">Downstream Panel ${n - 1}</div>
    <div class="calc-heading-row">
      <h2>A.I.C. Calculations</h2>
      <input id="calculationHeading${n}" class="calc-heading-input" type="text"
        placeholder="Enter panel number or description" aria-label="Panel calculation heading">
    </div>
    <div class="form-grid">
      <label for="utilityFault${n}">I = Fault Current</label>
      <input id="utilityFault${n}" type="text" inputmode="decimal"
        placeholder="Enter fault current">
      <label for="conduit${n}">Conduit type</label>
      <select id="conduit${n}"><option value="">Select conduit type</option><option>Non-metallic</option><option>Metallic</option></select>
      <label for="wireType${n}">Wire type</label>
      <select id="wireType${n}"><option value="">Select wire type</option><option>Copper</option><option>Aluminum</option></select>
      <label for="wireSize${n}">Wire size</label>
      <select id="wireSize${n}"></select>
      <label for="distance${n}">L = Distance to Panel</label>
      <input id="distance${n}" type="text" inputmode="decimal" placeholder="Enter distance to panel">
      <label for="volts${n}">E = Voltage</label>
      <select id="volts${n}"><option value="">Select volts</option><option>208</option><option>240</option><option>480</option><option>600</option></select>
      <label for="conductors${n}">N = Number of Conductors per Phase</label>
      <select id="conductors${n}"><option value="">Select number of conductors per phase</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
      <label for="phase${n}">Phase</label>
      <select id="phase${n}"><option value="">Select phase</option><option value="2">Single phase</option><option value="1.732">Three phase</option></select>
    </div>
    <div class="result">
      <div class="metric"><div class="label">C constant</div><div class="value" id="cConstant${n}">—</div></div>
      <div class="metric"><div class="label">AIC</div><div class="value" id="aicResult${n}">—</div></div>
    </div>
    <div class="formula" id="calcDetails${n}"></div>
    <div class="button-row"><button type="button" class="secondary reset-panel" data-reset="${n}">Reset</button></div>
  `;

  populateWireSizes(section.querySelector(`#wireSize${n}`));
  document.getElementById('calculationsContainer').appendChild(section);
  attachPanelEvents(n);
  calculate(n);
}

function attachPanelEvents(n) {
  const heading = n === 1 ? document.getElementById('calculationName1') : el('calculationHeading', n);
  [heading].filter(Boolean).forEach(node =>
    node.addEventListener('input', saveCurrentValues)
  );

  const fault = el('utilityFault', n);
  if (n > 1) {
    fault.addEventListener('input', () => {
      fault.dataset.userEdited = fault.value.trim() === '' ? 'false' : 'true';
    });
  }

  ['conduit','wireType','wireSize','utilityFault','distance','volts','conductors','phase'].forEach(base => {
    const node = el(base, n);
    ['input','change'].forEach(eventName => node.addEventListener(eventName, () => {
      updateSelectPlaceholder(node);
      calculate(n);
      saveCurrentValues();
    }));
  });

  const resetButton = n === 1 ? document.getElementById('resetBtn') : document.querySelector(`[data-reset="${n}"]`);
  resetButton.addEventListener('click', () => resetCalculator(n));
}

function resetCalculator(n) {
  if (n === 1) {
    document.getElementById('calculationName1').value = '';
  } else {
    el('calculationHeading', n).value = '';
  }

  ['conduit','wireType','wireSize','distance','volts','conductors','phase'].forEach(base => el(base,n).value = '');

  el('utilityFault',n).value = '';
  if (n > 1) el('utilityFault',n).dataset.userEdited = 'false';

  el('cConstant', n).textContent = '—';
  clearAicResult(n);
  updateAllSelectPlaceholders();
  carryForward(n);
  saveCurrentValues();
}

function panelCount() {
  return document.querySelectorAll('#calculationsContainer > .card').length;
}

function updatePanelControls() {
  const count = panelCount();
  document.getElementById('addPanelBtn').disabled = count >= MAX_PANELS;
  document.getElementById('removePanelBtn').disabled = count <= 2;
  const downstream = count - 1;
  document.getElementById('panelLimitNote').textContent =
    count >= MAX_PANELS
      ? 'Maximum of 6 downstream panels reached.'
      : `There ${downstream === 1 ? 'is' : 'are'} ${downstream} downstream panel${downstream === 1 ? '' : 's'}. You may add ${MAX_PANELS - count} more.`;
}

function addPanel(save=true) {
  const next = panelCount() + 1;
  if (next > MAX_PANELS) return;
  createPanel(next);

  el('utilityFault', next).value = '';
  el('utilityFault', next).dataset.userEdited = 'false';

  updateAllSelectPlaceholders();
  updatePanelControls();
  if (save) saveCurrentValues();
}

function removeLastPanel() {
  const count = panelCount();
  if (count <= 2) return;
  document.querySelector(`[data-panel-index="${count}"]`).remove();
  updatePanelControls();
  saveCurrentValues();
}

function hasCalculationData(n) {
  if (n === 1) {
    if (String(document.getElementById('calculationName1').value || '').trim() !== '') return true;
  } else {
    if (String(el('calculationHeading',n).value || '').trim() !== '') return true;
  }

  return ['utilityFault','conduit','wireType','wireSize','distance','volts','conductors','phase']
    .some(base => String(el(base,n).value || '').trim() !== '');
}

function printText(value, fallback='—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}
function selectedText(base, n) {
  const node = el(base, n);
  if (!node) return '—';
  const option = node.options && node.selectedIndex >= 0 ? node.options[node.selectedIndex] : null;
  return option ? printText(option.textContent) : printText(node.value);
}
function phaseText(n) {
  const value = printText(el('phase', n)?.value, '');
  if (value === '2') return 'Single Phase';
  if (value === '1.732') return 'Three Phase';
  return '—';
}
function conduitText(n) {
  const value = selectedText('conduit', n);
  if (value === 'PVC') return 'Non-metallic';
  if (value === 'Steel') return 'Metallic';
  return value;
}
function reportNumber(base, n, suffix='') {
  const value = readNumber(base, n);
  return Number.isFinite(value) ? `${fmt(value, 0)}${suffix}` : '—';
}
function buildCleanPrintReports() {
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
}

function removePrintPages() {
  document.getElementById('printPages')?.remove();
}

function saveCurrentValues() {
  const data = { panelCount: panelCount(), values: {} };
  document.querySelectorAll('#calculationsContainer input, #calculationsContainer select')
    .forEach(node => data.values[node.id] = node.value);
  localStorage.setItem(storageKey, JSON.stringify(data));
}

let pendingSavedAicData = null;
let savedCalculationPromptChecked = false;

function hasMeaningfulSavedValues(saved) {
  if (!saved || !saved.values || typeof saved.values !== 'object') return false;
  return Object.entries(saved.values).some(([, value]) =>
    String(value || '').trim() !== ''
  );
}

function applySavedValues(saved) {
  const wantedCount = Math.min(Math.max(Number(saved.panelCount) || 2, 2), MAX_PANELS);
  while (panelCount() < wantedCount) addPanel(false);

  Object.entries(saved.values || {}).forEach(([id,value]) => {
    const node = document.getElementById(id);
    if (node) node.value = value;
  });

  for (let n = 2; n <= panelCount(); n++) {
    const fault = el('utilityFault',n);
    if (fault) fault.dataset.userEdited = fault.value.trim() === '' ? 'false' : 'true';
  }

  updateAllSelectPlaceholders();
  for (let n = 1; n <= panelCount(); n++) calculate(n);
  updatePanelControls();
}

function hideRestoreModal() {
  document.getElementById('restoreModal').classList.remove('show');
}

function loadSavedValues() {
  if (savedCalculationPromptChecked) return;
  savedCalculationPromptChecked = true;

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

function initialize() {
  populateWireSizes(document.getElementById('wireSize'));
  attachPanelEvents(1);
  clearAicResult(1);

  addPanel(false);
  updateAllSelectPlaceholders();

  for (let n = 1; n <= panelCount(); n++) calculate(n);

  document.getElementById('addPanelBtn').addEventListener('click', () => addPanel(true));
  document.getElementById('removePanelBtn').addEventListener('click', removeLastPanel);
  document.getElementById('continuePreviousBtn').addEventListener('click', continuePreviousCalculation);
  document.getElementById('startNewBtn').addEventListener('click', startNewCalculation);
  updatePanelControls();
}

initialize();

const ACCESS_API_URL = 'https://loadcalcpro-hcml-api-staging.onrender.com/api/access';
const ACCESS_SESSION_KEY = 'loadCalcProAicAccessApproved';
const REMEMBERED_EMAIL_KEY = 'loadCalcProRememberedMemberEmail';
const DASHBOARD_URL = 'staging-member-dashboard.html';
const SUPABASE_URL = 'https://jvnkncpljuaeycwjyeai.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aMerqRsuagFjUU67WWmspA_2uDtn4CF';
const API_BASE_URL = 'https://loadcalcpro-hcml-api-staging.onrender.com';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

async function verifyDashboardSessionAccess(token) {
  const response = await fetch(API_BASE_URL + '/api/v2/access', {
    method: 'POST',
    headers: {'Content-Type':'application/json', Authorization:'Bearer ' + token},
    body: JSON.stringify({calculator:'aic'})
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return {ok:response.ok && data.active === true, data};
}

function showCalculator() {
  document.getElementById('accessGate').hidden = true;
  document.body.classList.remove('access-locked');
  requestAnimationFrame(loadSavedValues);
}

function showAccessGate(message='') {
  document.getElementById('accessGate').hidden = false;
  document.body.classList.add('access-locked');
  const messageNode = document.getElementById('accessMessage');
  messageNode.classList.remove('success');
  messageNode.textContent = message;
}

async function verifyMemberAccess(email) {
  const response = await fetch(ACCESS_API_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      email,
      calculator: "aic"
    })
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error('The access server returned an unreadable response.');
  }

  if (!response.ok || data.active !== true) {
    throw new Error(data.message || 'No active membership was found for this email.');
  }

  return data;
}

document.getElementById('accessForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const emailNode = document.getElementById('accessEmail');
  const button = document.getElementById('accessButton');
  const messageNode = document.getElementById('accessMessage');
  const email = emailNode.value.trim().toLowerCase();

  if (!email) {
    messageNode.textContent = 'Please enter your membership email.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Checking Access...';
  messageNode.textContent = '';

  try {
    await verifyMemberAccess(email);
    sessionStorage.setItem(ACCESS_SESSION_KEY, 'true');

    if (document.getElementById('rememberEmail').checked) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
    messageNode.textContent = 'Access approved.';
    messageNode.classList.add('success');
    showCalculator();
  } catch (error) {
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
    messageNode.classList.remove('success');
    messageNode.textContent =
      error instanceof TypeError
        ? 'Unable to reach the access server. Please try again.'
        : error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Open Calculator';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem(ACCESS_SESSION_KEY);
  try { await supabaseClient.auth.signOut(); } catch {}

  const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
  document.getElementById('accessEmail').value = rememberedEmail;
  document.getElementById('rememberEmail').checked = rememberedEmail !== '';

  showAccessGate();
});

const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
if (rememberedEmail) {
  document.getElementById('accessEmail').value = rememberedEmail;
  document.getElementById('rememberEmail').checked = true;
}

(async function initializeAccess() {
  try {
    const {data} = await supabaseClient.auth.getSession();
    const session = data && data.session;
    if (session && session.access_token) {
      const result = await verifyDashboardSessionAccess(session.access_token);
      if (result.ok) {
        sessionStorage.setItem(ACCESS_SESSION_KEY, 'true');
        showCalculator();
        return;
      }
      sessionStorage.removeItem(ACCESS_SESSION_KEY);
      showAccessGate((result.data && result.data.message) || 'This membership does not include the AIC calculator.');
      return;
    }
  } catch (error) {
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
  }

  showAccessGate();
})();
