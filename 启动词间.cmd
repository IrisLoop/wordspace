@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Wordspace.ps1"
if errorlevel 1 pause
