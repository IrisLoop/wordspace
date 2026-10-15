$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { exit 0 }
$appProcessId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$appProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $appProcessId" -ErrorAction SilentlyContinue
$serverPath = Join-Path $PSScriptRoot 'server.mjs'
if ($appProcess -and $appProcess.Name -eq 'node.exe' -and $appProcess.CommandLine -and $appProcess.CommandLine.IndexOf(('"' + $serverPath + '"'), [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Stop-Process -Id $appProcessId -ErrorAction Stop
}
