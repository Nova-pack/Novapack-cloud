@echo off
title Lanzador NOVAPACK CLOUD
set "BROWSER_PATH="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
)

if "%BROWSER_PATH%"=="" (
    start "" "https://novapack-68f05.firebaseapp.com"
) else (
    start "" "%BROWSER_PATH%" --app="https://novapack-68f05.firebaseapp.com" --start-maximized
)
exit
