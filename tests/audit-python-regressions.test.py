import asyncio,gc,importlib.util,sys,unittest,weakref,io,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ai/python'))
import formnaro
class RegistryTests(unittest.TestCase):
    def test_apply_acceptance_is_explicit_and_shared_by_sdk_cli_and_mcp(self):
        spec=importlib.util.spec_from_file_location('formnaro_audit_bridge',ROOT/'scripts/offlinecad_ai.py')
        bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)
        class Transport:
            def __init__(self):self.calls=[]
            def request(self,method,args=None):
                if method=='context':return {'requestSchema':{'type':'object'}}
                self.calls.append((method,args));return {'ok':True}
        transport=Transport();client=formnaro.Client.__new__(formnaro.Client);client._transport=transport
        proposal={'previewId':'synthetic-preview','revision':'synthetic-revision','unrelated':'dropped'}
        client.apply(proposal);self.assertEqual(transport.calls[-1][1],{k:proposal[k]for k in ('previewId','revision')})
        client.apply(proposal,accept_feature_dependencies=True);self.assertIs(transport.calls[-1][1]['acceptFeatureDependencies'],True)
        for invalid in (1,'true',None):
            with self.assertRaises(ValueError):client.apply(proposal,accept_feature_dependencies=invalid)
            with self.assertRaises(ValueError):bridge.apply_arguments({**proposal,'acceptFeatureDependencies':invalid})
        accepted={**proposal,'acceptFeatureDependencies':True};self.assertEqual(bridge.apply_arguments(accepted),{k:v for k,v in accepted.items()if k!='unrelated'})
        schema=next(t for t in bridge.tool_definitions(transport)if t['name']=='offlinecad_apply')['inputSchema']
        self.assertEqual(schema['properties']['acceptFeatureDependencies'],{'type':'boolean'});self.assertNotIn('acceptFeatureDependencies',schema['required'])
        prior_in,prior_out=sys.stdin,sys.stdout
        try:
            messages=[{'jsonrpc':'2.0','id':0,'method':'initialize'},{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'offlinecad_apply','arguments':accepted}}]
            sys.stdin=io.TextIOWrapper(io.BytesIO(('\n'.join(json.dumps(m)for m in messages)+'\n').encode()));sys.stdout=io.StringIO()
            bridge.mcp(transport);response=json.loads(sys.stdout.getvalue().splitlines()[-1]);self.assertFalse(response['result']['isError']);self.assertEqual(transport.calls[-1],('apply',bridge.apply_arguments(accepted)))
        finally:sys.stdin,sys.stdout=prior_in,prior_out
    def test_discarded_external_models_do_not_accumulate_even_with_commands(self):
        refs=[]
        for i in range(100):
            m=formnaro.Model();m.command({'op':'test','i':i});refs.append(weakref.ref(m))
        del m;gc.collect();self.assertEqual(sum(r()is not None for r in refs),0)
    def test_worker_auto_flush_keeps_unreferenced_pending_commands_in_creation_order(self):
        before=formnaro._rpc;calls=[]
        async def rpc(method,command):calls.append(command)
        try:
            formnaro._rpc=rpc
            formnaro.Model().command({'op':'first'})
            formnaro.Model().command({'op':'second'})
            gc.collect();asyncio.run(formnaro._flush_all())
            self.assertEqual(calls,[{'op':'first'},{'op':'second'}])
            self.assertFalse(formnaro._pending_models)
        finally:formnaro._rpc=before
    def test_failed_flush_keeps_the_pending_model_for_retry(self):
        before=formnaro._rpc;calls=[]
        async def failed(method,command):raise RuntimeError('retry')
        async def success(method,command):calls.append(command)
        try:
            formnaro._rpc=failed;formnaro.Model().command({'op':'kept'})
            with self.assertRaisesRegex(RuntimeError,'retry'):asyncio.run(formnaro._flush_all())
            gc.collect();formnaro._rpc=success;asyncio.run(formnaro._flush_all())
            self.assertEqual(calls,[{'op':'kept'}]);self.assertFalse(formnaro._pending_models)
        finally:formnaro._rpc=before
if __name__=='__main__':unittest.main()
