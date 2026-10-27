"""Download the pinned public builder without a Docker daemon or credentials.

Only image archives are written. Extraction and execution are separate steps.
Every manifest, config and compressed layer is verified against its OCI digest.
"""
import concurrent.futures
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import uuid

argparse.ArgumentParser(description=__doc__).parse_args()

PROJECT = Path(__file__).resolve().parent.parent
DESTINATION = PROJECT / "work" / "cad-v011-build" / "oci"
LOCK = json.loads((PROJECT / "cad-kernel-build" / "upstream-lock.json").read_text(encoding="utf-8-sig"))
REGISTRY = "https://ghcr.io/v2/taucad/opencascade.js"
DESTINATION.mkdir(parents=True, exist_ok=True)
token = json.load(urllib.request.urlopen("https://ghcr.io/token?service=ghcr.io&scope=repository:taucad/opencascade.js:pull", timeout=60))["token"]

def request(url):
    return urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json"})

def manifest(digest):
    with urllib.request.urlopen(request(REGISTRY + "/manifests/" + digest), timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != digest.removeprefix("sha256:"):
        raise RuntimeError("OCI manifest checksum mismatch")
    (DESTINATION / (digest.removeprefix("sha256:") + ".manifest")).write_bytes(data)
    return json.loads(data)

index = manifest(LOCK["dockerImage"]["digest"])
platform = next(item for item in index["manifests"] if item.get("platform") == {"architecture": "amd64", "os": "linux"})
image = manifest(platform["digest"])
(DESTINATION / "image.json").write_text(json.dumps(image, indent=2) + "\n", encoding="utf-8")

def fetch_blob(blob):
    digest = blob["digest"].removeprefix("sha256:")
    target = DESTINATION / (digest + ".blob")
    if target.exists():
        with target.open("rb") as existing:
            hasher = hashlib.file_digest(existing, "sha256")
        if target.stat().st_size == blob["size"] and hasher.hexdigest() == digest:
            return
        # Preserve a damaged/interrupted local download for diagnosis and
        # obtain the immutable blob afresh. Both paths belong to our workspace.
        damaged = target.with_suffix(".corrupt-" + uuid.uuid4().hex)
        if not target.resolve().is_relative_to(DESTINATION.resolve()) or not damaged.resolve().is_relative_to(DESTINATION.resolve()):
            raise RuntimeError("OCI repair path escaped the download directory")
        target.rename(damaged)
        print("Preserved damaged local layer; downloading again", digest[:12], flush=True)
    temporary = target.with_suffix(".partial")
    hasher = hashlib.sha256()
    with urllib.request.urlopen(request(REGISTRY + "/blobs/" + blob["digest"]), timeout=300) as response, temporary.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            hasher.update(chunk)
    with temporary.open("rb") as downloaded:
        disk_hash = hashlib.file_digest(downloaded, "sha256").hexdigest()
    if temporary.stat().st_size != blob["size"] or hasher.hexdigest() != digest or disk_hash != digest:
        raise RuntimeError("Downloaded OCI blob checksum mismatch")
    temporary.rename(target)
    print("Verified builder layer", digest[:12], blob["size"], flush=True)

blobs = list({blob["digest"]: blob for blob in [image["config"], *image["layers"]]}.values())
print("Downloading immutable original Linux builder:", sum(blob["size"] for blob in blobs), "bytes", flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    list(executor.map(fetch_blob, blobs))
print("Pinned OCI builder verified:", platform["digest"], flush=True)
