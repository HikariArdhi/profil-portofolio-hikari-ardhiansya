@echo off
cd /d "%~dp0"
echo Buka http://localhost:8000 di browser.
echo Tekan Ctrl+C untuk menghentikan server.
py -m http.server 8000 --bind 127.0.0.1 --directory dist
pause
