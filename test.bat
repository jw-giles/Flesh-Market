@echo off
setlocal ENABLEDELAYEDEXPANSION
title FleshMarket - test
color 0B
pushd "%~dp0"

REM ═══════════════════════════════════════════════════════════════════════════
REM  test.bat - one click. Double click it.
REM
REM  Runs every check in tools/, draws battlefield frames if node-canvas is
REM  installed, then serves client/ and opens the benches in a browser.
REM
REM  IT DOES NOT TOUCH THE GAME SERVER. server/server.js opens a database, holds
REM  sockets and runs the market day; none of that is needed to check a renderer
REM  or run the suites, and starting a real world to look at a battlefield is how
REM  test state ends up in a live database.
REM
REM  IT NEVER STOPS ON A MISSING OPTIONAL DEPENDENCY. jsdom and node-canvas are
REM  both optional here. Without them some checks report SKIPPED, which is a
REM  first-class outcome in run-all.mjs and is stated rather than hidden - a
REM  check that silently asserts nothing is worse than one that says it did not
REM  run.
REM ═══════════════════════════════════════════════════════════════════════════

echo.
echo  ============================================================
echo   FLESHMARKET TEST
echo  ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js is not on PATH. Install from https://nodejs.org
  echo.
  pause
  popd
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  node %%v
for /f "tokens=*" %%v in ('node -p "require(\"./client/version.json\").version" 2^>nul') do echo  build %%v
echo.

REM ---- optional dev dependencies -------------------------------------------
if not exist "node_modules" (
  echo  [1/4] Installing dev dependencies ^(first run only^)...
  echo        jsdom and canvas are OPTIONAL. If either fails to build, the
  echo        checks that need it report SKIPPED and everything else still runs.
  call npm install --no-audit --no-fund
  echo.
) else (
  echo  [1/4] Dev dependencies present.
  echo.
)

REM ---- the suites -----------------------------------------------------------
echo  [2/4] Running checks...
echo.
call node tools/run-all.mjs
set SUITE=%errorlevel%
echo.

REM ---- battlefield frames ---------------------------------------------------
echo  [3/4] Drawing city battlefield frames...
node -e "require.resolve('canvas')" >nul 2>&1
if errorlevel 1 (
  echo        SKIPPED - node-canvas is not installed.
  echo        The browser bench below does not need it; only the headless
  echo        frame writer does.  npm i -D canvas
) else (
  call node tools/citybattle-harness.mjs
  if not errorlevel 1 (
    echo        Frames written to tools\_citybattle\
    start "" "%~dp0tools\_citybattle"
  )
)
echo.

REM ---- the benches ----------------------------------------------------------
REM  ORDER MATTERS AND THE OLD ORDER WAS A BUG. This used to open the browser
REM  and THEN start the server. If a server from an earlier session was still
REM  holding the port - started from a DIFFERENT, OLDER FOLDER - the new one
REM  exited with EADDRINUSE and the tab that had just opened connected to the
REM  OLD process, which happily served last week's tree. Every symptom looked
REM  like a browser cache and none of it was.
REM
REM  server\start_server.bat has freed its port with netstat and taskkill since
REM  it shipped. This does the same, waits until the server actually answers,
REM  and only then opens the browser.
echo  [4/4] Serving client/ and opening the benches...
echo.

set PORT=8177
:FREEPORT
set BUSYPID=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set BUSYPID=%%p
)
if defined BUSYPID (
  echo        Port %PORT% is held by PID %BUSYPID% - almost certainly a serve.mjs
  echo        left running from another folder. Closing it so THIS tree is served.
  taskkill /F /PID %BUSYPID% >nul 2>&1
  timeout /t 1 >nul
  goto FREEPORT
)

echo        City battlefield   http://localhost:%PORT%/citybattle-mock.html
echo        Reach battlefield  http://localhost:%PORT%/battle-test.html
echo.
echo        Close this window to stop the server.
echo.

REM  Start the server FIRST, in its own window, then poll until it answers.
start "FleshMarket serve" /min cmd /c "node tools\serve.mjs %PORT%"
set /a TRIES=0
:WAITSRV
set /a TRIES+=1
timeout /t 1 >nul
node -e "fetch('http://localhost:%PORT%/version.json').then(r=>r.json()).then(v=>{console.log(v.version);process.exit(0)}).catch(()=>process.exit(1))" >"%TEMP%\fmver.txt" 2>nul
if errorlevel 1 (
  if %TRIES% LSS 12 goto WAITSRV
  echo  ERROR: the server did not come up on port %PORT%.
  pause
  popd
  exit /b 1
)
set /p SERVED=<"%TEMP%\fmver.txt"
for /f "tokens=*" %%v in ('node -p "require('./client/version.json').version"') do set ONDISK=%%v
if not "%SERVED%"=="%ONDISK%" (
  color 0C
  echo.
  echo  *** WRONG TREE IS BEING SERVED ***
  echo      port %PORT% is answering with build %SERVED%
  echo      this folder is build %ONDISK%
  echo      Something else is serving. Close every other FleshMarket window
  echo      and run this again.
  echo.
  pause
) else (
  echo        Serving build %ONDISK% from this folder. Opening browser...
)
start "" "http://localhost:%PORT%/citybattle-mock.html"

echo.
if not "%SUITE%"=="0" (
  color 0C
  echo  ONE OR MORE CHECKS FAILED - scroll up.
) else (
  echo  All checks green.
)
echo.
echo  The server is running in a separate window titled "FleshMarket serve".
echo  Close that window to stop it.
pause
popd
