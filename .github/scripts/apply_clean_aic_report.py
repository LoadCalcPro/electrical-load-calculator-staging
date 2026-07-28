from pathlib import Path
import re

path = Path("aic_calculator.html")
text = path.read_text(encoding="utf-8")

# Keep exactly one print-layout selector, using the calculator's existing controls.
text = re.sub(
    r'<label class="no-print print-layout-control" for="printLayout">.*?</label>',
    '',
    text,
    flags=re.S,
)

print_button = '<button type="button" class="no-print" onclick="preparePrint()">Print</button>'
layout_control = (
    '<label class="no-print print-layout-control" for="printLayout">Print Layout '
    '<select id="printLayout" aria-label="Reports per printed page">'
    '<option value="1">1 per page</option>'
    '<option value="2">2 per page</option>'
    '<option value="4" selected>4 per page</option>'
    '<option value="8">8 per page</option>'
    '</select></label>'
)
text = text.replace(print_button, layout_control + print_button, 1)

# Preserve the established header; only prevent the title/actions from being squeezed.
screen_fix = r'''

/* AIC print control header fix */
.form-titlebar { grid-template-columns:minmax(230px,1fr) auto; }
.form-title { white-space:nowrap; }
.title-actions { flex-wrap:wrap; justify-content:flex-end; }
.print-layout-control { display:flex; align-items:center; gap:6px; color:#334155; font-size:12px; font-weight:700; white-space:nowrap; }
.print-layout-control select { width:auto; min-width:112px; padding:7px 28px 7px 9px; border-radius:8px; font-size:13px; }
@media (max-width:850px) {
  .form-titlebar { grid-template-columns:1fr; }
  .form-title { white-space:normal; }
  .title-actions { justify-content:flex-start; }
}
'''
text = re.sub(
    r'\n/\* AIC print control header fix \*/.*?(?=\n\s*</style>)',
    screen_fix.rstrip(),
    text,
    count=1,
    flags=re.S,
)
if '/* AIC print control header fix */' not in text:
    text = text.replace('</style>', screen_fix + '\n</style>', 1)

text = text.replace('Available Fault Current Calculation Report', 'Available Fault Current (AIC) Report')

layout_js = r'''const PRINT_LAYOUT_KEY = 'loadCalcProAicPrintLayout';

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
'''

text = re.sub(
    r"\nconst PRINT_LAYOUT_KEY = 'loadCalcProAicPrintLayout';.*?(?=\nfunction preparePrint\(\))",
    '\n' + layout_js.rstrip() + '\n',
    text,
    count=1,
    flags=re.S,
)

initialize_match = re.search(r'function initialize\(\) \{.*?\n\}', text, flags=re.S)
if initialize_match:
    initialize_block = initialize_match.group(0)
    initialize_block = initialize_block.replace('\n  restorePrintLayout();', '')
    initialize_block = initialize_block.replace(
        '\n  updatePanelControls();',
        '\n  restorePrintLayout();\n  updatePanelControls();',
        1,
    )
    text = text[:initialize_match.start()] + initialize_block + text[initialize_match.end():]

path.write_text(text, encoding="utf-8")
