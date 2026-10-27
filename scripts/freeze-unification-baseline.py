"""Freeze public working sources (including untracked files) before unification.

Read-only for both products and all existing releases. Archives are exclusive:
an existing baseline can never be replaced. Profiles, work files and models are
outside the explicit source roots. No dependency on a clean Git checkout.
"""
import hashlib
import json
import re
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NET = ROOT.parent / "formnaro-netz"
DIRECTORIES = ("src", "backend", "scripts", "tests", "docs", "licenses", "ai", "converter", "cad-kernel-build")
FILES = ("AGENTS.md", "package.json", "package-lock.json", "electron.cjs", "preload.cjs", "index.html", "vite.config.js", "LICENSE.txt", "README.md", "LIES-MICH.txt", "THIRD-PARTY-LICENSES.txt", ".gitignore", ".gitattributes")
FORBIDDEN = {"work", "daten", "projekte", "layouts", "node_modules", ".git", "__pycache__", "ai-bridge.json", "ai-settings.json"}
RELEASES = (
    ("cad", "output/Formnaro-Austauschformate-v0.23.0-Portable.zip", "fbc684b458990679b64cd4aa1924fe1408adc10fc13e228ab9c98b996f3cd77d"),
    ("cad", "release-formnaro-exchange-v0.23.0/Formnaro-CAD-Quellcode-v0.23.0.zip", "d6a5cc706a761dd2f09818f6f43926ad962fc970931e0cb89e95aff90bf66e8f"),
    ("netz", "output/Formnaro-Netz-v0.21.0-Portable-2026-10-15.zip", "2bfdf9de2e4bfe9b893414dfa0a390ec44d39345e12f576d58bc2c0a0b7f6891"),
    ("netz", "output/Formnaro-Netz-Quellcode-v0.21.0.zip", "067d0429161a56b89350b8f81794b8a7b633af5714b3e767ed817f83e3619331"),
)


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def public_sources(root):
    result = []

    def collect(file):
        rel = file.relative_to(root)
        if any(p.lower() in FORBIDDEN or p.lower().startswith(".env") for p in rel.parts):
            return
        if rel.parts[0] == "converter" and len(rel.parts) > 1 and rel.parts[1].startswith("runtime"):
            return
        if file.is_symlink():
            raise ValueError(f"Symbolischer Verweis im Quellstand: {rel}")
        if file.is_dir():
            for child in sorted(file.iterdir()):
                collect(child)
        elif file.suffix not in {".pyc", ".pyo", ".log", ".tmp"}:
            result.append(file)

    for name in DIRECTORIES + FILES:
        if (root / name).exists():
            collect(root / name)
    return result


def inventory(root, variant):
    """Record concrete UI action IDs and plugin entry points, not parity claims."""
    entries = {}
    files = [root / "index.html"]
    files += sorted((root / "src").glob("cad-*.js" if variant == "cad" else "*.js"))
    for file in files:
        if variant == "netz" and file.name.startswith("cad-"):
            continue
        source = file.read_text(encoding="utf-8")
        actions = set(re.findall(r'data-action=["\']([a-z][a-z0-9-]*)["\']', source))
        match = re.search(r"FUNCTION_ACTIONS=Object\.freeze\(\[([^]]+)\]", source)
        if match:
            actions.update(re.findall(r"'([a-z][a-z0-9-]*)'", match[1]))
        for action in sorted(actions):
            entries.setdefault(action, []).append(file.relative_to(root).as_posix())
    return [{"action": action, "entryPoints": files, "integrationStatus": "pending"} for action, files in sorted(entries.items())]


def main():
    roots = {"cad": ROOT, "netz": NET}
    # Validate all historical hashes before making a new baseline directory.
    releases = []
    for variant, name, expected in RELEASES:
        file = roots[variant] / name
        actual = sha(file)
        if actual != expected:
            raise ValueError(f"Geprüfte Ausgangsausgabe verändert: {variant}/{name}")
        releases.append({"variant": variant, "file": name, "bytes": file.stat().st_size, "sha256": actual})
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    destination = ROOT / "work/unification" / ("baseline-" + stamp)
    destination.mkdir(parents=True, exist_ok=False)
    result = {"format": "Formnaro-Unification-Baseline", "version": 1, "created": stamp, "ok": False, "historicalReleases": releases, "includesUserData": False, "sources": {}}
    for variant, root in roots.items():
        files = public_sources(root)
        manifest = [{"file": file.relative_to(root).as_posix(), "bytes": file.stat().st_size, "sha256": sha(file)} for file in files]
        archive = destination / (variant + "-working-source.zip")
        with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
            for file, entry in zip(files, manifest):
                z.write(file, entry["file"])
            z.writestr("BASELINE-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for entry in manifest:
                with z.open(entry["file"]) as stream:
                    assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"], entry["file"]
                assert sha(root / entry["file"]) == entry["sha256"], "Source changed while freezing: " + entry["file"]
        status = subprocess.run(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=root, capture_output=True, text=True, check=True)
        (destination / (variant + "-git-status.txt")).write_text(status.stdout, encoding="utf-8")
        actions = inventory(root, variant)
        (destination / (variant + "-functions.json")).write_text(json.dumps(actions, ensure_ascii=False, indent=2), encoding="utf-8")
        result["sources"][variant] = {"file": archive.name, "bytes": archive.stat().st_size, "sha256": sha(archive), "files": len(manifest), "crcVerified": True, "allFileHashesVerified": True, "uiActions": len(actions)}
        print(f"{variant}: {len(manifest)} Quelldateien, {len(actions)} erfasste Oberflächenbefehle gesichert und geprüft.", flush=True)
    # A second read proves no historical archive was replaced during the freeze.
    for entry in releases:
        assert sha(roots[entry["variant"]] / entry["file"]) == entry["sha256"]
    result["ok"] = True
    (destination / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "report": str(destination / "result.json"), "sources": result["sources"]}), flush=True)


if __name__ == "__main__":
    main()
