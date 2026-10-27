import importlib.util
import asyncio
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai" / "python"))
from formnaro import Client, FormnaroError, Model, frame


class SDKTests(unittest.TestCase):
    def test_axis_placement_and_editable_contours(self):
        m = Model()
        m.box(20, 30, 4, origin=(3, 5, 7))
        m.cylinder(2, 10, origin=(11, 12, 13), normal=(1, 0, 0))
        m.polygon([(0, 0), (20, 0), (20, 10), (0, 10)], 5, plane=frame((0, 0, 2)))
        first = m.commands[0]["operation"]["options"]["transform"]
        self.assertEqual(first[12:15], [13, 20, 9])
        cylinder = m.commands[1]["operation"]["options"]["transform"]
        self.assertEqual(cylinder[8:11], [1, 0, 0])
        self.assertEqual(cylinder[12:15], [16, 12, 13])
        self.assertEqual(m.commands[2]["sketch"]["dimensions"]["height"], "hoehe")
        for n in (float("nan"), float("inf"), -1, 0, True):
            with self.assertRaises(ValueError):
                m.box(n, 1, 1)
        with self.assertRaises(ValueError):
            frame(normal=(0, 0, 0))

    def test_source_addresses_and_boolean_operands_remain_explicit(self):
        m = Model()
        p = m.get("observed-root", ["observed-source"])
        p.edit(size=[4, 5, 6])
        self.assertEqual(m.commands[0]["target"], {"rootId": "observed-root", "path": ["observed-source"]})
        base = m.box(20, 30, 4)
        hole = m.cylinder(2, 8, hole=True)
        m.cut(base, hole)
        self.assertFalse(m.commands[-3]["set"]["solid"])
        self.assertEqual(m.commands[-1]["targets"], [base.target, hole.target])
        self.assertNotEqual(Model()._prefix, m._prefix)

    def test_named_final_result_alias_is_exportable_without_copying_sources(self):
        m = Model()
        base = m.box(20, 30, 4)
        hole = m.cylinder(2, 8, hole=True)
        part = m.cut(base, hole, alias="result")
        self.assertEqual(part.target, "$result")
        self.assertEqual(m.commands[-1]["as"], "result")
        self.assertEqual(m.commands[-1]["targets"], [base.target, hole.target])
        for alias in ("result", "", "1invalid", "private/path", "x" * 65):
            with self.assertRaises(ValueError):
                m.union(base, hole, alias=alias)

    def test_section_reconstruction_keeps_every_hole_across_native_element_limits(self):
        class SectionModel(Model):
            async def query(self, *args, **kwargs):
                def loop(index, parent, role, count):
                    return {"index": index, "parentIndex": parent, "role": role, "complete": True,
                            "elements": [{"id": "s"+str(index)+"e"+str(i), "type": "line", "start": [i, 0], "end": [i+1, 0]} for i in range(count)]}
                return {"complete": True, "frame": frame((0, 0, 4)),
                        "loops": [loop(0, None, "outer", 4), *[loop(i, 0, "hole", 12) for i in range(1, 15)]]}
        m = SectionModel()
        part = asyncio.run(m.section("observed", 8, normal=[0, 0, 1], point=[0, 0, 4], start=0, alias="result"))
        self.assertEqual(part.target, "$result")
        sketches = [c for c in m.commands if c["op"] == "sketch"]
        self.assertEqual(len(sketches), 15)
        self.assertEqual(sum(not c["solid"] for c in sketches), 14)
        self.assertTrue(all(c["frame"][14] == 0 for c in sketches))
        self.assertEqual(len(m.commands[-1]["targets"]), 15)
        # The union of many outer loops is also retained explicitly.
        a = Model().sketch({"version": 2}, alias="measured")
        self.assertEqual(a.target, "$measured")

    def test_transport_preview_apply_stale_redaction_and_compatibility(self):
        token = "a" * 64
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                self.reply()
            def do_POST(self):
                self.reply()
            def reply(self):
                if self.headers.get("Authorization") != "Bearer " + token:
                    self.send_error(401)
                    return
                data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"null")
                calls.append((self.path, data))
                if data and data.get("revision") == "stale":
                    body = {"error": "STALE_REVISION " + token, "code": "STALE_REVISION", "feedback": {"message": token}}
                    self.send_response(409)
                else:
                    self.send_response(200)
                    body = {"revision": "0123456789abcdef", "previewId": "test-preview", "applied": self.path.endswith("apply")}
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="formnaro-python-sdk-") as folder:
                path = Path(folder) / "connection.json"
                descriptor = {"url": "http://127.0.0.1:" + str(server.server_port), "token": token}
                path.write_text(json.dumps(descriptor), encoding="utf-8")
                client = Client(path)
                m = Model()
                m.box(10, 20, 3)
                proposal = client.preview(m)
                self.assertEqual([p for p, _ in calls], ["/v1/scene", "/v1/preview"])
                self.assertFalse(any(p.endswith("apply") for p, _ in calls))
                self.assertTrue(client.apply(proposal)["applied"])
                with self.assertRaises(FormnaroError) as caught:
                    client.preview(m, revision="stale")
                self.assertEqual(caught.exception.code, "STALE_REVISION")
                self.assertNotIn(token, str(caught.exception))
                self.assertNotIn(token, json.dumps(caught.exception.feedback))
                with self.assertRaisesRegex(RuntimeError, "0.90"):
                    client.preview_python("result=42")
                for url in ("https://example.com", "http://127.0.0.1:invalid", "http://user:secret@127.0.0.1:1234"):
                    path.write_text(json.dumps({**descriptor, "url": url}), encoding="utf-8")
                    with self.assertRaisesRegex(RuntimeError, "descriptor"):
                        client.scene()
                path.write_text(json.dumps({**descriptor, "token": "x"*63+"\n"}), encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "descriptor"):
                    client.scene()
        finally:
            server.shutdown()
            server.server_close()

    def test_cylinder_between_uses_world_segment_and_explicit_symmetric_overrun(self):
        m = Model()
        m.cylinder_between(diameter=8, start=(30, 41, 18), end=(30, -1, 18), overrun=.5, hole=True)
        op = m.commands[0]["operation"]
        self.assertEqual(op["recipe"]["size"], [8, 8, 43])
        self.assertEqual(op["options"]["transform"][8:11], [0, -1, 0])
        self.assertEqual(op["options"]["transform"][12:15], [30, 20, 18])
        self.assertFalse(op["options"]["solid"])
        for fields in ({"end": (30, 41, 18)}, {"diameter": 0}, {"overrun": -1}, {"overrun": True}, {"origin": (0,0,0)}):
            with self.assertRaises(ValueError):
                m.cylinder_between(**dict({"diameter": 8, "start": (30,41,18), "end": (30,-1,18)}, **fields))

    def test_center_resize_measures_current_source_parent_frame_and_keeps_min_compatibility(self):
        target = {"rootId": "root", "path": ["nested"]}
        class MeasuredModel(Model):
            async def query(self, engine, kind, **options):
                if kind == "bounds":
                    return {"byId": [{"target": target}]}
                return {"objects": [{"kind": "cad", "target": target,
                    "localBounds": {"min": [-2, -3, 0], "max": [4, 5, 10]},
                    "transform": [-1,0,0,0, .2,1,0,0, 0,0,1,0, 10,20,30,1]}]}
        m = MeasuredModel()
        part = m.get(target)
        self.assertIs(asyncio.run(part.resize([10,10,12])), part)
        self.assertEqual(m.commands[-1], {"op":"update", "target":target, "set":{"size":[10,10,12],"pos":[9.2,21,35]}})
        asyncio.run(part.resize([8,8,9], anchor="min"))
        self.assertEqual(m.commands[-1]["set"], {"size":[8,8,9]})
        with self.assertRaises(ValueError):
            asyncio.run(part.resize([8,8,9], anchor="world"))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SDKTests)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    folder = Path(__file__).resolve().parents[1] / "work" / "python-api"
    folder.mkdir(parents=True, exist_ok=True)
    Path(os.environ.get("FORMNARO_PYTHON_SDK_RESULT", str(folder / "python-sdk-result.json"))).write_text(json.dumps({"ok": result.wasSuccessful(), "tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped)}, indent=2), encoding="utf-8")
    raise SystemExit(0 if result.wasSuccessful() else 1)
