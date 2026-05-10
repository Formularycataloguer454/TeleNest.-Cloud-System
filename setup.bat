@echo off
echo ==========================================
echo    TeleNest Cloud Setup Tool 🛡️🚀
echo ==========================================
echo.
echo Installing root dependencies...
call npm install
echo.
echo Installing server dependencies...
cd server
call npm install
cd ..
echo.
echo Setup Complete! ✨
echo To start the application, run: npm start
echo.
pause
