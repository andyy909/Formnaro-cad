"""Archive the verified package-13 application; never replace an older output."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/release-acceptance/checks"


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe(name):
    assert not name.startswith("/") and "\\" not in name
    forbidden = {"..", "daten", "layouts", "projekte", "work", "node_modules", ".git", "__pycache__", "ai-bridge.json", "ai-settings.json"}
    assert not any(p.lower() in forbidden or p.lower().startswith(".env") for p in name.split("/")), name


def main():
    proof = json.loads((WORK / "final-audit.json").read_text(encoding="utf-8"))
    assert proof["ok"] and proof["package13"] and proof["firstCommonProgramAcceptance"]
    assert not proof["full27PackageAcceptance"]
    assert proof["comparisonRule"] == "cad-stats-12-significant-digits-v1"
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert version == proof["version"] == "0.32.0"
    runtime = Path(proof["runtime"])
    assert sha(runtime / "Formnaro.exe") == proof["exeSha256"]
    assert sha(runtime / "resources/app.asar") == proof["asarSha256"]
    # The new runtime is wholly synthetic/fresh. Never enumerate an old, used app.
    runtime_files = {entry["file"]: entry["sha256"] for entry in proof["runtimeFiles"]}
    actual_files = {file.relative_to(runtime).as_posix() for file in runtime.rglob("*") if file.is_file()}
    assert actual_files == runtime_files.keys(), "Runtime file set changed after build"
    for name, digest in runtime_files.items():
        file = runtime / name
        assert not file.is_symlink() and sha(file) == digest, name
    evidence = {**proof["proofs"], **proof["packagedProofs"]}
    for name, digest in evidence.items():
        assert sha(WORK / name) == digest, name
    source = runtime.parent / f"Formnaro-Quellcode-v{version}.zip"
    kernel = ROOT / "release-formnaro-stl-konverter-v0.12.1/Formnaro-CAD-Quellen-v0.12.zip"
    # The unchanged CAD kernel must carry the matching corresponding source.
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
        assert set(z.namelist()) == {entry["file"] for entry in proof["sourceManifest"]}
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
    for name in ["final-audit.json", *sorted(evidence)]:
        entries.append(("Pruefnachweise/" + name, WORK / name))
    # Only explicit generated acceptance paths from the reports are included.
    # These synthetic models document the physical save/restart/export chain.
    workflow_artifacts = []
    for prefix, label in [("source", "Quelle"), ("packaged", "EXE")]:
        first = json.loads((WORK / f"{prefix}-workflow-phase1.json").read_text(encoding="utf-8"))
        reopened = json.loads((WORK / f"{prefix}-workflow-reopen.json").read_text(encoding="utf-8"))
        artifacts = [
            ("Projekt" + Path(first["projectFile"]).suffix, first["projectFile"], first["projectSha256"]),
            ("Uebergabe.json", first["handshake"], first["handshakeSha256"]),
            ("Wieder-geoeffnet" + Path(reopened["roundtripFile"]).suffix, reopened["roundtripFile"], reopened["roundtripSha256"]),
            ("Weiterbearbeitet" + Path(reopened["continuationFile"]).suffix, reopened["continuationFile"], reopened["continuationSha256"]),
        ]
        for index, export in enumerate(reopened["exports"], 1):
            suffix = Path(export["file"]).suffix
            artifacts.append((f"Export-{index}{suffix}", export["file"], export["sha256"]))
        for name, original, digest in artifacts:
            file = Path(original)
            assert file.is_file() and not file.is_symlink() and sha(file) == digest, original
            target = f"Pruefnachweise/Arbeitsablauf/{label}/{name}"
            entries.append((target, file))
            workflow_artifacts.append({"file": target, "sha256": digest})
    assert len({name for name, _ in entries}) == len(entries), "Duplicate archive path"
    manifest = {
        "version": version,
        "package13": True,
        "firstCommonProgramAcceptance": True,
        "full27PackageAcceptance": False,
        "includesUserData": False,
        "workflowArtifactsSynthetic": True,
        "comparisonRule": proof["comparisonRule"],
        "files": [{"file": name, "bytes": file.stat().st_size, "sha256": sha(file)} for name, file in entries],
    }
    output = ROOT / f"output/Formnaro-Gesamtabnahme-v{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
        for name, file in entries:
            safe(name)
            z.write(file, name, compress_type=zipfile.ZIP_STORED if file.suffix == ".zip" else zipfile.ZIP_DEFLATED)
        z.writestr("Paket-Pruefung.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        z.writestr("START-HIER.txt", f"Formnaro {version} – Erste gemeinsame Gesamtabnahme\n\nGanzes Archiv in einen eigenen kurzen lokalen Ordner entpacken, etwa C:\\Formnaro032.\nApp/Formnaro.exe starten. App/GESAMTABNAHME-FORMNARO.md beschreibt den geprüften Ablauf: importieren, bearbeiten, konvertieren, speichern, Anwendung beenden, wieder öffnen und exportieren. CAD-Körper, geschlossene und offene Netze bleiben im gemeinsamen Projekt erhalten.\nPaket 13 nimmt das gemeinsame Programm ab. Die späteren Netzverfahren aus Paketen 14–27 werden damit nicht als abgeschlossen bezeichnet. Bei Mit KI wird die vorhandene gemeinsame Formnaro-Verbindung verwendet; Ohne KI konvertiert lokal. Die Abnahme verwendete ausschließlich lokale synthetische KI-Antworten.\nQuellen, passende native Kernelquellen, Lizenzen, unveränderte Anwendungsberichte und Nachweise der erfolgreichen Prozessenden sind enthalten. Modelle unter Pruefnachweise/Arbeitsablauf sind eigens erzeugte Testteile; persönliche Modelle, Profile oder Schlüssel sind nicht enthalten. Alte Programme bleiben erhalten.\n")
    print("Archiv erstellt; CRC und sämtliche Einzelhashes werden geprüft.", flush=True)
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == {entry["file"] for entry in manifest["files"]} | {"Paket-Pruefung.json", "START-HIER.txt"}
        for entry in manifest["files"]:
            with z.open(entry["file"]) as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"], entry["file"]
    result = {"ok": True, "version": version, "package13": True, "firstCommonProgramAcceptance": True, "full27PackageAcceptance": False, "file": str(output), "bytes": output.stat().st_size, "sha256": sha(output), "sourceSha256": sha(source), "entries": len(entries) + 2, "crcVerified": True, "allFileHashesVerified": True, "includesUserData": False, "workflowArtifactsSynthetic": True, "workflowArtifacts": workflow_artifacts}
    (WORK / "archives.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    output.with_suffix(".zip.sha256").write_text(result["sha256"] + "  " + output.name + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
