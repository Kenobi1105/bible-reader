@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo Git was not found. Install Git for Windows, then run this file again.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo This folder is not a Git repository yet.
  echo Run: git init
  pause
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo No GitHub remote named origin was found.
  echo Add it with:
  echo git remote add origin https://github.com/Kenobi1105/bible-reader.git
  pause
  exit /b 1
)

git status --short
set "has_changes="
for /f %%S in ('git status --porcelain') do set "has_changes=1"
if defined has_changes goto changed

echo No changes to commit.
pause
exit /b 0

:changed
set /p message=Commit message: 
if "%message%"=="" set message=Update Bible Reader

git add -A
git commit -m "%message%"
if errorlevel 1 (
  echo Commit did not complete.
  pause
  exit /b 1
)

for /f %%b in ('git branch --show-current') do set branch=%%b
if "%branch%"=="" (
  echo No current branch is checked out.
  pause
  exit /b 1
)

echo.
echo Enter a GitHub personal access token in the secure prompt.
echo It is used only for this push and is not saved in the project.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push-with-token.ps1" -Git "git" -Branch "%branch%"
if errorlevel 1 (
  echo Push did not complete. Check the token permissions and try again.
  pause
  exit /b 1
)

echo.
echo Published to GitHub. GitHub Pages will update after the workflow completes.
pause
