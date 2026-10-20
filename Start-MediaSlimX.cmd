@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo Cannot open project folder.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-window.ps1" %*
set "MSX_EXIT=%ERRORLEVEL%"
popd
if not "%MSX_EXIT%"=="0" pause
exit /b %MSX_EXIT%
