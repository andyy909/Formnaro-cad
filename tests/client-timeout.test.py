import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('cad_client', Path(__file__).parents[1] / 'scripts/offlinecad_ai.py')
client_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client_module)

class ClientTimeout(unittest.TestCase):
    def test_long_native_operation_reports_timeout_without_exposing_token(self):
        with tempfile.TemporaryDirectory() as directory:
            descriptor = Path(directory) / 'bridge.json'
            descriptor.write_text(json.dumps({'url': 'http://127.0.0.1:1', 'token': 'x' * 64}))
            client = client_module.Client(descriptor)
            class Opener:
                def open(self, request, timeout):
                    self.timeout = timeout
                    raise TimeoutError()
            client.opener = Opener()
            with self.assertRaises(ValueError) as caught:
                client.request('preview', {})
            self.assertEqual(client.opener.timeout, 650)
            self.assertIn('time limit', str(caught.exception))
            self.assertNotIn('x' * 64, str(caught.exception))

if __name__ == '__main__':
    unittest.main()
