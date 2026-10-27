$ErrorActionPreference = 'Stop'
$proofRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../work/cad-independent-step'))
New-Item -ItemType Directory -Path $proofRoot -Force | Out-Null
function FetchVerified($name, $url, $sha256) {
  $destination = Join-Path $proofRoot $name
  if (-not (Test-Path -LiteralPath $destination)) {
    Invoke-WebRequest -Uri $url -OutFile $destination
  }
  $stream = [IO.File]::OpenRead($destination)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $actualHash = [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $algorithm.Dispose() }
  if ($actualHash -ne $sha256) {
    throw "Checksum mismatch: $name"
  }
}
FetchVerified 'FreeCAD_1.1.4-Windows-x86_64-py311.7z' 'https://github.com/FreeCAD/FreeCAD/releases/download/1.1.4/FreeCAD_1.1.4-Windows-x86_64-py311.7z' '4828741fc91ee37fafcdb97a1abacb18b04ba451ac4372d9ff7a7349b36f4d6d'
FetchVerified '7zr.exe' 'https://github.com/ip7z/7zip/releases/download/26.04/7zr.exe' '256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282'
FetchVerified 'steputils-source.zip' 'https://codeload.github.com/mozman/steputils/zip/547860b349a36cf24c564d6c87ffd8f60484f6fb' '4848d0957de54be6853db1b33dc35c83306757cf8f047700ebbf8ca5aa61a215'
& (Join-Path $proofRoot '7zr.exe') l -slt (Join-Path $proofRoot 'FreeCAD_1.1.4-Windows-x86_64-py311.7z') | Set-Content -LiteralPath (Join-Path $proofRoot 'freecad-archive-list.txt') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Portable archive inventory failed' }
if (-not (Test-Path -LiteralPath (Join-Path $proofRoot 'freecad/FreeCAD_1.1.4-Windows-x86_64-py311/bin/FreeCADCmd.exe'))) {
  & python (Join-Path $PSScriptRoot 'extract-freecad.py')
  if ($LASTEXITCODE -ne 0) { throw 'Portable reader extraction failed' }
}
foreach ($script in @('export-fixture.mjs', 'export-complex-fixture.mjs')) {
  & node (Join-Path $PSScriptRoot $script)
  if ($LASTEXITCODE -ne 0) { throw "Fixture creation failed: $script" }
}
& python (Join-Path $PSScriptRoot 'parse-independent.py')
if ($LASTEXITCODE -ne 0) { throw 'Independent Part21 syntax/graph proof failed' }
foreach ($fixture in @('formnaro-ap214', 'formnaro-complex')) {
  & python (Join-Path $PSScriptRoot 'freecad-run.py') $fixture
  if ($LASTEXITCODE -ne 0) { throw "Independent native reader proof failed: $fixture" }
}
& node (Join-Path $PSScriptRoot 'verify-freecad-geometry.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Independent imported geometry cross-check failed' }
