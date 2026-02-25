@echo off
title Lanzador NOVAPACK CLOUD
:: Detectar si el usuario tiene Edge o Chrome (prioridad Edge por estar en Windows)
set "BROWSER_PATH="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
)

if "%BROWSER_PATH%"=="" (
    echo No se encontro Edge o Chrome. Abriendo en el navegador predeterminado...
    start "" "https://novapack-68f05.firebaseapp.com"
) else (
    echo Iniciando NOVAPACK en modo Aplicacion...
    start "" "%BROWSER_PATH%" --app="https://novapack-68f05.firebaseapp.com" --start-maximized
)
exit
