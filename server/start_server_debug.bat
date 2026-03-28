@echo on
setlocal ENABLEDELAYEDEXPANSION
title Flesh Market Server
color 0A

REM ---- Configuration ----
set BASEPORT=7777
set MAXPORT=7799

pushd "%~dp0"

echo === Checking Node.js availability ===
where node
if errorlevel 1 (
  echo ERROR: Node.js not found in PATH. Install from https://nodejs.org and retry.
  pause
  popd
  exit /b 1
)

echo === Ensuring dependencies ===
if not exist "node_modules" (
  echo node_modules missing -> running npm ci ...
  call npm ci
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    popd
    exit /b 1
  )
)

echo === Freeing or selecting port ===
:CHECK_BUSY
set BUSYPID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%BASEPORT% .*LISTENING"') do (
  set BUSYPID=%%p
)
if defined BUSYPID (
  echo Port %BASEPORT% is in use by PID %BUSYPID% - terminating...
  taskkill /F /PID %BUSYPID% >nul 2>&1
  timeout /t 1 >nul
  goto CHECK_BUSY
)

REM If still not listening but reserved by TIME_WAIT/other states, bump
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%BASEPORT% "') do (
  set STILL=1
)
if defined STILL (
  echo Port %BASEPORT% still appears busy; trying next port...
  set /a BASEPORT+=1
  if %BASEPORT% GTR %MAXPORT% (
    echo ERROR: Could not acquire a free port between 7777 and %MAXPORT%.
    pause
    popd
    exit /b 1
  )
  set STILL=
  goto CHECK_BUSY
)

set PORT=%BASEPORT%
set "URL=http://localhost:%PORT%/"
set "NODE_OPTIONS=--trace-warnings"

echo === Launching server on %URL% ===
start "" "%URL%"
echo (Browser opened. Logs below...)

REM Use cmd /k to keep window open even if Node exits quickly
cmd /v:on /c node --trace-uncaught server.js & echo --- Node exited with code !errorlevel! --- & pause

popd
