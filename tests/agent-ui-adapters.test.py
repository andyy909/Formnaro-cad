import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('adapter', Path(__file__).resolve().parents[1] / 'scripts/offlinecad_ai.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def test_real_python_client_posts_ui_on_loopback(self):
        requests = []
        token = 'b' * 64
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append((self.path, self.headers['Authorization'], json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"state":{"targets":[]}}')
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'connection.json'
                path.write_text(json.dumps({'url': 'http://127.0.0.1:' + str(server.server_port), 'token': token}), encoding='utf-8')
                result = adapter.ui_request(adapter.Client(path), {'action': 'state'})
                self.assertEqual(result, {'state': {'targets': []}})
                self.assertEqual(requests, [('/v1/ui', 'Bearer ' + token, {'action': 'state'})])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_local_wait_returns_only_the_completed_result_and_surfaces_failure(self):
        class Client:
            def __init__(self, state):
                self.calls = []
                self.state = state
            def request(self, operation, args):
                self.calls.append((operation, args))
                return {'jobId': 'ui-1', 'accepted': True, 'state': 'running'} if len(self.calls) == 1 else {'jobId': 'ui-1', 'state': self.state}
        with patch.object(adapter.time, 'sleep'):
            client = Client('completed')
            self.assertEqual(adapter.ui_request(client, {'action': 'practice'})['state'], 'completed')
            self.assertEqual(client.calls[-1], ('ui', {'action': 'status', 'jobId': 'ui-1'}))
            with self.assertRaises(ValueError):
                adapter.ui_request(Client('cancelled'), {'action': 'guide'})

    def test_older_application_does_not_advertise_missing_ui_tools(self):
        class Client:
            def __init__(self, available):
                self.available = available
            def request(self, operation):
                return {'requestSchema': {}, 'agentUI': {'available': self.available, 'requestSchema': {'oneOf': []}}}
        self.assertNotIn('offlinecad_ui', [t['name'] for t in adapter.tool_definitions(Client(False))])
        self.assertIn('offlinecad_ui', [t['name'] for t in adapter.tool_definitions(Client(True))])


if __name__ == '__main__':
    unittest.main()
