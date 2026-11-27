@echo off
title Create Desktop Shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Claude Code Web Studio.lnk')); $s.TargetPath = [IO.Path]::Combine('%~dp0', 'Launch-Web-Studio.bat'); $s.WorkingDirectory = '%~dp0'; $s.Description = 'Launch Claude Code Web Studio with OmniRoute'; $s.Save()"
echo.
echo Desktop shortcut created: "Claude Code Web Studio" on your Desktop!
echo You can now double click it anytime to run without opening terminal.
echo.
pause
