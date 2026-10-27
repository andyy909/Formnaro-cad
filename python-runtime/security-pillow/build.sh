#!/usr/bin/env bash
# Run on Linux/WSL with Python 3.14, make, cmake, ninja, pkg-config and a C compiler.
set -euo pipefail
FORMNARO_RECIPE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORMNARO_BUILD_ROOT="${1:?Pass a new absolute build directory}"
case "$FORMNARO_BUILD_ROOT" in /*) ;; *) echo 'Absolute build directory required' >&2; exit 2;; esac
if test -e "$FORMNARO_BUILD_ROOT"; then echo 'Preserve previous builds; choose a new directory' >&2; exit 2; fi
mkdir -p "$FORMNARO_BUILD_ROOT"
"${FORMNARO_PILLOW_HOST_PYTHON:-python3.14}" -m venv "$FORMNARO_BUILD_ROOT/venv"
"$FORMNARO_BUILD_ROOT/venv/bin/python" -m pip install pyodide-build==0.39.2
export PATH="$FORMNARO_BUILD_ROOT/venv/bin:$PATH"
export PYODIDE_JOBS=4
export SOURCE_DATE_EPOCH=1792108800
cd "$FORMNARO_BUILD_ROOT"
pyodide xbuildenv install 314.0.7
pyodide xbuildenv install-emscripten
cp -r "$FORMNARO_RECIPE_ROOT/recipes" ./recipes
pyodide build-recipes Pillow --recipe-dir recipes --build-dir build --log-dir logs --n-jobs 2
sha256sum recipes/Pillow/dist/*.whl
