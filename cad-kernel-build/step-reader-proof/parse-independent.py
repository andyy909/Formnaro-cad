"""An independent Part21 parser proof, explicitly not a geometric CAD reader."""
from pathlib import Path
import hashlib,json,sys,zipfile
from collections import Counter
sys.dont_write_bytecode=True
work=Path(__file__).resolve().parents[2]/'work'/'cad-independent-step'
archive=work/'steputils-source.zip'
expected_sha='4848d0957de54be6853db1b33dc35c83306757cf8f047700ebbf8ca5aa61a215'
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected_sha:raise RuntimeError('Independent parser source checksum mismatch')
target=work/'parser'
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        path=(target/item.filename).resolve()
        if not path.is_relative_to(target.resolve()) or (item.external_attr>>16)&0o170000==0o120000:raise RuntimeError('Unsafe source archive path')
    z.extractall(target)
sys.path.insert(0,str(target/'steputils-547860b349a36cf24c564d6c87ffd8f60484f6fb'/'src'))
from steputils import p21
model=p21.readfile(str(work/'formnaro-ap214.step'))
instances=[instance for data in model.data for instance in data.instances.values()]
entities=[entity for instance in instances for entity in ([instance.entity] if hasattr(instance,'entity') else instance.entities)]
counts=Counter(str(entity.name) for entity in entities)
unbound=sorted(set(str(ref) for data in model.data for ref in data.references() if not model.has_reference(ref)))
details={kind:[entity.params for entity in entities if entity.name==kind] for kind in ['PRODUCT','SI_UNIT','DRAUGHTING_PRE_DEFINED_COLOUR','SURFACE_STYLE_TRANSPARENT','CYLINDRICAL_SURFACE']}
assert not unbound,unbound
assert counts['MANIFOLD_SOLID_BREP']==2 and counts['CLOSED_SHELL']==2
assert counts['CYLINDRICAL_SURFACE']==2 and counts['PLANE']==8
assert not any('TESSELLATED' in name or 'TRIANGULATED' in name for name in counts)
names=[str(params[1]) for params in details['PRODUCT']]
assert names==['Bohrkörper','Quader'],names
assert set(str(params[0]) for params in details['DRAUGHTING_PRE_DEFINED_COLOUR'])=={'red','blue'}
assert any(abs(float(params[0])-.3)<2e-7 for params in details['SURFACE_STYLE_TRANSPARENT'])
assert any(str(params[0])=='.MILLI.' and str(params[1])=='.METRE.' for params in details['SI_UNIT'])
evidence={'parser':'mozman/steputils','commit':'547860b349a36cf24c564d6c87ffd8f60484f6fb','archiveSha256':expected_sha,'stepSha256':hashlib.sha256((work/'formnaro-ap214.step').read_bytes()).hexdigest(),'parsed':True,'geometricCadReader':False,'instances':len(instances),'unboundReferences':unbound,'counts':dict(sorted(counts.items())),'details':details}
(work/'parser-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2,default=str)+'\n',encoding='utf-8')
print(json.dumps({'parsed':True,'geometricCadReader':False,'instances':len(instances),'unboundReferences':len(unbound),'solids':counts['MANIFOLD_SOLID_BREP'],'analyticCylinders':counts['CYLINDRICAL_SURFACE'],'names':names},ensure_ascii=True))
