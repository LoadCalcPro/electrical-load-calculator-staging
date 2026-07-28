from pathlib import Path
import re

path = Path('aic_calculator.html')
text = path.read_text(encoding='utf-8')

match = re.search(
    r"const PRINT_LAYOUT_KEY = 'loadCalcProAicPrintLayout';.*?(?=\nfunction saveCurrentValues\(\))",
    text,
    flags=re.S,
)
if not match:
    raise SystemExit('AIC print engine block was not found')

block = match.group(0)
prepare_end = re.search(r"function preparePrint\(\) \{.*?\n\}", block, flags=re.S)
if not prepare_end:
    raise SystemExit('preparePrint function was not found')

# The final occurrence is the complete engine. Keep only one copy.
all_starts = [m.start() for m in re.finditer(r"const PRINT_LAYOUT_KEY = 'loadCalcProAicPrintLayout';", block)]
engine_start = all_starts[-1]
engine = block[engine_start:]
text = text[:match.start()] + engine + '\n' + text[match.end():]

# Initialize the remembered selector exactly once during normal page startup.
text = text.replace('\n  restorePrintLayout();', '')
initialize_match = re.search(r"function initialize\(\) \{.*?\n\}", text, flags=re.S)
if not initialize_match:
    raise SystemExit('initialize function was not found')
initialize_block = initialize_match.group(0)
initialize_block = initialize_block[:-2] + "  restorePrintLayout();\n}"
text = text[:initialize_match.start()] + initialize_block + text[initialize_match.end():]

path.write_text(text, encoding='utf-8')
