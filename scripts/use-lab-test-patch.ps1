[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Inspect','Apply','Rollback')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$PrivateTestCopy,
  [Parameter(Mandatory=$true)][string]$PatchZip,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedZipSha256
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
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

function Expand-LabDelta($Payload, [string]$Base, [string]$Output, [long]$TargetSize) {
  $reader = [IO.BinaryReader]::new($Payload.Open())
  $source = [IO.File]::OpenRead($Base)
  $dest = [IO.File]::Open($Output,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {
    if ([Text.Encoding]::ASCII.GetString($reader.ReadBytes(8)) -cne 'FNLAB001') { throw 'Invalid lab delta header.' }
    $buffer = [byte[]]::new(65536)
    while ($dest.Position -lt $TargetSize) {
      $kind = $reader.ReadByte()
      if ($kind -eq 1) {
        $offset = $reader.ReadInt32()
        $size = $reader.ReadInt32()
        if ($offset -lt 0 -or ([long]$offset + $size) -gt $source.Length) { throw 'Invalid base range.' }
        $source.Position = $offset
        $inputStream = $source
      } elseif ($kind -eq 0) {
        $size = $reader.ReadInt32()
        $inputStream = $reader.BaseStream
      } else { throw 'Invalid lab delta record.' }
      if ($size -le 0 -or $dest.Position + $size -gt $TargetSize) { throw 'Invalid lab delta size.' }
      while ($size -gt 0) {
        $count = $inputStream.Read($buffer,0,[Math]::Min($size,$buffer.Length))
        if ($count -le 0) { throw 'Incomplete lab delta.' }
        $dest.Write($buffer,0,$count)
        $size -= $count
      }
    }
    if ($reader.BaseStream.ReadByte() -ne -1) { throw 'Trailing lab delta bytes.' }
  } finally { $dest.Dispose(); $source.Dispose(); $reader.Dispose() }
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
$temporaryBackup = $null
try {
  $digest = [Security.Cryptography.SHA256]::Create()
  try { $zipHash = [BitConverter]::ToString($digest.ComputeHash($zipFile)).Replace('-','') }
  finally { $digest.Dispose() }
  if ($zipHash -ne $ExpectedZipSha256) { throw 'Patch ZIP SHA-256 differs.' }
  $zipFile.Position = 0
  $archive = [IO.Compression.ZipArchive]::new($zipFile,[IO.Compression.ZipArchiveMode]::Read,$true)
  $payloadName = if ($archive.GetEntry('Labor.delta')) { 'Labor.delta' } else { 'app.asar' }
  $validNames = @('Manifest.json',$payloadName)
  if ($archive.Entries.Count -ne 2 -or ($archive.Entries.FullName | Where-Object { $_ -cnotin $validNames })) {
    throw 'Unexpected patch contents.'
  }
  $manifestEntry = $archive.GetEntry('Manifest.json')
  $payload = $archive.GetEntry($payloadName)
  if (!$manifestEntry -or !$payload -or $manifestEntry.Length -gt 16384) { throw 'Invalid patch entries.' }
  $reader = [IO.StreamReader]::new($manifestEntry.Open())
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($manifest.format -cne 'FormnaroPrivateAsarPatch' -or (($manifest.version -ne 1 -or $payloadName -ne 'app.asar') -and ($manifest.version -ne 2 -or $payloadName -ne 'Labor.delta')) -or $manifest.platform -cne 'win32-x64' -or
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
  if ($manifest.version -eq 2) { Confirm-TrustedArchiveEntry $payload $manifest.delta }
  else { Confirm-TrustedArchiveEntry $payload $manifest.targetArchive }
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
  if (Test-Path -LiteralPath $backup) {
    [void](Require-LocalPath $backup)
    $baseIdentity = $manifest.baseArchive
    if ((Get-Item -LiteralPath $backup).Length -ne $baseIdentity.bytes -or
        (Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $baseIdentity.sha256) {
      # The same target may be reached from several valid starting archives.
      $backup = Join-Path $resources ('app.asar.before-' + $manifest.targetArchive.sha256 + '-from-' + $baseIdentity.sha256.Substring(0,16))
    }
  }
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
    if ($manifest.version -eq 2) { Expand-LabDelta $payload $asar $stage $after.bytes }
    else { [IO.Compression.ZipFileExtensions]::ExtractToFile($payload,$stage) }
  }

  Confirm-Identity $stage $after
  Confirm-Identity $asar $before
  Confirm-Closed
  if ($Mode -eq 'Apply' -and !(Test-Path -LiteralPath $backup)) {
    [IO.File]::Replace($stage,$asar,$backup)
  } else {
    $temporaryBackup = Join-Path $resources ('app.asar.replaced-' + [guid]::NewGuid())
    [IO.File]::Replace($stage,$asar,$temporaryBackup)
  }
  Confirm-Identity $asar $after
  if ($temporaryBackup) { Remove-Item -LiteralPath $temporaryBackup }
  [pscustomobject]@{mode=$Mode;archiveSha256=$after.sha256;sourceCommit=$manifest.sourceCommit}
} finally {
  if ($lock) { $lock.Dispose() }
  if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage }
  if ($archive) { $archive.Dispose() }
  $zipFile.Dispose()
}
