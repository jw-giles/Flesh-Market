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

echo === Ensuring dependencies are up to date ===
REM Check for required packages; reinstall if any are missing
if not exist "node_modules\dotenv" (
  echo dotenv not found - running npm install...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    popd
    exit /b 1
  )
) else if not exist "node_modules" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    popd
    exit /b 1
  )
)

REM Auto-create .env from example on first run
if not exist ".env" (
  if exist ".env.example" (
    echo First run: copying .env.example to .env
    echo Edit server\.env to configure DEV_ACCOUNTS and other settings.
    copy ".env.example" ".env" >nul
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

set PORT=%BASEPORT%
set "URL=http://localhost:%PORT%/"
set "NODE_OPTIONS=--trace-warnings"

call free_port.bat %PORT%
echo === Launching server on %URL% ===
start "" "%URL%"
echo (Browser opened. Logs below...)

cmd /v:on /c node --experimental-sqlite server.js & echo --- Node exited with code !errorlevel! --- & pause

popd
