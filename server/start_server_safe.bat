@echo on
setlocal ENABLEDELAYEDEXPANSION
title Flesh Market Server (Safe Start)
color 0A
set PORT=7777

pushd "%~dp0"

where node
if errorlevel 1 (
  echo ERROR: Node.js not found in PATH.
  pause
  popd
  exit /b 1
)

call free_port.bat %PORT%

set "URL=http://localhost:%PORT%/"
echo === Launching server on %URL% ===
start "" "%URL%"
echo (Browser opened. Logs below...)

cmd /v:on /c node --trace-uncaught server.js & echo --- Node exited with code !errorlevel! --- & pause

popd
