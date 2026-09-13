@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "START_SCRIPT=%PROJECT_DIR%start.ps1"

if not exist "%START_SCRIPT%" (
  echo [錯誤] 找不到 start.ps1：%START_SCRIPT%
  echo 請將 start.bat 與 start.ps1 放在同一個專案資料夾。
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%START_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [錯誤] 小說閱讀器未能正常啟動。結束代碼：%EXIT_CODE%
  pause
)

exit /b %EXIT_CODE%
