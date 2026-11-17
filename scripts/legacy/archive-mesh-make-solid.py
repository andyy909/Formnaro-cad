"""Archive the verified package-25 NEW solid approximation application; never replace an older output."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/mesh-make-solid/checks"


def sha(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe(name):
    assert not name.startswith("/") and "\\" not in name
    forbidden = {"..", "daten", "layouts", "projekte", "work", "node_modules", ".git", "__pycache__", "ai-bridge.json", "ai-settings.json"}
    assert not any(p.lower() in forbidden or p.lower().startswith(".env") for p in name.split("/")), name


def main():
    proof = json.loads((WORK / "final-audit.json").read_text(encoding="utf-8"))
    assert proof["ok"] and proof["package25"] and proof["meshMakeSolid"]
    assert not proof["full27PackageAcceptance"]
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert version == proof["version"] == "0.48.0"
    output = Path(f"F:/Formnaro-Ausgaben/Formnaro-Make-Solid-v{version}.zip")
    assert not output.exists() and not output.with_suffix(".zip.sha256").exists(), "P25 archive or sidecar already exists"
    runtime = Path(proof["runtime"])
    expected_release = Path("F:/Formnaro-Ausgaben/Make-Solid-v0.48.0").resolve()
    assert runtime.resolve() == expected_release / "Formnaro-win32-x64", "Unexpected P25 final runtime path"
    marker = expected_release / ".formnaro-paket25-output.json"
    assert marker.is_file() and not marker.is_symlink()
    ownership = json.loads(marker.read_text(encoding="utf-8"))
    assert ownership["format"] == "FormnaroSyntheticReleaseOutput" and ownership["package"] == 25 and ownership["version"] == version and ownership["syntheticOnly"] is True
    assert Path(ownership["workspace"]).resolve() == ROOT.resolve()
    assert (ROOT / "docs/MAKE-SOLID.md").is_file(), "Required public guide missing"
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
    inspector = WORK.parent / "inspect-files.py"
    for prefix in ["source", "packaged"]:
        independent = json.loads((WORK / f"independent-files-{prefix}.json").read_text(encoding="utf-8"))
        assert independent["ok"] and independent["inspectorSha256"] == sha(inspector)
    entries.append(("Pruefnachweise/inspect-files.py", inspector))
    for name in ["final-audit.json", *sorted(evidence)]:
        entries.append(("Pruefnachweise/" + name, WORK / name))
    # Only explicit generated files from the isolated P14/P15/P16/P17 tests are included.
    # No profile directory or previously used release is traversed here.
    selection_artifacts = []
    for suite, folder in [("make-solid", "MakeSolid"), ("erase-fill", "BereicheErsetzen"), ("smooth", "Glaetten"), ("remesh", "Neuvernetzen"), ("reduce", "Vereinfachen"), ("connectors", "Steckverbinder"), ("partition", "Netzteilen"), ("hole", "OeffnungSchliessen"), ("mesh-selection", "Netzauswahl"), ("inspector", "Netzinspektor"), ("repair", "Netzreparatur")]:
        for prefix, label in [("source", "Quelle"), ("packaged", "EXE")]:
            selection = json.loads((WORK / f"{prefix}-{suite}.json").read_text(encoding="utf-8"))
            assert selection["package25" if suite == "make-solid" else "package24" if suite == "erase-fill" else "package23" if suite == "smooth" else "package22" if suite == "remesh" else "package21" if suite == "reduce" else "package20" if suite == "connectors" else "package19" if suite == "partition" else "package18" if suite == "hole" else "package17" if suite == "repair" else "package16" if suite == "inspector" else "package15"] and selection["isolatedProfile"] and selection["normalFileIpc"]
            assert selection["syntheticArtifacts"]
            for artifact in selection["syntheticArtifacts"]:
                assert Path(artifact["name"]).name == artifact["name"] and "\\" not in artifact["name"]
                file = Path(artifact["file"])
                assert file.is_absolute() and file.is_file() and not file.is_symlink()
                assert file.stat().st_size == artifact["bytes"] and sha(file) == artifact["sha256"]
                target = f"Pruefnachweise/{folder}/{label}/{artifact['name']}"
                safe(target)
                entries.append((target, file))
                selection_artifacts.append({"file": target, "sha256": artifact["sha256"]})
    assert len({name for name, _ in entries}) == len(entries), "Duplicate archive path"
    manifest = {
        "version": version,
        "package16": True,
        "package17": True,
        "package18": True,
        "package19": True,
        "package20": True,
        "package21": True,
        "package22": True,
        "package23": True,
        "package24": True,
        "package25": True,
        "meshMakeSolid": True,
        "meshEraseFill": True,
        "meshSmooth": True,
        "meshRemesh": True,
        "meshReduce": True,
        "meshConnectors": True,
        "meshPartition": True,
        "meshHoleFill": True,
        "meshSimpleRepair": True,
        "meshInspector": True,
        "brushLassoProtection": True,
        "meshSurfaceSelection": True,
        "full27PackageAcceptance": False,
        "includesUserData": False,
        "selectionArtifactsSynthetic": True,
        "files": [{"file": name, "bytes": file.stat().st_size, "sha256": sha(file)} for name, file in entries],
    }
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=1, allowZip64=True) as z:
        for name, file in entries:
            safe(name)
            z.write(file, name, compress_type=zipfile.ZIP_STORED if file.suffix == ".zip" else zipfile.ZIP_DEFLATED)
        z.writestr("Paket-Pruefung.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        z.writestr("START-HIER.txt", f"Formnaro {version} – Make Solid als neue verglichene Annäherung\n\nGanzes Archiv separat in einen kurzen lokalen Ordner entpacken, etwa C:\\Formnaro048. App/Formnaro.exe starten. Im Modus Normal ein Netzteil wählen und unter Netz-Werkzeuge Make Solid öffnen. App/MAKE-SOLID.md erklärt die Auflösung, den Originalvergleich und die Grenzen der neuen Annäherung. Das Original bleibt erhalten; nur der ausdrücklich bestätigte neue Körper wird angelegt. Vorschau, Originalvergleich, Abbrechen und Undo sind enthalten. Easy Tinker wurde mitgeprüft. Originalquellen, passende Kernelquellen, Lizenzen und synthetische Prüfnachweise liegen bei. Bisherige Programme bleiben erhalten. Paket26 und weitere Netzverfahren bleiben eigene Arbeitspakete.\n")

    print("Archiv erstellt; CRC und sämtliche Einzelhashes werden geprüft.", flush=True)
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        assert set(z.namelist()) == {entry["file"] for entry in manifest["files"]} | {"Paket-Pruefung.json", "START-HIER.txt"}
        for entry in manifest["files"]:
            with z.open(entry["file"]) as stream:
                assert hashlib.file_digest(stream, "sha256").hexdigest() == entry["sha256"], entry["file"]
    result = {"ok": True, "version": version, "package16": True,
        "package17": True,
        "package18": True,
        "package19": True,
        "package20": True,
        "package21": True,
        "package22": True,
        "package23": True,
        "package24": True,
        "package25": True,
        "meshMakeSolid": True,
        "meshEraseFill": True,
        "meshSmooth": True,
        "meshRemesh": True,
        "meshReduce": True,
        "meshConnectors": True,
        "meshPartition": True,
        "meshHoleFill": True,
        "meshSimpleRepair": True,
        "meshInspector": True,
        "brushLassoProtection": True, "meshSurfaceSelection": True, "full27PackageAcceptance": False, "file": str(output), "bytes": output.stat().st_size, "sha256": sha(output), "sourceSha256": sha(source), "entries": len(entries) + 2, "crcVerified": True, "allFileHashesVerified": True, "includesUserData": False, "selectionArtifactsSynthetic": True, "selectionArtifacts": selection_artifacts}
    (WORK / "archives.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    output.with_suffix(".zip.sha256").write_text(result["sha256"] + "  " + output.name + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
