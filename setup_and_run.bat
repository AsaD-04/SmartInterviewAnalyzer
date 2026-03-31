@echo off
echo ==========================================
echo Setting up Smart Interview Analyzer...
echo ==========================================

cd Backend

if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo ==========================================
echo Setup Complete! Starting Server...
echo ==========================================
echo.
echo 1. Keep this window open.
echo 2. Open 'http://127.0.0.1:5000' in your browser.
echo.

python app.py
pause
