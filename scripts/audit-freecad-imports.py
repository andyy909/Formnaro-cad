"""Build-time import inventory; never shipped in the portable application."""
import argparse
import ast
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(args.root).resolve()
rows = []
omitted = {'Fem', 'FemGui', 'Path', 'PathGui', 'Arch', 'BIM', 'OpenSCAD',
           'Robot', 'Inspection', 'ReverseEngineering', 'Idf'}
profile = json.loads(Path(__file__).with_name('portable-freecad-profile.json').read_text(encoding='utf-8'))
omitted.update(profile['omittedPythonPackages'])
blocked = []
for file in sorted((root / 'backend').glob('*.py')):
    tree = ast.parse(file.read_text(encoding='utf-8-sig'), filename=str(file))
    imports, dynamic = set(), []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)
        elif isinstance(node, ast.Call):
            name = getattr(node.func, 'attr', getattr(node.func, 'id', ''))
            if name in {'import_module', '__import__'}:
                dynamic.append({'line': node.lineno, 'argument': ast.unparse(node.args[0]) if node.args else None})
    for module in imports:
        if module.split('.')[0] in omitted:
            blocked.append({'file': str(file.relative_to(root)), 'module': module})
    rows.append({'file': str(file.relative_to(root)), 'imports': sorted(imports), 'dynamicImports': dynamic})
report = {
    'ok': not blocked, 'workers': rows, 'blocked': blocked,
    'coreModulesRetained': ['FreeCAD', 'Part', 'PartDesign', 'Sketcher', 'Mesh',
                            'MeshPart', 'Draft', 'Surface', 'Import', 'TechDraw',
                            'Points', 'Spreadsheet', 'FreeCADGui', 'ImportGui', 'PySide'],
    'limits': 'Static imports are not a complete dependency proof. User scripts, archived helpers and API discovery import dynamically. The supported core catalogue and generated GUI wrapper require separate native packaged execution tests.'
}
target = Path(args.output)
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(report, indent=2), encoding='utf-8')
if blocked:
    raise SystemExit('An excluded workbench is imported by a worker; revise the portable policy.')
print('FreeCAD worker imports checked:', len(rows))
