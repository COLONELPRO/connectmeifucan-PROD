@echo off
REM Build script for Android TV app (Windows)

echo.
echo ========================================
echo   Build Android TV App
echo ========================================
echo.

REM Check if ADB is available
where adb >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Android SDK not found.
    echo Please install Android Studio and add platform-tools to PATH.
    exit /b 1
)

REM Set project directory
set PROJECT_DIR=%~dp0
echo [INFO] Project: %PROJECT_DIR%
echo.

REM Build APK
echo [BUILD] Building APK...
cd /d "%PROJECT_DIR%"

if exist "gradlew.bat" (
    call gradlew.bat assembleDebug
) else (
    echo [WARNING] gradlew.bat not found.
    echo.
    echo Please build manually in Android Studio:
    echo   1. Open Android Studio
    echo   2. File ^> Open ^> %PROJECT_DIR%
    echo   3. Build ^> Build Bundle^(s^) / APK^(s^) ^> Build APK^(s^)
    exit /b 1
)

REM Check if build succeeded
set APK_PATH=%PROJECT_DIR%app\build\outputs\apk\debug\app-debug.apk
if exist "%APK_PATH%" (
    echo.
    echo [SUCCESS] APK built successfully!
    echo [INFO] Location: %APK_PATH%
    echo.
    
    REM Ask to install
    set /p INSTALL="Install on connected Android TV device? (y/n): "
    
    if /i "%INSTALL%"=="y" (
        echo.
        echo [INSTALL] Installing APK...
        adb install -r "%APK_PATH%"
        
        if %ERRORLEVEL% EQU 0 (
            echo.
            echo [SUCCESS] App installed successfully!
            echo.
            echo Launch the app on your Android TV:
            echo   com.connectmeifucan.app/.MainActivity
        ) else (
            echo.
            echo [ERROR] Installation failed.
            echo Make sure device is connected: adb devices
        )
    )
) else (
    echo.
    echo [ERROR] Build failed. Check errors above.
    exit /b 1
)

echo.
echo Done!
pause
