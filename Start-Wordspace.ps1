$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'http://127.0.0.1:43127'
$nodePath = Join-Path $appRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
try { $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2 } catch { $health = $null }
if ($health.app -ne 'wordspace') {
  $dataPath = Join-Path $appRoot 'data'
  New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
  $appProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $appRoot 'server.mjs') + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
  Set-Content -LiteralPath (Join-Path $dataPath 'server.pid') -Value $appProcess.Id
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 250
    try { $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'wordspace') { $ready = $true; break } } catch {}
  }
  if (-not $ready) { throw 'Cannot start Wordspace. Check data/server-error.log. Port 43127 may be occupied.' }
}
Start-Process $appUrl
