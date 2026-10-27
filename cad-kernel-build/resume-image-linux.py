"""Resume a task-owned verified OCI rootfs through the original build script.

Only useful after run-image-linux.py verified/extracted every layer. It bypasses
the optional Nx launcher, using original bind-symbols and link commands with
the same cached kernel, sources, compiler, patches and wrappers.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess

argparse.ArgumentParser(description=__doc__).parse_args()
if platform.system() != "Linux":
    raise SystemExit("Run in Linux/WSL.")
PROJECT = Path(__file__).resolve().parent.parent
BUILD = PROJECT / "work/cad-v011-build"
OCI = BUILD / "oci"
ROOT = Path((BUILD / "linux-rootfs-path.txt").read_text().strip()).resolve()
if ROOT.parent.parent != Path("/var/tmp") or not ROOT.parent.name.startswith("formnaro-cad-v011-") or ROOT.name != "rootfs":
    raise SystemExit("Rootfs is outside this task's isolated build directory.")
LOCK = json.loads((PROJECT / "cad-kernel-build/upstream-lock.json").read_text())
marker = ROOT.parent / "verified-image.json"
if not marker.is_file() or json.loads(marker.read_text())["imageDigest"] != LOCK["dockerImage"]["digest"]:
    raise SystemExit("The completed verified-image marker is missing. Run run-image-linux.py.")
descriptor = json.loads(marker.read_text())["config"]
config_file = OCI / (descriptor["digest"].removeprefix("sha256:") + ".blob")
config_bytes = config_file.read_bytes()
if hashlib.sha256(config_bytes).hexdigest() != descriptor["digest"].removeprefix("sha256:"):
    raise SystemExit("Image configuration checksum mismatch.")
environment = json.loads(config_bytes)["config"]["Env"]
proot = OCI / "linux-helper" / LOCK["linuxLauncher"]["filename"]
if hashlib.sha256(proot.read_bytes()).hexdigest() != LOCK["linuxLauncher"]["sha256"]:
    raise SystemExit("PRoot launcher checksum mismatch.")
proot.chmod(0o755)
launcher = [str(proot), "-r", str(ROOT), "-b", "/dev", "-b", "/proc", "-b", "/sys", "-b", str(BUILD / "config") + ":/src", "-w", "/src", "/usr/bin/env", "-i", *environment]
host_environment = dict(os.environ)
for stage in ("bind-symbols", "link"):
    print("Original builder stage:", stage, flush=True)
    subprocess.run([*launcher, "/bin/bash", "/opencascade.js/build-wasm.sh", stage, "/src/formnaro_cad.yml"], check=True, env=host_environment)
