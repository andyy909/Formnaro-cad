param([Parameter(Mandatory=$true)][string]$ProgramDirectory,[string]$ReportDirectory=(Join-Path $PWD 'CAD-Abnahme'),[string]$ProgressFile)
$ErrorActionPreference='Stop'
$cadProgram=[IO.Path]::GetFullPath($ProgramDirectory)
$cadReports=[IO.Path]::GetFullPath($ReportDirectory)
$cadExe=Join-Path $cadProgram 'Formnaro.exe'
if (!(Test-Path -LiteralPath $cadExe)) { throw 'Formnaro.exe fehlt im angegebenen Programmordner.' }
# This gate deliberately does not mask ProgramFiles, PATH or installed software.
$cadCommands=@('python.exe','python3.exe','py.exe','FreeCAD.exe','FreeCADCmd.exe') | ForEach-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Where-Object { $_.Source -notmatch '\\WindowsApps\\' }
$cadInstalled=@('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*') | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } | Where-Object { $_.DisplayName -match '(?i)FreeCAD|Python \d|Python Launcher' }
$cadFreeCADFolders=@($env:ProgramFiles,${env:ProgramFiles(x86)}) | Where-Object { $_ } | ForEach-Object { Get-ChildItem -LiteralPath $_ -Directory -Filter 'FreeCAD*' -ErrorAction SilentlyContinue }
if ($cadCommands -or $cadInstalled -or $cadFreeCADFolders) { throw 'Diese Abnahme benötigt ein sauberes Windows ohne externe FreeCAD-/Python-Installation. Keine Installationen entfernen; einen anderen Prüf-PC oder eine saubere VM verwenden.' }
if (Test-Path -LiteralPath $cadReports) { throw 'Neuen, noch nicht vorhandenen Berichtordner angeben.' }
New-Item -ItemType Directory -Path $cadReports | Out-Null
$cadRows=@()
$cadSuites=@(
 @('runtime','FORMNARO_VERIFY_CAD_RUNTIME_ONLY'),
 @('python','FORMNARO_NATIVE_FREECAD_ONLY'),
 @('plans','FORMNARO_FREECAD_ONLY'),
 @('document','FORMNARO_VERIFY_FREECAD_DOCUMENT_ONLY'),
 @('advanced','FORMNARO_VERIFY_ADVANCED_MODELING_ONLY'),
 @('surfaces','FORMNARO_VERIFY_SURFACES_ONLY')
)
foreach ($cadSuite in $cadSuites) {
 $cadName=$cadSuite[0]; $cadFlag=$cadSuite[1]
 if($ProgressFile){Set-Content -LiteralPath $ProgressFile -Value ('Starting: '+$cadName) -Encoding UTF8}
 $cadDirectory=Join-Path $cadReports $cadName
 New-Item -ItemType Directory -Path $cadDirectory | Out-Null
 $cadReport=Join-Path $cadDirectory 'result.json'
 $cadOldFlag=[Environment]::GetEnvironmentVariable($cadFlag,'Process')
 $cadOldNode=$env:ELECTRON_RUN_AS_NODE
 try {
  [Environment]::SetEnvironmentVariable($cadFlag,'1','Process')
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $cadProcess=Start-Process -FilePath $cadExe -ArgumentList ('"--verify-ai-result-checks='+$cadReport+'"') -WorkingDirectory $cadProgram -WindowStyle Hidden -PassThru -Wait
  if ($cadProcess.ExitCode -ne 0) { throw "CAD-Prüfung $cadName fehlgeschlagen." }
  $cadResult=Get-Content -LiteralPath $cadReport -Raw -Encoding UTF8 | ConvertFrom-Json
  if (!$cadResult.ok -or !$cadResult.isolatedProfile -or $cadResult.errors.Count -or $cadResult.external.Count) { throw "Ungültiges Ergebnis: $cadName" }
  $cadRows+=@{name=$cadName;checks=$cadResult.checks.Count;report=$cadReport;sha256=(Get-FileHash -LiteralPath $cadReport -Algorithm SHA256).Hash.ToLower()}
  if($ProgressFile){Set-Content -LiteralPath $ProgressFile -Value ('Passed: '+$cadName+'; checks='+$cadResult.checks.Count) -Encoding UTF8}
 } finally {
  [Environment]::SetEnvironmentVariable($cadFlag,$cadOldFlag,'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE',$cadOldNode,'Process')
 }
}
@{ok=$true;cleanWindowsPreflight=$true;os=[Environment]::OSVersion.VersionString;exeSha256=(Get-FileHash -LiteralPath $cadExe -Algorithm SHA256).Hash.ToLower();asarSha256=(Get-FileHash -LiteralPath (Join-Path $cadProgram 'resources/app.asar') -Algorithm SHA256).Hash.ToLower();results=$cadRows;reviewRequired=$true} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $cadReports 'clean-windows-result.json') -Encoding UTF8
Write-Output 'Gezielte Windows-Prüfungen bestanden. Ergebnis und Paketbilder vor Freigabe prüfen.'
