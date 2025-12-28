#!/bin/bash

# Build script for Android TV app

echo "🚀 Building Connect Me If U Can Android TV App"
echo ""

# Check if Android SDK is available
if ! command -v adb &> /dev/null; then
    echo "❌ Android SDK not found. Please install Android Studio."
    exit 1
fi

# Set project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "📁 Project: $PROJECT_DIR"
echo ""

# Build APK
echo "🔨 Building APK..."
cd "$PROJECT_DIR"

if [ -f "gradlew" ]; then
    ./gradlew assembleDebug
else
    echo "⚠️  gradlew not found. Build manually in Android Studio."
    echo ""
    echo "Steps:"
    echo "1. Open Android Studio"
    echo "2. File > Open > $PROJECT_DIR"
    echo "3. Build > Build Bundle(s) / APK(s) > Build APK(s)"
    exit 1
fi

# Check if build succeeded
APK_PATH="$PROJECT_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    echo "✅ APK built successfully!"
    echo "📦 Location: $APK_PATH"
    echo ""
    
    # Ask to install
    read -p "Install on connected Android TV device? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📱 Installing APK..."
        adb install -r "$APK_PATH"
        
        if [ $? -eq 0 ]; then
            echo "✅ App installed successfully!"
            echo ""
            echo "🎮 Launch the app on your Android TV:"
            echo "   com.connectmeifucan.app/.MainActivity"
        else
            echo "❌ Installation failed. Make sure device is connected:"
            echo "   adb devices"
        fi
    fi
else
    echo "❌ Build failed. Check errors above."
    exit 1
fi

echo ""
echo "Done! 🎉"
