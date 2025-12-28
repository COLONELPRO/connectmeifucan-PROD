# Complete System Deployment Guide

## Architecture Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  index.com.html │─────▶│  Backend API    │◀─────│  Android TV App │
│  (Auth Entry)   │      │  (Node.js/CF)   │      │  (Room Manager) │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                        │                         │
         │                        │                         │
         ▼                        ▼                         ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   index.html    │      │  MQTT Broker    │      │   Game Session  │
│  (Main App)     │      │  (Optional)     │      │   (WebView)     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

## Component 1: Frontend (Web)

### Files
- `index.com.html` - Authentication entry page
- `index.html` - Main application
- `location batterie.html` - Battery location page
- `thank_you.html` - Thank you page

### Deployment Options

#### Option A: Cloudflare Pages (Recommended)
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy frontend
cd connectmeifucan-PROD
wrangler pages deploy . --project-name=cmuc-frontend

# Configure custom domain
# Dashboard > Pages > cmuc-frontend > Custom domains
# Add: connectmeifucan.com and www.connectmeifucan.com
```

#### Option B: Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd connectmeifucan-PROD
netlify deploy --prod

# Configure custom domain in Netlify Dashboard
```

#### Option C: Traditional Hosting (VPS/Shared)
```bash
# Upload files via FTP/SFTP
# Configure web server (Apache/NGINX)

# NGINX example
server {
    listen 80;
    server_name connectmeifucan.com;
    root /var/www/connectmeifucan;
    index index.com.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

---

## Component 2: Backend API

### Node.js (Development/VPS)

#### Prerequisites
- Node.js 16+
- npm or yarn

#### Setup
```bash
cd backend

# Install dependencies
npm install

# Create data directory
mkdir -p data

# Initialize data files
node scripts/init-codes.js

# Start server
node server.js

# Or with PM2 (production)
npm install -g pm2
pm2 start server.js --name cmuc-api
pm2 save
pm2 startup
```

#### Environment Variables
```bash
PORT=3000
MQTT_BROKER=mqtt://broker.hivemq.com:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

#### NGINX Reverse Proxy
```nginx
server {
    listen 443 ssl http2;
    server_name api.connectmeifucan.com;
    
    ssl_certificate /etc/letsencrypt/live/api.connectmeifucan.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.connectmeifucan.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Cloudflare Workers (Production)

#### Prerequisites
- Cloudflare account
- Wrangler CLI

#### Setup
```bash
cd backend

# Create KV namespaces
wrangler kv:namespace create "USERS"
wrangler kv:namespace create "ACCESS_CODES"
wrangler kv:namespace create "ROOMS"

# Update wrangler.toml with namespace IDs
# Edit wrangler.toml and replace placeholder IDs

# Initialize access codes
node scripts/init-codes.js

# Upload codes to KV
wrangler kv:key put --namespace-id=YOUR_ACCESS_CODES_ID "codes" @data/access_codes.json

# Deploy worker
wrangler deploy

# Configure custom route
# Dashboard > Workers > Routes
# Add: api.connectmeifucan.com/* -> cmuc-backend-prod
```

#### Environment Variables (Cloudflare)
```bash
wrangler secret put MQTT_BROKER
# Enter: mqtt://broker.hivemq.com:1883
```

---

## Component 3: Android TV App

### Build Prerequisites
- Android Studio Arctic Fox or later
- JDK 11+
- Android SDK 34
- Gradle 7.0+

### Configuration

1. **Open Project**
   ```bash
   # Open Android Studio
   File > Open > android-tv/
   ```

2. **Update API Endpoint**
   ```java
   // RoomActivity.java
   private static final String API_BASE = "https://api.connectmeifucan.com";
   ```

3. **Sync Gradle**
   ```
   File > Sync Project with Gradle Files
   ```

### Build APK

#### Debug Build
```bash
cd android-tv

# Windows
gradlew.bat assembleDebug

# Mac/Linux
./gradlew assembleDebug

# Output: app/build/outputs/apk/debug/app-debug.apk
```

#### Release Build
```bash
# Create keystore
keytool -genkey -v -keystore release.keystore -alias cmuc -keyalg RSA -keysize 2048 -validity 10000

# Configure signing in app/build.gradle
signingConfigs {
    release {
        storeFile file('release.keystore')
        storePassword 'YOUR_PASSWORD'
        keyAlias 'cmuc'
        keyPassword 'YOUR_PASSWORD'
    }
}

# Build release APK
gradlew assembleRelease

# Output: app/build/outputs/apk/release/app-release.apk
```

### Installation

#### Via ADB (Development)
```bash
# Connect device
adb connect YOUR_TV_IP:5555

# Install APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.connectmeifucan.app/.MainActivity
```

#### Via USB
```bash
# Enable USB debugging on Android TV
# Settings > Device Preferences > About > Build (tap 7 times)
# Settings > Device Preferences > Developer options > USB debugging

# Connect via USB
adb devices

# Install
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

#### Via Play Store (Production)
1. Create Google Play Console account ($25 one-time fee)
2. Create app listing
3. Upload signed APK/AAB
4. Configure store listing (title, description, screenshots)
5. Submit for review

---

## Complete Deployment Checklist

### 1. Backend Setup
- [ ] Create Cloudflare account
- [ ] Install Wrangler CLI: `npm install -g wrangler`
- [ ] Login: `wrangler login`
- [ ] Create KV namespaces: USERS, ACCESS_CODES, ROOMS
- [ ] Update wrangler.toml with KV IDs
- [ ] Upload access codes to KV
- [ ] Deploy worker: `wrangler deploy`
- [ ] Test endpoints: `/health`, `/auth/check`

### 2. Frontend Setup
- [ ] Configure API_BASE in index.com.html: `https://api.connectmeifucan.com`
- [ ] Deploy to Cloudflare Pages: `wrangler pages deploy .`
- [ ] Configure custom domain: connectmeifucan.com
- [ ] Test authentication flow
- [ ] Test catalogue and cart functionality

### 3. Android TV Setup
- [ ] Update API_BASE in RoomActivity.java
- [ ] Build debug APK: `./gradlew assembleDebug`
- [ ] Test on Android TV device
- [ ] Create release keystore
- [ ] Build release APK: `./gradlew assembleRelease`
- [ ] Sign APK for distribution

### 4. DNS Configuration
```
Type    Name                 Value                       TTL
A       @                    YOUR_PAGES_IP               Auto
CNAME   www                  cmuc-frontend.pages.dev     Auto
CNAME   api                  YOUR_WORKER_DOMAIN          Auto
```

### 5. Testing
- [ ] Test web authentication (FR/EN)
- [ ] Test access code flow (DEMO2025, TESTCODE)
- [ ] Test catalogue/cart on web
- [ ] Test Android TV authentication
- [ ] Test room creation (4-letter code)
- [ ] Test room joining
- [ ] Test WebView display in GameActivity
- [ ] Test mobile + TV interaction

---

## Monitoring & Maintenance

### Backend Health Check
```bash
curl https://api.connectmeifucan.com/health
```

### Cloudflare Analytics
- Dashboard > Analytics & Logs
- Monitor requests, errors, latency
- Set up alerts for downtime

### KV Storage Management
```bash
# List all keys in namespace
wrangler kv:key list --namespace-id=YOUR_USERS_ID

# Get user data
wrangler kv:key get "username" --namespace-id=YOUR_USERS_ID

# Delete expired rooms
wrangler kv:key delete "ABCD" --namespace-id=YOUR_ROOMS_ID
```

### Logs
```bash
# Cloudflare Worker logs
wrangler tail

# Node.js logs (if using VPS)
pm2 logs cmuc-api
```

---

## Troubleshooting

### Frontend can't reach API
- Check API_BASE URL in index.com.html
- Verify CORS headers in backend
- Test API endpoint directly: `curl https://api.connectmeifucan.com/health`

### Android app authentication fails
- Verify API_BASE in RoomActivity.java matches backend URL
- Check network permissions in AndroidManifest.xml
- Enable cleartext traffic for local testing (already configured)

### Room creation fails
- Check ROOMS KV namespace exists
- Verify wrangler.toml has ROOMS binding
- Test endpoint: `curl -X POST https://api.connectmeifucan.com/rooms/create -H "Authorization: Bearer TOKEN" -d '{"roomId":"TEST","username":"user"}'`

### WebView blank in Android app
- Check JavaScript enabled in WebView settings
- Verify URL is correct
- Check CORS on backend
- Test URL in browser first

---

## Security Considerations

### Production Checklist
- [ ] Use HTTPS for all endpoints
- [ ] Implement rate limiting on API
- [ ] Validate all user inputs
- [ ] Sanitize room IDs (uppercase A-Z only)
- [ ] Set token expiration
- [ ] Implement refresh token flow
- [ ] Add CSRF protection
- [ ] Enable security headers (CSP, HSTS, etc.)
- [ ] Limit room creation per user
- [ ] Auto-close inactive rooms (TTL)

### Recommended Security Headers
```javascript
// Add to worker.js response headers
'Strict-Transport-Security': 'max-age=31536000',
'X-Content-Type-Options': 'nosniff',
'X-Frame-Options': 'DENY',
'X-XSS-Protection': '1; mode=block'
```

---

## Cost Estimation

### Cloudflare (Recommended Stack)
- Workers: **Free** (100k requests/day)
- KV: **Free** (100k reads/day, 1k writes/day)
- Pages: **Free** (Unlimited bandwidth)
- **Total: $0/month** for small-medium traffic

### Alternative: VPS
- DigitalOcean Droplet: **$6/month** (1GB RAM)
- Netlify: **Free** (100GB bandwidth)
- **Total: $6/month**

### Google Play Store
- One-time fee: **$25**

---

## Support & Documentation

- **Backend API**: [backend/README.md](backend/README.md)
- **Android TV**: [android-tv/README.md](android-tv/README.md)
- **Cloudflare Deployment**: [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md)
- **VPS Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md)

## Next Steps

1. **WebSocket Integration**: Add real-time multiplayer with Socket.io or native WebSocket
2. **Push Notifications**: Notify mobile users when invited to room
3. **Voice Chat**: Integrate WebRTC for voice communication
4. **Spectator Mode**: Allow users to watch games without joining
5. **Analytics**: Track room creation, join rates, active users

---

**Last Updated**: 2025-01-01  
**Version**: 1.0.0
