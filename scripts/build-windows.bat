@echo off
setlocal enabledelayedexpansion

REM CADCAM FUN - Windows Build Script
REM Builds the Tauri application for Windows (x64 and x86)

echo.
echo 🪟 Starting Windows build for CADCAM FUN...
echo ==================================================
echo.

REM Colors for output (Windows doesn't support colors in batch easily, so we'll use echo)
set "INFO=[INFO]"
set "SUCCESS=[SUCCESS]"
set "WARNING=[WARNING]"
set "ERROR=[ERROR]"

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo %ERROR% Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Rust is installed
where rustc >nul 2>nul
if %errorlevel% neq 0 (
    echo %ERROR% Rust is not installed. Please install Rust from https://rustup.rs/
    pause
    exit /b 1
)

REM Check if Yarn is installed
where yarn >nul 2>nul
if %errorlevel% neq 0 (
    echo %WARNING% Yarn not found. Installing...
    npm install -g yarn
)

REM Check if Tauri CLI is installed
where cargo-tauri >nul 2>nul
if %errorlevel% neq 0 (
    echo %WARNING% Tauri CLI not found. Installing...
    cargo install tauri-cli
)

REM Detect architecture
set "ARCH=%PROCESSOR_ARCHITECTURE%"
if "%ARCH%"=="AMD64" (
    echo %INFO% Detected x64 architecture
    set "DEFAULT_TARGET=x86_64-pc-windows-msvc"
) else if "%ARCH%"=="ARM64" (
    echo %INFO% Detected ARM64 architecture
    set "DEFAULT_TARGET=aarch64-pc-windows-msvc"
) else (
    echo %INFO% Detected x86 architecture
    set "DEFAULT_TARGET=i686-pc-windows-msvc"
)

REM Ask user for build targets
echo.
echo Available build targets:
echo 1. x86_64-pc-windows-msvc (64-bit Intel/AMD)
echo 2. i686-pc-windows-msvc (32-bit Intel/AMD)
echo 3. aarch64-pc-windows-msvc (ARM64)
echo 4. All targets
echo.
set /p "choice=Choose build target (1-4) or press Enter for default [%DEFAULT_TARGET%]: "

if "%choice%"=="1" (
    set "TARGETS=x86_64-pc-windows-msvc"
) else if "%choice%"=="2" (
    set "TARGETS=i686-pc-windows-msvc"
) else if "%choice%"=="3" (
    set "TARGETS=aarch64-pc-windows-msvc"
) else if "%choice%"=="4" (
    set "TARGETS=x86_64-pc-windows-msvc i686-pc-windows-msvc aarch64-pc-windows-msvc"
) else (
    set "TARGETS=%DEFAULT_TARGET%"
)

echo %INFO% Building for targets: %TARGETS%
echo.

REM Install Rust targets
for %%t in (%TARGETS%) do (
    echo %INFO% Adding Rust target: %%t
    rustup target add %%t
)

REM Install Node.js dependencies
echo %INFO% Installing Node.js dependencies...
bun install
if %errorlevel% neq 0 (
    echo %ERROR% Failed to install Node.js dependencies
    pause
    exit /b 1
)

REM Build frontend
echo %INFO% Building frontend...
bun run build:export
if %errorlevel% neq 0 (
    echo %ERROR% Failed to build frontend
    pause
    exit /b 1
)

REM Build for each target
for %%t in (%TARGETS%) do (
    echo %INFO% Building for target: %%t
    cargo tauri build --target %%t
    if !errorlevel! neq 0 (
        echo %ERROR% Failed to build for target: %%t
        pause
        exit /b 1
    )
)

REM Ask if user wants to create installer
echo.
set /p "create_installer=Do you want to create MSI installers? [y/N]: "
if /i "%create_installer%"=="y" (
    echo %INFO% MSI installers will be created automatically by Tauri
)

REM Ask if user wants to create portable version
echo.
set /p "create_portable=Do you want to create portable versions? [y/N]: "
if /i "%create_portable%"=="y" (
    echo %INFO% Creating portable versions...
    
    for %%t in (%TARGETS%) do (
        set "TARGET_DIR=src-tauri\target\%%t\release"
        set "PORTABLE_DIR=src-tauri\target\%%t\release\portable"
        
        if exist "!TARGET_DIR!\cadcamfun-desktop.exe" (
            echo %INFO% Creating portable version for %%t
            
            REM Create portable directory
            if not exist "!PORTABLE_DIR!" mkdir "!PORTABLE_DIR!"
            
            REM Copy executable
            copy "!TARGET_DIR!\cadcamfun-desktop.exe" "!PORTABLE_DIR!\"
            
            REM Create a simple batch file to run the app
            echo @echo off > "!PORTABLE_DIR!\run.bat"
            echo cd /d "%%~dp0" >> "!PORTABLE_DIR!\run.bat"
            echo start cadcamfun-desktop.exe >> "!PORTABLE_DIR!\run.bat"
            
            REM Create a README
            echo CADCAM FUN - Portable Version > "!PORTABLE_DIR!\README.txt"
            echo ================================ >> "!PORTABLE_DIR!\README.txt"
            echo. >> "!PORTABLE_DIR!\README.txt"
            echo To run the application: >> "!PORTABLE_DIR!\README.txt"
            echo 1. Double-click on cadcamfun-desktop.exe >> "!PORTABLE_DIR!\README.txt"
            echo 2. Or run run.bat >> "!PORTABLE_DIR!\README.txt"
            echo. >> "!PORTABLE_DIR!\README.txt"
            echo This is a portable version that doesn't require installation. >> "!PORTABLE_DIR!\README.txt"
            echo You can copy this folder to any location and run the application. >> "!PORTABLE_DIR!\README.txt"
            
            echo %SUCCESS% Portable version created: !PORTABLE_DIR!
        )
    )
)

REM Create ZIP archives for distribution
echo.
set /p "create_zip=Do you want to create ZIP archives for distribution? [y/N]: "
if /i "%create_zip%"=="y" (
    echo %INFO% Creating ZIP archives...
    
    REM Check if 7-Zip is available
    where 7z >nul 2>nul
    if %errorlevel% neq 0 (
        echo %WARNING% 7-Zip not found. Using PowerShell for compression...
        set "USE_POWERSHELL=1"
    ) else (
        set "USE_POWERSHELL=0"
    )
    
    for %%t in (%TARGETS%) do (
        set "TARGET_DIR=src-tauri\target\%%t\release"
        set "BUNDLE_DIR=!TARGET_DIR!\bundle"
        
        if exist "!TARGET_DIR!\cadcamfun-desktop.exe" (
            set "ZIP_NAME=CADCAM-FUN-1.1.0-%%t.zip"
            
            if "!USE_POWERSHELL!"=="1" (
                REM Use PowerShell to create ZIP
                powershell -Command "Compress-Archive -Path '!TARGET_DIR!\cadcamfun-desktop.exe' -DestinationPath '!TARGET_DIR!\!ZIP_NAME!' -Force"
            ) else (
                REM Use 7-Zip
                7z a "!TARGET_DIR!\!ZIP_NAME!" "!TARGET_DIR!\cadcamfun-desktop.exe"
            )
            
            echo %SUCCESS% ZIP created: !TARGET_DIR!\!ZIP_NAME!
        )
        
        REM Also create ZIP for portable version if it exists
        if exist "!TARGET_DIR!\portable" (
            set "PORTABLE_ZIP=CADCAM-FUN-1.1.0-%%t-portable.zip"
            
            if "!USE_POWERSHELL!"=="1" (
                powershell -Command "Compress-Archive -Path '!TARGET_DIR!\portable\*' -DestinationPath '!TARGET_DIR!\!PORTABLE_ZIP!' -Force"
            ) else (
                7z a "!TARGET_DIR!\!PORTABLE_ZIP!" "!TARGET_DIR!\portable\*"
            )
            
            echo %SUCCESS% Portable ZIP created: !TARGET_DIR!\!PORTABLE_ZIP!
        )
    )
)

REM Summary
echo.
echo ==================================================
echo %SUCCESS% Windows build completed successfully!
echo ==================================================
echo.

echo %INFO% Built artifacts:
for %%t in (%TARGETS%) do (
    set "TARGET_DIR=src-tauri\target\%%t\release"
    
    if exist "!TARGET_DIR!\cadcamfun-desktop.exe" (
        echo   - !TARGET_DIR!\cadcamfun-desktop.exe
    )
    
    if exist "!TARGET_DIR!\bundle\msi" (
        for %%f in ("!TARGET_DIR!\bundle\msi\*.msi") do (
            echo   - %%f
        )
    )
    
    if exist "!TARGET_DIR!\bundle\nsis" (
        for %%f in ("!TARGET_DIR!\bundle\nsis\*.exe") do (
            echo   - %%f
        )
    )
    
    if exist "!TARGET_DIR!\portable" (
        echo   - !TARGET_DIR!\portable\ (Portable version)
    )
    
    for %%f in ("!TARGET_DIR!\*.zip") do (
        echo   - %%f
    )
)

echo.
echo %INFO% Installation instructions:
echo   1. Run the MSI installer for system-wide installation
echo   2. Or run the NSIS installer (.exe) for user installation
echo   3. Or use the portable version (no installation required)
echo   4. Or extract the ZIP file and run cadcamfun-desktop.exe
echo.

REM Check for Windows Defender exclusion recommendation
echo %INFO% Performance tip:
echo   For better build performance, consider adding your project folder
echo   to Windows Defender exclusions in Windows Security settings.
echo.

echo %SUCCESS% 🎉 Windows build process completed!
echo.
pause