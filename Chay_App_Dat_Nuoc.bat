@echo off
title CO BA CAFE - MAY CHU DAT NUOC
cd /d "%~dp0"
echo ========================================================
echo   CO BA CAFE - KHOI DONG MAY CHU DAT NUOC NOI BO
echo ========================================================
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Khong the khoi chay Node.js.
    echo.
    pause
)
