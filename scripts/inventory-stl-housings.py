"""Local, read-only STL corpus inventory. Personal paths stay in --output."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', action='append', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--selection', required=True, help='Local JSON with names and mandatory cases')
    args = parser.parse_args()
    selection=json.loads(Path(args.selection).read_text(encoding='utf-8'))
    files = sorted({Path(directory) / name for root in args.root
                    for directory, _, names in os.walk(root)
                    for name in names if name.lower().endswith('.stl')}, key=lambda p: str(p).lower())
    rows, seen = [], {}
    for i, file in enumerate(files):
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            header = stream.read(84)
            digest.update(header)
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        size = file.stat().st_size
        count = struct.unpack_from('<I', header, 80)[0] if len(header) == 84 else None
        binary = count is not None and 84 + count * 50 == size
        row = dict(path=str(file), name=file.name, bytes=size, sha256=digest.hexdigest(),
                   format='binary' if binary else 'ascii-or-invalid',
                   triangles=count if binary else None, duplicateOf=seen.get(digest.hexdigest()))
        seen.setdefault(digest.hexdigest(), str(file)); rows.append(row)
        if (i + 1) % 250 == 0:
            print(f'Inventoried {i+1}/{len(files)}', flush=True)
    chosen = []
    for name in selection['names']:
        matches = [r for r in rows if r['name'].lower() == name.lower()]
        if not matches:
            raise RuntimeError('Required corpus input missing: ' + name)
        chosen.append(min(matches, key=lambda r: (len(Path(r['path']).parts), r['path'])))
    hashes = {r['sha256'] for r in chosen}
    remaining = [r for r in rows if r['sha256'] not in hashes]
    chosen += [min(remaining, key=lambda r: (r['bytes'], r['path'])),
               max(remaining, key=lambda r: (r['bytes'], r['path']))]
    report = dict(schema='Formnaro-local-STL-corpus-v1', count=len(rows),
                  unique=len(seen), over50MiB=sum(r['bytes'] > 50*1024*1024 for r in rows),
                  entries=rows, selected=chosen, mandatory=selection['mandatory'])
    target = Path(args.output); target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: report[k] for k in ['count','unique','over50MiB']}) + f'; selected {len(chosen)}', flush=True)

if __name__ == '__main__':
    main()
