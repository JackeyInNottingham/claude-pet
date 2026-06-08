@echo off
REM run-hook.cmd — Windows polyglot wrapper for Claude Pet hook scripts
REM Launches notify-pet.sh via Git Bash on Windows

set ARGS=%*

REM Search for bash.exe in common Git for Windows locations
for %%B in (
  "C:\Program Files\Git\bin\bash.exe"
  "%LocalAppData%\Programs\Git\bin\bash.exe"
  "%ProgramFiles%\Git\bin\bash.exe"
) do if exist %%B set BASH=%%B

if defined BASH (
  %BASH% -c "%~dp0notify-pet.sh %ARGS%"
) else (
  REM Try direct bash invocation (WSL or bash in PATH)
  where bash >nul 2>&1
  if %ERRORLEVEL% equ 0 (
    bash "%~dp0notify-pet.sh" %ARGS%
  ) else (
    echo Claude Pet: bash not found. Please install Git for Windows.
    exit /b 0
  )
)
