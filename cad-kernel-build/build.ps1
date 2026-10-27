param(
  [ValidateSet('Docker','Wsl')][string]$Runner='Docker',
  [string]$Distribution='Ubuntu'
)
$ErrorActionPreference='Stop'
$cadProject=Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $cadProject
try {
  node cad-kernel-build/prepare.mjs
  if($LASTEXITCODE -ne 0) {throw 'CAD-Buildvorbereitung fehlgeschlagen.'}
  $cadLock=Get-Content -LiteralPath cad-kernel-build/upstream-lock.json -Raw | ConvertFrom-Json
  $cadConfiguration=(Resolve-Path -LiteralPath work/cad-v011-build/config).Path
  if($Runner -eq 'Docker') {
    docker version --format '{{.Server.Version}}'
    if($LASTEXITCODE -ne 0) {throw 'Docker-Linux-Engine ist nicht erreichbar. Die Buildquellen sind vorbereitet; es wurde kein Dienst gestartet.'}
    $cadImage="ghcr.io/taucad/opencascade.js@$($cadLock.dockerImage.digest)"
    docker run --rm --platform linux/amd64 --network none --mount "type=bind,source=$cadConfiguration,target=/src" $cadImage link formnaro_cad.yml
  } else {
    python cad-kernel-build/fetch-image.py
    if($LASTEXITCODE -ne 0) {throw 'Verifizierter OCI-Download fehlgeschlagen.'}
    $cadLinuxProject=wsl --distribution $Distribution -- wslpath -a $cadProject
    if($LASTEXITCODE -ne 0) {throw 'Vorhandene WSL-Distribution ist nicht erreichbar.'}
    $cadLinuxRunner=$cadLinuxProject.TrimEnd('/')+'/cad-kernel-build/run-image-linux.py'
    wsl --distribution $Distribution -- python3 $cadLinuxRunner
  }
  if($LASTEXITCODE -ne 0) {throw 'CAD-WASM-Link fehlgeschlagen.'}
  node cad-kernel-build/materialize.mjs
  if($LASTEXITCODE -ne 0) {throw 'Verifiziertes CAD-Runtimepaket konnte nicht materialisiert werden.'}
  node cad-kernel-build/verify-runtime.mjs
  if($LASTEXITCODE -ne 0) {throw 'CAD-Runtimepaket hat seine SHA256-Prüfung nicht bestanden.'}
} finally {Pop-Location}
