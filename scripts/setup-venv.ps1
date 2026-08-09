# KeySafe — recreate a clean Python 3.12/3.13 venv and install deps
# Run in PowerShell from the project root:
#   cd "D:\Desktop\personal projects\ksafe"
#   .\scripts\setup-venv.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$py = $null
foreach ($ver in @("3.12", "3.13")) {
  try {
    & py "-$ver" -c "import sys; print(sys.version)" | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $py = $ver
      break
    }
  } catch { }
}

if (-not $py) {
  Write-Host @"
ERROR: Python 3.12 or 3.13 not found.

Install Python 3.12 from:
  https://www.python.org/downloads/release/python-31210/

During setup, enable:
  - Add python.exe to PATH
  - py launcher

Then re-run this script.
Do NOT use Python 3.14 for this project.
"@ -ForegroundColor Red
  exit 1
}

Write-Host "Using Python $py" -ForegroundColor Green

if (Test-Path ".\venv") {
  Write-Host "Removing old venv..."
  Remove-Item -Recurse -Force ".\venv"
}

Write-Host "Creating venv..."
& py "-$py" -m venv venv

$python = Join-Path $Root "venv\Scripts\python.exe"
& $python -m ensurepip --upgrade
& $python -m pip install --upgrade pip setuptools wheel
& $python -m pip install -r requirements.txt

& $python -c "import sys,django,PIL; print('OK', sys.version.split()[0], 'Django', django.get_version(), 'Pillow', PIL.__version__)"

Set-Content -Path (Join-Path $Root ".python-version") -Value $py -NoNewline
Write-Host "Done. Activate with: .\venv\Scripts\Activate.ps1" -ForegroundColor Green
