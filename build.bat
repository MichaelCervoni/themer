@echo off
echo Copying fixed content script...
copy /Y .\src\content-dark-fix.ts .\src\content.ts

REM Create a fixed background.ts that builds correctly
echo Creating fixed background.ts...
type .\src\background.ts > .\src\background.bak
type .\src\background-fix.ts >> .\src\background.ts

echo Running build...
call pnpm build

REM Restore original background file
echo Restoring original files...
copy /Y .\src\background.bak .\src\background.ts
del .\src\background.bak