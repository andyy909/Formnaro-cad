"""Independently inspect the physical synthetic outputs of a fresh suite run."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

summary_file = Path(sys.argv[1]).resolve()
summary = json.loads(summary_file.read_text(encoding='utf-8'))
assert not summary.get('exploratory') and not summary.get('sourceChanged')
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
results = []
for name in ['smooth', 'erase-fill', 'make-solid', 'hollow']:
    record = next(r for r in summary['results'] if r['id'] == name)
    assert record['ok'] and record['exitCode'] == 0
    report_file = Path(record['report'])
    assert sha(report_file) == record['reportSha256']
    script = Path(__file__).with_name('inspect-all-' + name + '.py')
    spec = importlib.util.spec_from_file_location('independent_' + name.replace('-', '_'), script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    report = json.loads(report_file.read_text(encoding='utf-8'))
    assert report['appVersion'] == summary['version']
    assert not report.get('errors') and not report.get('external')
    result = module.inspect_artifacts(report, summary['mode'])
    assert result['ok']
    results.append(dict(suite=name, reportSha256=record['reportSha256'], inspectorSha256=sha(script), result=result))
    print(json.dumps(dict(suite=name, ok=True)), flush=True)
output = summary_file.with_name('independent-files.json')
output.write_text(json.dumps(dict(ok=True, version=summary['version'], summarySha256=sha(summary_file), results=results), indent=2), encoding='utf-8')
print(json.dumps(dict(ok=True, output=str(output))), flush=True)
