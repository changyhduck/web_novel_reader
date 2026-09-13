@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "START_SCRIPT=%PROJECT_DIR%start.ps1"

if not exist "%START_SCRIPT%" (
  echo [ERROR] start.ps1 was not found: %START_SCRIPT%
  echo Keep start.bat and start.ps1 in the same project folder.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%START_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Novel Reader stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
