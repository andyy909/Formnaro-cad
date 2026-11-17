[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Inspect','Apply','Rollback')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$PrivateTestCopy,
  [Parameter(Mandatory=$true)][string]$PatchZip,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedZipSha256
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Require-LocalPath([string]$Path, [bool]$Directory = $false) {
  $item = Get-Item -LiteralPath $Path
  if ($item.PSIsContainer -ne $Directory -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Unexpected file type at $Path"
  }
  $item.FullName
}

function Confirm-Identity([string]$Path, $Identity) {
  $length = (Get-Item -LiteralPath $Path).Length
  if ($length -ne $Identity.bytes -or (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Identity.sha256) {
    throw "Patch identity differs at $Path"
  }
}

function Confirm-Closed {
  $running = Get-CimInstance Win32_Process -Filter "Name='Formnaro.exe'"
  if ($running | Where-Object { $_.ExecutablePath -eq $exe }) {
    throw 'Close Formnaro in this private test copy before applying or rolling back.'
  }
}

function Confirm-TrustedArchiveEntry($Entry, $Identity) {
  if ($Entry.Length -ne $Identity.bytes) { throw 'Patch payload size differs.' }
  $digest = [Security.Cryptography.SHA256]::Create()
  $stream = $Entry.Open()
  try {
    $actual = [BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','')
    if ($actual -ne $Identity.sha256) { throw 'Patch payload SHA-256 differs.' }
  } finally {
    $stream.Dispose()
    $digest.Dispose()
  }
}

$program = Require-LocalPath $PrivateTestCopy $true
$resources = Require-LocalPath (Join-Path $program 'resources') $true
$exe = Require-LocalPath (Join-Path $program 'Formnaro.exe')
$asar = Require-LocalPath (Join-Path $resources 'app.asar')
$zipPath = Require-LocalPath $PatchZip
$zipFile = [IO.File]::Open($zipPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
$archive = $null
$stage = $null
$lock = $null
try {
  $digest = [Security.Cryptography.SHA256]::Create()
  try { $zipHash = [BitConverter]::ToString($digest.ComputeHash($zipFile)).Replace('-','') }
  finally { $digest.Dispose() }
  if ($zipHash -ne $ExpectedZipSha256) { throw 'Patch ZIP SHA-256 differs.' }
  $zipFile.Position = 0
  $archive = [IO.Compression.ZipArchive]::new($zipFile,[IO.Compression.ZipArchiveMode]::Read,$true)
  $validNames = @('Manifest.json','app.asar')
  if ($archive.Entries.Count -ne 2 -or ($archive.Entries.FullName | Where-Object { $_ -cnotin $validNames })) {
    throw 'Unexpected patch contents.'
  }
  $manifestEntry = $archive.GetEntry('Manifest.json')
  $payload = $archive.GetEntry('app.asar')
  if (!$manifestEntry -or !$payload -or $manifestEntry.Length -gt 16384) { throw 'Invalid patch entries.' }
  $reader = [IO.StreamReader]::new($manifestEntry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($manifest.format -cne 'FormnaroPrivateAsarPatch' -or $manifest.version -ne 1 -or $manifest.platform -cne 'win32-x64' -or
      $manifest.baseCommit -cnotmatch '^[a-f0-9]{40}$' -or $manifest.sourceCommit -cnotmatch '^[a-f0-9]{40}$') {
    throw 'Unsupported patch manifest.'
  }
  foreach ($entry in @($manifest.baseExe,$manifest.baseArchive,$manifest.targetArchive)) {
    if ($null -eq $entry -or $entry.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
        ($entry.bytes -isnot [int] -and $entry.bytes -isnot [long]) -or $entry.bytes -le 0) {
      throw 'Invalid patch identity.'
    }
  }
  if ($manifest.baseArchive.sha256 -eq $manifest.targetArchive.sha256) { throw 'The patch contains the existing archive.' }
  Confirm-TrustedArchiveEntry $payload $manifest.targetArchive
  Confirm-Closed
  $before = $manifest.baseArchive
  $after = $manifest.targetArchive
  if ($Mode -eq 'Rollback') { $before, $after = $after, $before }
  Confirm-Identity $exe $manifest.baseExe
  Confirm-Identity $asar $before
  if ($Mode -eq 'Inspect') { $manifest; return }

  $lockPath = Join-Path $resources 'formnaro-private-patch.lock'
  if (Test-Path -LiteralPath $lockPath) { [void](Require-LocalPath $lockPath) }
  $lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  $backup = Join-Path $resources ('app.asar.before-' + $manifest.targetArchive.sha256)
  if ($Mode -eq 'Rollback') {
    $backup = Require-LocalPath $backup
    Confirm-Identity $backup $after
    $stage = Join-Path $resources ('app.asar.rollback-' + [guid]::NewGuid())
    [IO.File]::Copy($backup,$stage)
  } else {
    if (Test-Path -LiteralPath $backup) {
      [void](Require-LocalPath $backup)
      Confirm-Identity $backup $before
    }
    $stage = Join-Path $resources ('app.asar.pending-' + [guid]::NewGuid())
    [IO.Compression.ZipFileExtensions]::ExtractToFile($payload,$stage)
  }

  Confirm-Identity $stage $after
  Confirm-Identity $asar $before
  Confirm-Closed
  if ($Mode -eq 'Apply' -and !(Test-Path -LiteralPath $backup)) {
    [IO.File]::Replace($stage,$asar,$backup)
  } else {
    [IO.File]::Replace($stage,$asar,$null)
  }
  Confirm-Identity $asar $after
  [pscustomobject]@{mode=$Mode;archiveSha256=$after.sha256;sourceCommit=$manifest.sourceCommit}
} finally {
  if ($lock) { $lock.Dispose() }
  if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage }
  if ($archive) { $archive.Dispose() }
  $zipFile.Dispose()
}
