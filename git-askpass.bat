@echo off
echo %* | findstr /I /C:"Username" >nul
if not errorlevel 1 (
  echo x-access-token
) else (
  echo %GITHUB_PAT%
)
