"""Run the verified original builder in a temporary unprivileged Linux rootfs.

No Docker daemon, distro package installation, system configuration change,
host mount, or existing Docker data modification is performed.
Requires a local PRoot helper and the blobs from fetch-image.py.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

argparse.ArgumentParser(description=__doc__).parse_args()
if platform.system() != "Linux":
    raise SystemExit("Run this helper in Linux/WSL after fetch-image.py and prepare.mjs.")
PROJECT = Path(__file__).resolve().parent.parent
BUILD = PROJECT / "work" / "cad-v011-build"
OCI = BUILD / "oci"
LOCK = json.loads((PROJECT / "cad-kernel-build" / "upstream-lock.json").read_text(encoding="utf-8-sig"))

def checked_manifest(digest):
    data = (OCI / (digest.removeprefix("sha256:") + ".manifest")).read_bytes()
    if hashlib.sha256(data).hexdigest() != digest.removeprefix("sha256:"):
        raise RuntimeError("OCI manifest checksum mismatch")
    return json.loads(data)

index = checked_manifest(LOCK["dockerImage"]["digest"])
platform_entry = next(item for item in index["manifests"] if item.get("platform") == {"architecture": "amd64", "os": "linux"})
image = checked_manifest(platform_entry["digest"])
# WSL can recreate /tmp when its lightweight VM stops. /var/tmp retains this
# task-owned rootfs for a failed launch to be diagnosed and resumed.
temporary = Path(tempfile.mkdtemp(prefix="formnaro-cad-v011-", dir="/var/tmp"))
ROOT = temporary / "rootfs"
ROOT.mkdir()
(BUILD / "linux-rootfs-path.txt").write_text(str(ROOT) + "\n")
print("Isolated original builder rootfs:", ROOT, flush=True)

def inside(path):
    resolved = path.resolve()
    if not resolved.is_relative_to(ROOT):
        raise RuntimeError("OCI path escaped the isolated rootfs")
    return path

def target(name):
    parts = Path(name).parts
    if Path(name).is_absolute() or ".." in parts:
        raise RuntimeError("Unsafe OCI archive path")
    result = ROOT / name
    if result == ROOT:
        return result
    inside(result.parent)
    return result

def remove(path):
    inside(path.parent)
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.is_dir():
        inside(path)
        shutil.rmtree(path)

def blob_path(descriptor):
    file = OCI / (descriptor["digest"].removeprefix("sha256:") + ".blob")
    with file.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != descriptor["digest"].removeprefix("sha256:") or file.stat().st_size != descriptor["size"]:
        raise RuntimeError("OCI blob checksum mismatch")
    return file

for number, layer in enumerate(image["layers"], 1):
    print("Extracting verified layer", number, "of", len(image["layers"]), flush=True)
    with tarfile.open(blob_path(layer), "r|*") as archive:
        for member in archive:
            destination = target(member.name)
            name = destination.name
            if name == ".wh..wh..opq":
                for child in destination.parent.iterdir():
                    remove(child)
                continue
            if name.startswith(".wh."):
                remove(destination.with_name(name[4:]))
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            if member.isdir():
                if destination.exists() and not destination.is_dir() or destination.is_symlink():
                    remove(destination)
                destination.mkdir(exist_ok=True)
            elif member.issym():
                remove(destination)
                link = member.linkname
                # Absolute rootfs links become equivalent relative links so
                # extraction can never follow them into the host filesystem.
                if link.startswith("/"):
                    link = os.path.relpath(ROOT / link.lstrip("/"), destination.parent)
                inside(destination.parent / link)
                destination.symlink_to(link)
            elif member.islnk():
                remove(destination)
                link = target(member.linkname)
                inside(link)
                os.link(link, destination)
            elif member.isfile():
                remove(destination)
                with archive.extractfile(member) as source, destination.open("wb") as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                destination.chmod(member.mode & 0o777)
            # Device nodes/FIFOs are unnecessary: /dev is bound only inside the
            # private mount namespace, after extraction has fully completed.

config = json.loads(blob_path(image["config"]).read_text())
(temporary / "verified-image.json").write_text(json.dumps({"imageDigest": LOCK["dockerImage"]["digest"], "manifestDigest": platform_entry["digest"], "config": image["config"]}, indent=2))
environment = config["config"]["Env"]
for directory in ("src", "dev", "proc"):
    (ROOT / directory).mkdir(exist_ok=True)
helper = OCI / "linux-helper"
proot = helper / LOCK["linuxLauncher"]["filename"]
if not proot.is_file():
    helper.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(LOCK["linuxLauncher"]["url"], timeout=120) as response:
        proot.write_bytes(response.read())
if hashlib.sha256(proot.read_bytes()).hexdigest() != LOCK["linuxLauncher"]["sha256"] or proot.stat().st_size != LOCK["linuxLauncher"]["bytes"]:
    raise RuntimeError("PRoot launcher checksum mismatch")
proot.chmod(0o755)
host_environment = dict(os.environ)
for name in ("usr/bin/npx", "usr/bin/node", "usr/local/bin/npx", "usr/local/bin/node"):
    file = ROOT / name
    print("Image launcher:", name, "exists", file.exists(), "symlink", file.is_symlink(), "target", file.readlink() if file.is_symlink() else "", flush=True)
# PRoot -R also binds host /tmp and HOME. Use the narrow root form instead;
# every build write remains in this private image or the /src task workspace.
subprocess.run([str(proot), "-r", str(ROOT), "-b", "/dev", "-b", "/proc", "-b", "/sys", "-b", str(BUILD / "config") + ":/src", "-w", "/src", "/usr/bin/env", "-i", *environment, "NX_NO_CLOUD=true", "/opencascade.js/scripts/docker-entrypoint.sh", "link", "/src/formnaro_cad.yml"], check=True, env=host_environment)
