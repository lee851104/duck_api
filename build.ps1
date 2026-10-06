$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$htmlAsset = Join-Path $PSScriptRoot 'order-workbench.html'
& '.\.build-venv\Scripts\python.exe' -m PyInstaller --noconfirm --clean --onefile --windowed --name '啟動菜騎鴨' --add-data "$htmlAsset;." --distpath 'release\菜騎鴨' --workpath '.build' --specpath '.build' app.py
if ($LASTEXITCODE -ne 0) { throw 'Executable build failed' }
Copy-Item -LiteralPath '使用說明.txt' -Destination 'release\菜騎鴨\使用說明.txt' -Force
$pythonLicense = & '.\.build-venv\Scripts\python.exe' -c "import sys; from pathlib import Path; print(Path(sys.base_prefix) / 'LICENSE.txt')"
if ($LASTEXITCODE -ne 0) { throw 'Python license lookup failed' }
Copy-Item -LiteralPath $pythonLicense -Destination 'release\菜騎鴨\Python-LICENSE.txt' -Force
Compress-Archive -LiteralPath 'release\菜騎鴨' -DestinationPath 'release\菜騎鴨-Windows.zip' -Force
Get-Item -LiteralPath 'release\菜騎鴨-Windows.zip' | Select-Object FullName, Length
