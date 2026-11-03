import importlib.util
import json
from pathlib import Path
import subprocess
import sys
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

    def test_stdio_supports_modern_requests_and_legacy_handshakes(self):
        prefix = 'io.modelcontextprotocol/'
        version_key = prefix + 'protocolVersion'
        version = '2026-07-28'
        metadata = {version_key: version, prefix + 'clientCapabilities': {}}
        messages = [
            ('tools/call', {'_meta': metadata, 'name': 'offlinecad_scene'}),
            ('server/discover', {'_meta': metadata}),
            ('tools/list', {'_meta': metadata}),
            ('resources/list', {'_meta': metadata}),
            ('resources/templates/list', {'_meta': metadata}),
            ('resources/read', {'_meta': metadata, 'uri': 'offlinecad://scene'}),
            ('ping', {'_meta': {**metadata, version_key: '2099-01-01'}}),
            ('tools/list', {'_meta': {version_key: version}}),
            ('tools/list', {}),
        ]
        for legacy_version in adapter.SUPPORTED_PROTOCOLS:
            messages += [('initialize', {'protocolVersion': legacy_version}), ('tools/list', {})]
        request_lines = ''.join(
            json.dumps({'jsonrpc': '2.0', 'id': index, 'method': method, 'params': params}) + '\n'
            for index, (method, params) in enumerate(messages)
        )
        runner = """
import runpy
import sys

class Client:
    def request(self, method, args=None):
        if method == 'context':
            return {'requestSchema': {}}
        if method == 'scene':
            return {'revision': 'test-revision'}
        raise AssertionError(method)

runpy.run_path(sys.argv[1])['mcp'](Client())
"""
        root = Path(__file__).resolve().parents[1]
        for path in ('scripts/offlinecad_ai.py', 'ai/offlinecad_ai.py'):
            with self.subTest(adapter=path):
                child = subprocess.run([sys.executable, '-X', 'utf8', '-c', runner, str(root / path)],
                                       input=request_lines, text=True, encoding='utf-8',
                                       capture_output=True, check=True, timeout=10)
                replies = [json.loads(line) for line in child.stdout.splitlines()]
                self.assertEqual([reply['id'] for reply in replies], list(range(len(messages))))
                self.assertEqual(child.stderr, '')
                for reply in replies[:6]:
                    self.assertEqual(reply['result']['resultType'], 'complete')
                    self.assertEqual(reply['result']['_meta'][prefix + 'serverInfo']['name'], 'offlinecad-local')
                self.assertEqual(json.loads(replies[0]['result']['content'][0]['text'])['revision'], 'test-revision')
                self.assertEqual(replies[1]['result']['supportedVersions'], [version])
                self.assertEqual(replies[1]['result']['capabilities'], {'tools': {}, 'resources': {}})
                self.assertIn('instructions', replies[1]['result'])
                for reply in replies[1:6]:
                    self.assertEqual(reply['result']['ttlMs'], 0)
                    self.assertEqual(reply['result']['cacheScope'], 'private')
                self.assertEqual([tool['name'] for tool in replies[2]['result']['tools']],
                                 sorted(tool['name'] for tool in replies[2]['result']['tools']))
                self.assertEqual(replies[4]['result']['resourceTemplates'], [])
                self.assertEqual(replies[5]['result']['contents'][0]['uri'], 'offlinecad://scene')
                self.assertEqual(replies[6]['error']['code'], -32022)
                self.assertEqual(replies[6]['error']['data'],
                                 {'requested': '2099-01-01', 'supported': [version, *adapter.SUPPORTED_PROTOCOLS]})
                self.assertEqual(replies[7]['error']['code'], -32602)
                self.assertIn('Initialize', replies[8]['error']['message'])
                for index, legacy_version in enumerate(adapter.SUPPORTED_PROTOCOLS):
                    initialized, listed = replies[9 + index * 2:11 + index * 2]
                    self.assertEqual(initialized['result']['protocolVersion'], legacy_version)
                    self.assertEqual(initialized['result']['serverInfo']['name'], 'offlinecad-local')
                    self.assertNotIn('resultType', initialized['result'])
                    self.assertNotIn('_meta', listed['result'])
                    self.assertTrue(listed['result']['tools'])


if __name__ == '__main__':
    unittest.main()
