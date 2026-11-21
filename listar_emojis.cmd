@echo off
chcp 65001 >nul
rem Lista todos los emojis de la interfaz. Requiere Node.js (el mismo de las pruebas).
node "%~dp0tools\listar_emojis.js" "%~dp0."
if errorlevel 1 echo.& echo No se pudo ejecutar. Revisa que Node.js este instalado ^(node --version^).
echo.
pause
