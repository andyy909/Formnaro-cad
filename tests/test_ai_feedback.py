import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('offlinecad_ai', Path(__file__).resolve().parents[1] / 'scripts/offlinecad_ai.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

class FeedbackTest(unittest.TestCase):
    def test_http_and_mcp_retain_structured_failure_and_redact_token(self):
        token = 'f' * 64
        data = {'error': 'invalid ' + token, 'code': 'INVALID_COMMAND', 'stack': 'PRIVATE_STACK', 'feedback': {'code': 'INVALID_COMMAND', 'message': 'bad', 'commandIndex': 2, 'target': {'rootId': 'part', 'path': []}, 'retryable': False, 'applied': False}}
        with tempfile.TemporaryDirectory() as folder:
            connection = Path(folder) / 'ai-bridge.json'
            connection.write_text(json.dumps({'url': 'http://127.0.0.1:12345', 'token': token, 'version': 1}))
            client = api.Client(connection)
            failure = HTTPError('http://127.0.0.1', 400, 'bad', {}, io.BytesIO(json.dumps(data).encode()))
            with patch.object(client.opener, 'open', side_effect=failure):
                with self.assertRaises(api.CADAPIError) as caught:
                    client.request('preview', {})
            payload = caught.exception.payload
            self.assertEqual(payload['feedback']['commandIndex'], 2)
            self.assertNotIn(token, json.dumps(payload))
            self.assertNotIn('PRIVATE_STACK', json.dumps(payload))
            requests = [{'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'}, {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'offlinecad_preview', 'arguments': {}}}]
            stdin = io.TextIOWrapper(io.BytesIO(('\n'.join(json.dumps(v) for v in requests) + '\n').encode()))
            stdout = io.StringIO()
            with patch.object(client, 'request', side_effect=caught.exception), patch.object(api.sys, 'stdin', stdin), patch.object(api.sys, 'stdout', stdout):
                api.mcp(client)
            reply = json.loads(stdout.getvalue().splitlines()[-1])['result']
            self.assertTrue(reply['isError'])
            result = json.loads(reply['content'][0]['text'])
            self.assertEqual(result['code'], 'INVALID_COMMAND')
            self.assertFalse(result['feedback']['retryable'])

    def test_legacy_failure_has_no_invented_fields(self):
        error = api.CADAPIError(400, {'error': 'legacy'}, 'fixture-token')
        self.assertEqual(error.payload, {'error': 'legacy', 'status': 400})

if __name__ == '__main__':
    unittest.main()
