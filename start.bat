@echo off
chcp 65001 >nul
echo.
echo  ╔═══════════════════════════════╗
echo  ║   一木 YiMu - 启动中...       ║
echo  ║   一人成木，独木成林           ║
echo  ╚═══════════════════════════════╝
echo.

:: 启动 MongoDB
echo [1/2] 启动 MongoDB...
start "MongoDB" cmd /k ""C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe" --dbpath D:\MongoDB\data"
timeout /t 3 /nobreak >nul

:: 启动 Next.js（前后端一体）
echo [2/2] 启动一木应用...
start "YiMu" cmd /k "cd /d D:\YiMu && npm run dev"

echo.
echo  ✅ 启动完成！
echo  🌐 打开浏览器访问: http://localhost:3000
echo.
pause
