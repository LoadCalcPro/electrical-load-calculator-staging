from pathlib import Path
import re

path = Path('aic_calculator.html')
text = path.read_text(encoding='utf-8')

pair_re = re.compile(
    r'(?P<pair><label\s+for="(?P<for>[^"]+)">(?P<label>.*?)</label>\s*'
    r'(?:<select\s+id="[^"]+"[^>]*>.*?</select>|<input\s+id="[^"]+"[^>]*>))',
    re.DOTALL,
)

def base_name(value: str) -> str:
    return re.sub(r'\d+$', '', value)

order = ['utilityFault', 'conduit', 'wireType', 'wireSize', 'distance', 'volts', 'conductors', 'phase']

def reorder_grid(match: re.Match) -> str:
    opening, body, closing = match.group(1), match.group(2), match.group(3)
    pairs = list(pair_re.finditer(body))
    if len(pairs) < 8:
        return match.group(0)

    by_key = {base_name(p.group('for')): p.group('pair') for p in pairs}
    if not all(key in by_key for key in order):
        return match.group(0)

    by_key['volts'] = re.sub(r'>E\s*=\s*(?:Volts|Voltage)<', '>E = Voltage<', by_key['volts'])
    by_key['conductors'] = re.sub(
        r'>N\s*=\s*Number of conductors per phase<',
        '>N = Number of Conductors per Phase<',
        by_key['conductors'],
        flags=re.IGNORECASE,
    )
    by_key['distance'] = re.sub(
        r'>L\s*=\s*Distance to transformer<',
        '>L = Distance to Transformer<',
        by_key['distance'],
        flags=re.IGNORECASE,
    )

    start = pairs[0].start()
    end = pairs[-1].end()
    indent_match = re.search(r'\n([ \t]*)<label', body[:pairs[0].end()])
    indent = indent_match.group(1) if indent_match else '            '
    reordered = ('\n' + indent).join(by_key[key] for key in order)
    new_body = body[:start] + reordered + body[end:]
    return opening + new_body + closing

# Reorder every AIC form grid, including dynamically generated downstream-panel templates.
grid_re = re.compile(r'(<div class="form-grid">)(.*?)(</div>)', re.DOTALL)
updated, count = grid_re.subn(reorder_grid, text)

if updated == text:
    raise SystemExit('No AIC form grids were changed; stopping to avoid an unintended commit.')

path.write_text(updated, encoding='utf-8')
print(f'Updated {count} form-grid block(s).')
