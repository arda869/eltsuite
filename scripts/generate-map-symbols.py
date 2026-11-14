#!/usr/bin/env python3
"""Generate the map symbol data from the reviewed inventory and Lucide SVGs.

Pass a local lucide-static package directory as the first argument. The app
vendors converted path data, so it never fetches icons at runtime.
"""
import csv
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
from collections import Counter

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path('/tmp/elt-lucide-173/package')
icons = source / 'icons'
rows = [r for r in csv.DictReader((root / 'src/design/mapSymbolInventory.tsv').open(), delimiter='\t') if r['key'] and not r['key'].startswith('#')]
assert len(rows) >= 200, f'Only {len(rows)} symbols'
keys = [r['key'] for r in rows]
assert len(keys) == len(set(keys)), [k for k, n in Counter(keys).items() if n > 1]
assert len({r['glyph'] for r in rows}) == len(rows), 'Each symbol needs its own source artwork'
for r in rows:
    assert r['name'] and r['category'] and r['recognisable feature']
    assert r['glyph'].startswith(('lucide:', 'bespoke:'))
    if r['glyph'].startswith('lucide:'):
        assert (icons / (r['glyph'].split(':', 1)[1] + '.svg')).is_file(), r

# The category key and colour contract is shared by the picker and its search.
categories = {
    'nature': ('Nature and water', '#578d78'),
    'transport': ('Roads and transport', '#638596'),
    'buildings': ('Buildings and work', '#a77860'),
    'services': ('Facilities and services', '#a36b78'),
    'food': ('Food and drink', '#a57458'),
    'leisure': ('Parks and leisure', '#8b739d'),
    'education': ('Learning', '#887a56'),
    'wayfinding': ('Routes and signs', '#647a95'),
    'sports': ('Sports', '#7b8e60'),
    'heritage': ('Heritage and culture', '#966e7c'),
    'safety': ('Safety', '#b16b5e'),
}
assert {r['category'] for r in rows} == set(categories)

metadata = [
    '// Generated from mapSymbolInventory.tsv by scripts/generate-map-symbols.py.',
    "export const MAP_SYMBOL_INVENTORY = [",
]
for r in rows:
    metadata.append('  ' + json.dumps([r[k] for k in ('key', 'name', 'category', 'glyph', 'recognisable feature')], ensure_ascii=False) + ',')
metadata += ['] as const;', '']
(root / 'src/design/mapSymbolCatalog.ts').write_text('\n'.join(metadata))


def shape_to_path(e):
    tag = e.tag.rsplit('}', 1)[-1]
    a = e.attrib
    if tag == 'path':
        return a['d']
    if tag == 'line':
        return f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}"
    if tag in ('polyline', 'polygon'):
        coordinates = a['points'].replace(',', ' ').split()
        assert len(coordinates) % 2 == 0
        pairs = [' '.join(coordinates[i:i + 2]) for i in range(0, len(coordinates), 2)]
        return 'M' + 'L'.join(pairs) + ('Z' if tag == 'polygon' else '')
    if tag == 'circle':
        x, y, r = (float(a[k]) for k in ('cx', 'cy', 'r'))
        return f'M{x+r:g} {y:g}A{r:g} {r:g} 0 1 0 {x-r:g} {y:g}A{r:g} {r:g} 0 1 0 {x+r:g} {y:g}'
    if tag == 'rect':
        x, y, w, h = (float(a.get(k, 0)) for k in ('x', 'y', 'width', 'height'))
        r = float(a.get('rx', 0))
        if not r:
            return f'M{x:g} {y:g}h{w:g}v{h:g}h{-w:g}Z'
        return f'M{x+r:g} {y:g}H{x+w-r:g}Q{x+w:g} {y:g} {x+w:g} {y+r:g}V{y+h-r:g}Q{x+w:g} {y+h:g} {x+w-r:g} {y+h:g}H{x+r:g}Q{x:g} {y+h:g} {x:g} {y+h-r:g}V{y+r:g}Q{x:g} {y:g} {x+r:g} {y:g}Z'
    raise ValueError(f'Unsupported Lucide shape: {tag}')

lucide = {}
for r in rows:
    if not r['glyph'].startswith('lucide:'):
        continue
    slug = r['glyph'].split(':', 1)[1]
    svg = ET.parse(icons / (slug + '.svg')).getroot()
    assert svg.attrib['viewBox'] == '0 0 24 24'
    paths = [shape_to_path(e) for e in svg]
    assert paths, slug
    lucide[r['key']] = paths
out = ['// Converted from lucide-static v1.73.0 SVGs. See MAP_SYMBOL_LUCIDE_LICENSE.txt.', 'export const LUCIDE_MAP_GLYPHS:Record<string,readonly string[]> = {']
for key, paths in lucide.items():
    out.append('  ' + json.dumps(key, ensure_ascii=False) + ': ' + json.dumps(paths, ensure_ascii=False) + ',')
out += ['};', '']
(root / 'src/design/mapSymbolLucide.ts').write_text('\n'.join(out))

inventory = ['# Designer map symbols', '', 'The picker, canvas and exported images use the same vector paths. Lucide SVGs come from `lucide-static` v1.73.0 and are covered by [Lucide’s licence](../src/design/MAP_SYMBOL_LUCIDE_LICENSE.txt). Bespoke icons were drawn for ELT Suite.', '', '| # | Category | Symbol | Glyph source | Recognisable feature |', '|---:|---|---|---|---|']
for i, r in enumerate(rows, 1):
    inventory.append(f"| {i} | {r['category']} | {r['name']} (`{r['key']}`) | {r['glyph']} | {r['recognisable feature']} |")
(root / 'docs/map-symbol-inventory.md').write_text('\n'.join(inventory) + '\n')
print(f'Generated {len(rows)} symbols: {len(lucide)} Lucide, {len(rows)-len(lucide)} bespoke.')
