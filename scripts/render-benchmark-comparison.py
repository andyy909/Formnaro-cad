"""Rebuild both fixed-16 comparison diagrams from the published evidence rows."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
comparison = json.loads((ROOT/'docs/benchmarks/sol-deepseek-16-vergleich-2026-11-08.json').read_text(encoding='utf-8'))
assert comparison['axis'] == {'min': 0, 'max': 16, 'unit': 'conditions', 'ticks': [0, 4, 8, 12, 16]}
assert len(comparison['rows']) == 2
assert all(0 <= r['nativePassed'] <= r['planned'] == 16 for r in comparison['rows'])

def diagram(en=False):
    title = 'Sol & DeepSeek: complete runs' if en else 'Sol & DeepSeek: volle Läufe'
    sub = 'Native passes · 8 tasks × 2 trials' if en else 'Nativ bestanden · 8 Aufgaben × 2'
    note = 'Different builds and suites' if en else 'Unterschiedliche Builds und Suiten'
    note2 = 'Measured 08 Nov 2026 · high · monitor off' if en else 'Gemessen 08.11.2026 · high · Monitor aus'
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="660" viewBox="0 0 640 660" role="img" aria-labelledby="title desc"><title id="title">{html.escape(title)}</title><desc id="desc">DeepSeek V4.1 Flash: 16/16, 0.137.0-r1, suite 1.0.2. GPT-6.1 Sol: 16/16, 0.137.4-r2, suite 1.0.4. {note}. Axis 0–16.</desc><rect width="640" height="660" fill="#101b2b"/><g font-family="Arial, sans-serif" fill="#eef4fc"><text x="30" y="44" font-size="29" font-weight="700">{html.escape(title)}</text><text x="30" y="80" font-size="24" fill="#b6c5d8">{sub}</text>']
    for tick in comparison['axis']['ticks']:
        y=443-tick*18
        parts.append(f'<path d="M76 {y}H610" stroke="#374a61" stroke-width="1"/><text x="60" y="{y+8}" text-anchor="end" font-size="24" fill="#b6c5d8">{tick}</text>')
    parts.append('<path d="M76 155V443H610" fill="none" stroke="#91a6bd" stroke-width="2"/>')
    for row,x,color,label in [(comparison['rows'][0],133,'#55c8e5',['DeepSeek','V4.1 Flash']),(comparison['rows'][1],403,'#c2a7ff',['GPT-6.1','Sol'])]:
        h=row['nativePassed']*18
        parts.append(f'<rect data-model="{row["modelId"]}" data-value="{row["nativePassed"]}" x="{x}" y="{443-h}" width="132" height="{h}" fill="{color}"/><text x="{x+66}" y="132" text-anchor="middle" font-size="34" font-weight="700">{row["nativePassed"]}/16</text>')
        for text,y,size,fill in [(label[0],479,26,'#eef4fc'),(label[1],510,26,'#eef4fc'),(row['program']['version'],548,24,'#b6c5d8'),('Suite '+row['suite']['version'],579,24,'#b6c5d8')]:
            parts.append(f'<text x="{x+66}" y="{y}" text-anchor="middle" font-size="{size}" fill="{fill}">{text}</text>')
    parts.append(f'<text x="30" y="618" font-size="24">{note}</text><text x="30" y="648" font-size="22" fill="#b6c5d8">{note2}</text></g></svg>\n')
    return ''.join(parts).encode('utf-8')

if __name__ == '__main__':
    for en in [False, True]:
        suffix = '-en' if en else ''
        (ROOT/'docs/bilder'/f'benchmark-sol-deepseek-16-2026-11-08{suffix}.svg').write_bytes(diagram(en))
