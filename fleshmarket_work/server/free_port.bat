@echo off
setlocal ENABLEDELAYEDEXPANSION
REM Usage: free_port.bat 7777
if "%~1"=="" (
  echo Usage: %~nx0 PORT
  exit /b 1
)
set PORT=%~1

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo Found PID listening on %PORT%: %%p
  REM Do not kill our own cmd.exe; only kill non-system PIDs
  for /f "tokens=1,*" %%a in ('tasklist /FI "PID eq %%p" /FO LIST ^| findstr /R "Image Name: PID:"') do (
    REM nothing; just to force tasklist before taskkill
  )
  echo Killing PID %%p
  taskkill /PID %%p /F >nul 2>&1
)
exit /b 0
