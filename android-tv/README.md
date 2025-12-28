# Connect Me If U Can - Android TV App

Android TV application with room-based multiplayer gaming system.

## Features

- **Authentication**: Uses the same authentication system as the web app
- **Room Management**: Create or join rooms with 4-letter codes
- **WebView Integration**: Displays the same UI as the web version
- **Multiplayer Ready**: Backend validates room IDs and manages player sessions
- **TV Optimized**: Leanback UI with D-pad navigation support

## Architecture

### Activities

1. **MainActivity**: Authentication screen
   - Loads index.com.html in WebView
   - Saves credentials to SharedPreferences
   - Redirects to RoomActivity after successful auth

2. **RoomActivity**: Room management screen
   - Create new room (generate or input 4-letter ID)
   - Join existing room by code
   - Backend validates uniqueness
   - Launches GameActivity on success

3. **GameActivity**: Game session screen
   - Loads index.html with room context
   - Shows room info bar at top
   - Hosts multiplayer game session
   - JavaScript bridge for game events

## API Endpoints

Backend must implement these room endpoints:

### POST /rooms/create
```json
Request:
{
  "roomId": "ABCD",
  "username": "player1",
  "host": true
}

Response:
{
  "success": true,
  "roomId": "ABCD",
  "host": "player1",
  "message": "Room created successfully"
}
```

### POST /rooms/join
```json
Request:
{
  "roomId": "ABCD",
  "username": "player2"
}

Response:
{
  "success": true,
  "roomId": "ABCD",
  "host": "player1",
  "players": ["player1", "player2"],
  "message": "Joined room successfully"
}
```

### GET /rooms/:roomId/status
```json
Response:
{
  "success": true,
  "room": {
    "id": "ABCD",
    "host": "player1",
    "players": ["player1", "player2"],
    "status": "active",
    "createdAt": "2025-01-01T12:00:00Z"
  }
}
```

### DELETE /rooms/:roomId
Only the host can close the room.

## Building the App

### Prerequisites

- Android Studio
- JDK 11 or higher
- Android SDK 34

### Build Steps

1. Open the project in Android Studio:
   ```
   File > Open > select android-tv folder
   ```

2. Sync Gradle dependencies

3. Configure API endpoint:
   - Open `RoomActivity.java`
   - Update `API_BASE` constant to your backend URL

4. Build APK:
   ```
   Build > Build Bundle(s) / APK(s) > Build APK(s)
   ```

5. Install on Android TV:
   ```bash
   adb connect YOUR_TV_IP
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

## Testing Locally

1. Start backend server:
   ```bash
   cd backend
   node server.js
   ```

2. Update `RoomActivity.java`:
   ```java
   private static final String API_BASE = "http://YOUR_LOCAL_IP:3000";
   ```

3. Enable cleartext traffic (already configured in AndroidManifest.xml)

4. Build and install APK

## D-pad Navigation

- **Arrow Keys**: Navigate between buttons
- **Enter/OK**: Activate button
- **Back**: Go back or exit

## JavaScript Bridge

The app exposes `AndroidApp` and `AndroidGame` interfaces to JavaScript:

### From index.com.html:
```javascript
// Called after successful authentication
AndroidApp.onAuthSuccess(username, token);
```

### From index.html (game screen):
```javascript
// Send game events to Android
AndroidGame.onGameEvent('player_action', JSON.stringify(data));

// Leave room and return to room selection
AndroidGame.leaveRoom();
```

### Injected Variables:
```javascript
window.ROOM_ID   // Current room code
window.USERNAME  // Player username
window.IS_HOST   // true if player is host
window.TOKEN     // Auth token
```

## Room ID Format

- **Length**: Exactly 4 characters
- **Characters**: Uppercase letters A-Z only
- **Examples**: GAME, ROOM, ABCD, WXYZ
- **Validation**: Backend checks uniqueness

## Future Enhancements

- WebSocket support for real-time multiplayer
- Voice chat integration
- Game state synchronization
- Player avatars and profiles
- Room password protection
- Spectator mode

## Troubleshooting

### App won't connect to backend
- Check `API_BASE` URL
- Verify backend is running
- Check network permissions in manifest
- Enable cleartext traffic for local testing

### Authentication fails
- Verify backend auth endpoints work
- Check token storage in SharedPreferences
- Test with mock mode first

### Room creation fails
- Backend might not have room endpoints
- Check room ID format (4 uppercase letters)
- Verify token is sent in Authorization header

### WebView blank screen
- Check JavaScript is enabled
- Verify URL is correct
- Check browser console for errors
- Ensure CORS is configured on backend

## License

Copyright © 2025 Connect Me If U Can
