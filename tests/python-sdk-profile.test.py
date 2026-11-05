import json,sys,tempfile,threading,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ai'/'python'))
from formnaro import Client
class ProfileTests(unittest.TestCase):
 def test_actual_sdk_transport_keeps_profile_and_scene_selectors(self):
  calls=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_POST(self):
    body=json.loads(self.rfile.read(int(self.headers['content-length'])));calls.append((self.path,body));self.send_response(200);self.send_header('content-type','application/json');self.end_headers();self.wfile.write(json.dumps({'ok':True}).encode())
  server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   with tempfile.TemporaryDirectory() as folder:
    descriptor=Path(folder)/'bridge.json';descriptor.write_text(json.dumps({'url':'http://127.0.0.1:'+str(server.server_port),'token':'a'*64}));client=Client(descriptor)
    client.context(profile='compact');client.command_info('create',type='thread');client.scene(ids=['root']);client.scene(targets=[{'rootId':'root','path':['source']}]);client.scene(roots_only=True);client.discard({'previewId':'known-preview','revision':'known-revision','commands':[{'op':'must-not-be-sent'}]})
    self.assertEqual(calls,[('/v1/context',{'profile':'compact'}),('/v1/command_info',{'command':'create','type':'thread'}),('/v1/scene',{'ids':['root']}),('/v1/scene',{'targets':[{'rootId':'root','path':['source']}]}),('/v1/scene',{'rootsOnly':True}),('/v1/discard',{'previewId':'known-preview','revision':'known-revision'})])
  finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
