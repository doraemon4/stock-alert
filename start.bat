@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js 20 或更高版本: https://nodejs.org
  pause
  exit /b 1
)
node src/server.js
pause
