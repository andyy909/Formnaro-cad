param([string]$Executable,[string]$Suite='workbench',[string]$Name='source-workbench',[string]$CheckDirectory='work/easy-tinker/checks')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path $PSScriptRoot -Parent
$checkRoot=if([IO.Path]::IsPathRooted($CheckDirectory)){$CheckDirectory}else{Join-Path $taskRoot $CheckDirectory}
New-Item -ItemType Directory -Force -Path $checkRoot | Out-Null
$runRoot=Join-Path ([IO.Path]::GetTempPath()) ('formnaro-easy-'+$Name+'-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runRoot | Out-Null
$reportPath=Join-Path $runRoot 'result.json'
if($Executable){$program=(Resolve-Path -LiteralPath $Executable).Path;$arguments=@("--verify-$Suite=`"$reportPath`"")}
else{$program=Join-Path $taskRoot 'node_modules/electron/dist/electron.exe';$arguments=@('.',"--verify-$Suite=`"$reportPath`"")}
$before=(Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant()
$process=Start-Process -FilePath $program -ArgumentList $arguments -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'stdout.log') -RedirectStandardError (Join-Path $runRoot 'stderr.log')
$process.WaitForExit()
$code=$process.ExitCode
if(-not (Test-Path -LiteralPath $reportPath)){throw "Verification produced no report; exit $code. See $runRoot"}
$result=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
$after=(Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt=[ordered]@{ok=($code -eq 0 -and $result.ok -eq $true -and $before -eq $after);exitCode=$code;report=$reportPath;reportSha256=(Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant();executable=$program;exeSha256=$after;checks=$result.checks.Count}
if($Executable){$asar=Join-Path (Split-Path $program -Parent) 'resources/app.asar';$receipt.asarSha256=(Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash.ToLowerInvariant();if($result.exeSha256 -ne $receipt.exeSha256 -or $result.asarSha256 -ne $receipt.asarSha256){$receipt.ok=$false}}
Copy-Item -LiteralPath $reportPath -Destination (Join-Path $checkRoot "$Name.json")
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $checkRoot "run-$Name.json") -Encoding utf8
$receipt | ConvertTo-Json -Compress
if(-not $receipt.ok){throw "Verification failed; see $runRoot"}
