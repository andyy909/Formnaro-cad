"""Exercise the Orca page callback while the 3D view has never been shown."""
import runpy
import sys
import unittest
from pathlib import Path
from threading import Event
from types import SimpleNamespace
from unittest.mock import patch

class EmptyOrcaTest(unittest.TestCase):
    def test_page_accepts_a_command_during_its_first_poll(self):
        registrations = []
        permissions = {}
        host = SimpleNamespace(
            base=object, plugin=lambda cls: cls, request_permissions=permissions.update,
            register_capability=registrations.append,
            script=SimpleNamespace(ScriptPluginCapabilityBase=object),
            pages=SimpleNamespace(PagesPluginCapabilityBase=object),
        )
        with patch.dict(sys.modules, orca=host):
            plugin = runpy.run_path(str(Path(__file__).parents[1] / 'ai/orca-formnaro-chat.py'))
        plugin['FormnaroChat']().register_capabilities()
        self.assertEqual(permissions['network_socket'], ['127.0.0.1'])
        pages = [c for c in registrations if hasattr(c, 'get_ui')]
        self.assertEqual(len(pages), 1)
        page = pages[0]()
        self.assertIn('id="compose"', page.get_ui())
        polling, release, accepted = Event(), Event(), Event()
        page.post_message = lambda message: accepted.set() if message.get('kind') == 'accepted' else None

        def request(data):
            if data['action'] == 'send':
                return {'accepted': True}
            polling.set()
            release.wait(2)
            return {'ready': True}

        with patch.dict(page.on_message.__globals__, request=request):
            try:
                page.on_message({'action': 'state'})
                self.assertTrue(polling.wait(1))
                page.on_message({'action': 'send', 'id': '1-test', 'prompt': 'Erstelle einen Quader'})
                self.assertTrue(accepted.wait(1))
            finally:
                release.set()

if __name__ == '__main__':
    unittest.main()
