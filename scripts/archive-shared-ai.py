"""Archive only a verified shared-AI release; never replace older outputs."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/shared-ai/checks"


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe(name):
    assert not name.startswith("/") and "\\" not in name
    forbidden = {"..", "daten", "layouts", "projekte", "work", "node_modules", ".git", "__pycache__", "ai-bridge.json", "ai-settings.json"}
    assert not any(p.lower() in forbidden or p.lower().startswith(".env") for p in name.split("/")), name


def main():
    proof = json.loads((WORK / "final-audit.json").read_text(encoding="utf-8"))
    assert proof["ok"] and proof["sharedAI"] and not proof["full27PackageAcceptance"]
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert proof["version"] == version
    runtime = Path(proof["runtime"])
    assert sha(runtime / "Formnaro.exe") == proof["exeSha256"]
    assert sha(runtime / "resources/app.asar") == proof["asarSha256"]
    # Freeze every external runtime file too, including the converter, licences
    # and Electron libraries; an archive must contain the audited build bytes.
    runtime_files = {entry["file"]: entry["sha256"] for entry in proof["runtimeFiles"]}
    actual_files = {file.relative_to(runtime).as_posix() for file in runtime.rglob("*") if file.is_file()}
    assert actual_files == runtime_files.keys(), "Runtime file set changed after build"
    for name, digest in runtime_files.items():
        file = runtime / name
        assert not file.is_symlink() and sha(file) == digest, name
    for name, digest in {**proof["proofs"], **proof["packagedProofs"]}.items():
        assert sha(WORK / name) == digest, name
    source = runtime.parent / f"Formnaro-Quellcode-v{version}.zip"
    kernel = ROOT / "release-formnaro-stl-konverter-v0.12.1/Formnaro-CAD-Quellen-v0.12.zip"
    # Match the unchanged native kernel's corresponding source inputs.
    with zipfile.ZipFile(kernel) as z:
        assert z.testzip() is None
        for file in ["upstream-lock.json", "wrappers/formnaro-cad-bridge.cpp"]:
            assert z.read("cad-kernel-build/" + file) == (ROOT / "cad-kernel-build" / file).read_bytes()
        assert z.read("generated/build-inputs.json") == (ROOT / "cad-kernel-build/runtime/build-inputs.json").read_bytes()
        for entry in json.loads((ROOT / "cad-kernel-build/upstream-lock.json").read_text(encoding="utf-8"))["sources"]:
            data = z.read("upstream/" + entry["file"])
            assert len(data) == entry["bytes"] and hashlib.sha256(data).hexdigest() == entry["sha256"]
    with zipfile.ZipFile(source, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
        for entry in proof["sourceManifest"]:
            safe(entry["file"])
            file = ROOT / entry["file"]
            assert sha(file) == entry["sha256"], entry["file"]
            z.write(file, entry["file"])
    with zipfile.ZipFile(source) as z:
        assert z.testzip() is None
        for entry in proof["sourceManifest"]:
            with z.open(entry["file"]) as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"]
    entries = []
    for file in sorted(runtime.rglob("*")):
        assert not file.is_symlink()
        if file.is_file():
            relative = file.relative_to(runtime).as_posix()
            assert sha(file) == runtime_files[relative], relative
            name = "App/" + relative
            safe(name)
            entries.append((name, file))
    entries += [(source.name, source), (kernel.name, kernel)]
    for name in ["final-audit.json", "regressions.log", "ai-regressions.log", "shared-ai.log", "converter.log", "source-ai.json", "source-converter.json", "packaged-ai.json", "packaged-converter.json"]:
        entries.append(("Pruefnachweise/" + name, WORK / name))
    manifest = {"version": version, "sharedAI": True, "includesUserData": False, "files": [{"file": name, "bytes": file.stat().st_size, "sha256": sha(file)} for name, file in entries]}
    output = ROOT / f"output/Formnaro-Gemeinsame-KI-v{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
        for name, file in entries:
            safe(name)
            z.write(file, name, compress_type=zipfile.ZIP_STORED if file.suffix == ".zip" else zipfile.ZIP_DEFLATED)
        z.writestr("Paket-Pruefung.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        z.writestr("START-HIER.txt", f"Formnaro {version} – Gemeinsame KI-Anbindung\n\nIn einen eigenen kurzen lokalen Ordner entpacken, zum Beispiel C:\\Formnaro0281.\nApp/Formnaro.exe starten. App/GEMEINSAME-KI-ANBINDUNG.md erklärt die gemeinsame API für CAD-Chat und eingebauten Konverter. Anbieter, Modell und Schlüssel einmal unter Einstellungen → KI / API einrichten. Der Solo-Konverter behält seine eigene Einrichtung. Neuere Solo-Maßrezepte sind noch nicht integriert.\nQuellen, passende Kernelquellen, Lizenzen und Prüfnachweise sind enthalten. Persönliche Daten und Schlüssel werden nicht ausgeliefert. Ein begrenzter Teil von Paket 12 wurde vorgezogen; 10/11 und der Rest von 12 bleiben offen.\n")
    print("Archiv erstellt; CRC und sämtliche Einzelhashes werden geprüft.", flush=True)
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        for entry in manifest["files"]:
            with z.open(entry["file"]) as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"], entry["file"]
    result = {"ok": True, "version": version, "file": str(output), "bytes": output.stat().st_size, "sha256": sha(output), "sourceSha256": sha(source), "entries": len(entries) + 2, "crcVerified": True, "allFileHashesVerified": True, "includesUserData": False}
    (WORK / "archives.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    output.with_suffix(".zip.sha256").write_text(result["sha256"] + "  " + output.name + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
