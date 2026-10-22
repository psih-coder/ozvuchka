@echo off
rem Deploy to Cloudflare Pages: copies the site into dist and uploads it.
rem First time: do steps 1-3 from DEPLOY.md.
chcp 65001 >nul
cd /d "%~dp0"

if exist dist rmdir /s /q dist
mkdir dist
copy /y index.html dist\ >nul
copy /y _headers dist\ >nul
xcopy css dist\css\ /e /i /q /y >nul
xcopy js dist\js\ /e /i /q /y >nul
xcopy fonts dist\fonts\ /e /i /q /y >nul

rem GitHub Pages: just push the committed code
git push github main

call npx wrangler pages deploy dist --project-name ozvuchka-ai-pro --branch main --commit-dirty=true
pause
