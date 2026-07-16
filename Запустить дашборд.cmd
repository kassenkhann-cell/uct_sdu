@echo off
cd /d "%~dp0"
title Digital Radar

where node >nul 2>nul || goto no_node
if exist "node_modules" goto launch

echo Installing required components...
call npm.cmd install || goto install_failed

:launch
echo Opening dashboard...
node scripts\launch-dashboard.mjs || goto launch_failed
exit /b 0

:no_node
echo Node.js 20 or newer is required: https://nodejs.org/
pause
exit /b 1

:install_failed
echo Could not install required components.
pause
exit /b 1

:launch_failed
echo Could not open the dashboard. See logs\dashboard_stderr.log
pause
exit /b 1
