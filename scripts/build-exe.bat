@echo off
rem Builds the Windows installer (.exe). Double-click this file, or run it from a terminal in the project folder.
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Get the LTS version from https://nodejs.org , install it, then run this again.
  pause
  exit /b 1
)

echo [1/3] Installing packages (first run takes a few minutes)...
call npm install
if errorlevel 1 goto fail

echo [2/3] Building the app...
call npm run build:client
if errorlevel 1 (
  echo.
  echo The build failed. Repairing the install and trying once more...
  call node scripts\fix-install.mjs
  if errorlevel 1 goto fail
  call npm run build:client
  if errorlevel 1 goto fail
)

echo [3/3] Packaging the installer...
call npm run dist:win:exe -w @castdesk/desktop
if errorlevel 1 goto fail

echo.
echo Done. Your installer is in apps\desktop\release
start "" "apps\desktop\release"
pause
exit /b 0

:fail
echo.
echo Build failed. Scroll up for the first error, then see docs\BUILD-EXE.md ("If something goes wrong").
pause
exit /b 1
