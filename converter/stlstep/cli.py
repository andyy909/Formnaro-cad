from __future__ import annotations
import argparse
from dataclasses import replace
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description="Lokaler STL-zu-STEP-Konverter")
    parser.add_argument("input", nargs="?", type=Path)
    parser.add_argument("output", nargs="?", type=Path)
    parser.add_argument("--gui", action="store_true")
    parser.add_argument("--tolerance", type=float, default=0.15, help="Abweichungsbudget in mm")
    parser.add_argument("--unit", choices=["mm", "cm", "inch"], default="mm")
    parser.add_argument("--mode", choices=["auto", "smooth", "planar", "exact"], default="auto",
                        help="auto: Flächenregionen, Profile/Primitive, gekrümmte Flächen, planare Näherung, Facetten")
    parser.add_argument("--rounds", choices=["keep", "chamfer"], default="keep")
    parser.add_argument("--target-faces", type=int, default=500)
    parser.add_argument("--samples", type=int, default=6000)
    parser.add_argument("--no-fallback", action="store_true")
    parser.add_argument("--repair", action="store_true", help="Netz vor dem CAD-Aufbau mit Abweichungsprüfung reparieren")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--regions",type=Path,help="Gespeicherte Regionskorrektur am gleichen Originalnetz und Budget")
    args = parser.parse_args()
    if args.gui or args.input is None:
        from .gui import main as gui_main
        gui_main()
        return
    from .engine import Options, convert, ConversionError
    output = args.output or args.input.with_suffix(".step")
    options = Options(tolerance=args.tolerance, unit={"mm": 1.0, "cm": 10.0, "inch": 25.4}[args.unit],
                      mode=args.mode, rounds=args.rounds, target_faces=args.target_faces,
                      samples=args.samples, fallback=not args.no_fallback, repair=args.repair)
    try:
        if args.regions:
            if args.regions.stat().st_size>5_000_000:
                raise ConversionError('Die Regionskorrektur ist zu groß.')
            options=replace(options,region_edits=json.loads(args.regions.read_text(encoding='utf-8')))
        report = convert(args.input, output, options, lambda s: print(s, file=sys.stderr), overwrite=args.overwrite)
    except (ConversionError, OSError,ValueError) as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
