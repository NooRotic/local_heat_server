@echo off
REM Start Heat Server Emulator

cd /d "%~dp0"
echo Starting Heat Server Emulator...
echo.
npx tsx src\server.ts
