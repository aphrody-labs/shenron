@echo off
rem SPDX-License-Identifier: Apache-2.0
rem Installation de Shenron en un clic : double-cliquez sur ce fichier.
title Installation de Shenron
if exist "%~dp0install.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/aphrody-labs/shenron/main/install.ps1 | iex"
)
if errorlevel 1 (
  echo.
  echo L'installation n'a pas abouti. Le message ci-dessus indique la raison.
  pause
  exit /b 1
)
exit /b 0
