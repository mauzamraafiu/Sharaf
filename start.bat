@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Sharaf
set PORT=8787
set URL=http://localhost:%PORT%

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  start https://nodejs.org
  pause
  exit /b 1
)

:menu
cls
echo.
echo   Sharaf  -  local test server
echo   ---------------------------------------------
echo   1  Start and open in browser   (press Enter)
echo   2  Stop
echo   3  Update  (pull latest from GitHub, reinstall, restart)
echo   4  Open in browser
echo   5  Start so a phone on the same Wi-Fi can open it
echo   6  Rebuild content after editing files in content\
echo   7  Reset the local database
echo   8  Deploy to Cloudflare now
echo   0  Exit
echo.
set CHOICE=1
set /p CHOICE=  Choose: 
if "%CHOICE%"=="1" goto start
if "%CHOICE%"=="2" goto stop
if "%CHOICE%"=="3" goto update
if "%CHOICE%"=="4" goto open
if "%CHOICE%"=="5" goto lan
if "%CHOICE%"=="6" goto content
if "%CHOICE%"=="7" goto reset
if "%CHOICE%"=="8" goto deploy
if "%CHOICE%"=="0" exit /b 0
goto menu

:prepare
if not exist node_modules (
  echo Installing packages. The first run takes a few minutes...
  call npm install
  if errorlevel 1 ( echo npm install failed. Check your internet connection. & pause & goto menu )
)
if not exist .dev.vars (
  echo ADMIN_PASSWORD=admin12345> .dev.vars
  echo Created .dev.vars with the local admin password admin12345
)
exit /b 0

:running
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing %URL%/api/bootstrap -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
exit /b %errorlevel%

:wait
set TRIES=0
:waitloop
call :running
if not errorlevel 1 exit /b 0
set /a TRIES+=1
if %TRIES% GEQ 45 ( echo The server did not start. Look at the "Sharaf server" window for the error. & exit /b 1 )
timeout /t 1 /nobreak >nul
goto waitloop

:start
call :prepare
call :running
if not errorlevel 1 ( echo Already running. & goto open )
echo Starting...
start "Sharaf server" /min cmd /c "npx wrangler dev --port %PORT% --test-scheduled"
call :wait
if errorlevel 1 ( pause & goto menu )
:open
start "" %URL%
echo Opened %URL%   Admin: %URL%/#/admin
timeout /t 3 >nul
goto menu

:lan
call :prepare
call :killserver
echo Starting on all network addresses...
start "Sharaf server" /min cmd /c "npx wrangler dev --port %PORT% --ip 0.0.0.0 --test-scheduled"
call :wait
echo.
echo On the phone, open one of these (same Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:%PORT%
echo.
echo Installing as an app and notifications need HTTPS, so test those after deploying.
pause
goto menu

:killserver
taskkill /FI "WINDOWTITLE eq Sharaf server*" /T /F >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /PID %%p /T /F >nul 2>nul
exit /b 0

:stop
call :killserver
echo Stopped.
timeout /t 2 >nul
goto menu

:update
call :killserver
if exist .git (
  git pull
) else (
  echo This folder is not connected to GitHub yet, so only packages were updated. See README.md.
)
call npm install
echo Updated.
pause
goto start

:content
call :prepare
call npm run content
echo The app picks up the new content the next time it loads.
pause
goto menu

:reset
call :killserver
if exist .wrangler\state rmdir /s /q .wrangler\state
echo Local database cleared. It is rebuilt the next time you start.
pause
goto menu

:deploy
call :prepare
call npx wrangler deploy
pause
goto menu
