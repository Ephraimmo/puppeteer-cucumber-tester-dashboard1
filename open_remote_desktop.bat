@echo off
start %windir%\system32\mstsc.exe
timeout /t 2 > nul
powershell -command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('{ENTER}')"
timeout /t 5 > nul
powershell -File "C:\Users\karabomo\Downloads\puppeteer-cucumber-js-main\puppeteer-cucumber-test\UsernameAndPassword.ps1"

pause
npm run dev:KasiMainAdminTest
@echo Main started successfully
pause


