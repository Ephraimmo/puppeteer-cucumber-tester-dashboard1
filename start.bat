@echo off
title Scenario Test Dashboard
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo Download it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

call npm start
if errorlevel 1 pause
