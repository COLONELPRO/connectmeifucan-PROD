const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Security: Rate limiting per IP
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window

// Configuration
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const ACCESS_CODES_FILE = path.join(__dirname, 'data', 'access_codes.json');
const ROOMS_FILE = path.join(__dirname, 'data', 'rooms.json');
const IMAGES_DIR = path.join(__dirname, 'data', 'images');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit payload size

// Security middleware
app.use((req, res, next) => {
  // Rate limiting
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const requestData = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (now > requestData.resetTime) {
    requestData.count = 0;
    requestData.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  requestData.count++;
  requestCounts.set(ip, requestData);
  
  if (requestData.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  next();
});

// MQTT Client
let mqttClient = null;

function connectMQTT() {
  const options = {
    clientId: `cmuc_backend_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
  };
  
  if (MQTT_USERNAME) {
    options.username = MQTT_USERNAME;
    options.password = MQTT_PASSWORD;
  }

  mqttClient = mqtt.connect(MQTT_BROKER, options);

  mqttClient.on('connect', () => {
    console.log('✅ Connected to MQTT broker:', MQTT_BROKER);
    mqttClient.subscribe('cmuc/auth/+', (err) => {
      if (err) console.error('MQTT subscribe error:', err);
      else console.log('📡 Subscribed to cmuc/auth/+');
    });
  });

  mqttClient.on('error', (err) => {
    console.error('❌ MQTT error:', err.message);
  });

  mqttClient.on('message', (topic, message) => {
    console.log(`📨 MQTT message [${topic}]:`, message.toString());
  });
}

// Initialize MQTT (optional, runs without broker)
try {
  connectMQTT();
} catch (err) {
  console.warn('⚠️  MQTT disabled (broker unavailable)');
}

// Database helpers
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function ensureImagesDir() {
  try {
    await fs.mkdir(IMAGES_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function ensureUserImagesDir(username) {
  await ensureImagesDir();
  const dir = path.join(IMAGES_DIR, username.toLowerCase());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeUsers(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

async function readAccessCodes() {
  try {
    const data = await fs.readFile(ACCESS_CODES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAccessCodes(codes) {
  await ensureDataDir();
  await fs.writeFile(ACCESS_CODES_FILE, JSON.stringify(codes, null, 2), 'utf-8');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function publishMQTT(topic, payload) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 });
  }
}

// Authorization helper for user-scoped routes
async function authorizeUser(req, res, username) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Authorization required' });
    return false;
  }
  try {
    const users = await readUsers();
    const user = users[username.toLowerCase()];
    if (!user || user.token !== token) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
  } catch (_) {
    res.status(500).json({ error: 'Internal server error' });
    return false;
  }
  return true;
}

// Auth endpoints

// POST /auth/check - Check if username exists and access status
app.post('/auth/check', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' });
    }

    const users = await readUsers();
    const codes = await readAccessCodes();
    const user = users[username.toLowerCase()];

    const response = {
      exists: !!user,
      hasAccess: user ? user.hasAccess || false : false,
      requireCode: user ? user.requireCode || false : false,
      requiresCodeForCreate: !user && Object.keys(codes).length > 0
    };

    // Publish to MQTT
    publishMQTT('cmuc/auth/check', { username, ...response, timestamp: Date.now() });

    res.json(response);
  } catch (err) {
    console.error('Error in /auth/check:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/verify - Verify access code for existing user
app.post('/auth/verify', async (req, res) => {
  try {
    const { username, code } = req.body;
    
    if (!username || !code) {
      return res.status(400).json({ error: 'Username and code required' });
    }

    const users = await readUsers();
    const codes = await readAccessCodes();
    const user = users[username.toLowerCase()];

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if code is valid
    const validCode = codes[code] || (user.accessCode === code);
    
    if (!validCode) {
      publishMQTT('cmuc/auth/verify_failed', { username, timestamp: Date.now() });
      return res.status(401).json({ ok: false, error: 'Invalid code' });
    }

    // Update user access
    user.hasAccess = true;
    user.lastVerified = new Date().toISOString();
    await writeUsers(users);

    const token = generateToken();
    user.token = token;
    await writeUsers(users);

    publishMQTT('cmuc/auth/verify_success', { username, timestamp: Date.now() });

    res.json({ ok: true, token });
  } catch (err) {
    console.error('Error in /auth/verify:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// POST /auth/create - Create new user account
app.post('/auth/create', async (req, res) => {
  try {
    const { username, code } = req.body;
    
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username required' });
    }

    const users = await readUsers();
    const userKey = username.toLowerCase();

    if (users[userKey]) {
      return res.status(409).json({ ok: false, error: 'User already exists' });
    }

    // Check if access code is required and valid
    const codes = await readAccessCodes();
    const requireCode = Object.keys(codes).length > 0;

    if (requireCode) {
      if (!code || !codes[code]) {
        return res.status(401).json({ ok: false, error: 'Valid access code required' });
      }
    }

    const token = generateToken();
    const newUser = {
      username,
      createdAt: new Date().toISOString(),
      hasAccess: true,
      token,
      settings: {}
    };

    users[userKey] = newUser;
    await writeUsers(users);

    publishMQTT('cmuc/auth/create_success', { username, timestamp: Date.now() });

    res.json({ ok: true, token });
  } catch (err) {
    console.error('Error in /auth/create:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// POST /auth/login - Login with token (optional)
app.post('/auth/login', async (req, res) => {
  try {
    const { username, token } = req.body;
    
    if (!username || !token) {
      return res.status(400).json({ error: 'Username and token required' });
    }

    const users = await readUsers();
    const user = users[username.toLowerCase()];

    if (!user || user.token !== token) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    publishMQTT('cmuc/auth/login', { username, timestamp: Date.now() });

    res.json({ ok: true, user: { username: user.username, settings: user.settings } });
  } catch (err) {
    console.error('Error in /auth/login:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// GET /settings/:username - Get user settings
app.get('/settings/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const users = await readUsers();
    const user = users[username.toLowerCase()];

    if (!user || user.token !== token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({ settings: user.settings || {} });
  } catch (err) {
    console.error('Error in GET /settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /settings/:username - Update user settings
app.post('/settings/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { settings } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object required' });
    }

    const users = await readUsers();
    const user = users[username.toLowerCase()];

    if (!user || user.token !== token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    user.settings = { ...user.settings, ...settings };
    user.updatedAt = new Date().toISOString();
    await writeUsers(users);

    publishMQTT('cmuc/settings/update', { username, settings, timestamp: Date.now() });

    res.json({ ok: true, settings: user.settings });
  } catch (err) {
    console.error('Error in POST /settings:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================
// Room Management
// =========================

// Read rooms from file
async function readRooms() {
  try {
    const data = await fs.readFile(ROOMS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

// Write rooms to file
async function writeRooms(rooms) {
  await fs.writeFile(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

// Input sanitization helper
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  // Remove any HTML tags and special characters that could be used for injection
  return str.replace(/[<>"'&;]/g, '').trim();
}

function sanitizeFilename(name) {
  if (typeof name !== 'string') return '';
  // Allow only safe characters and basic dots/underscores/hyphens
  return name.replace(/[^a-zA-Z0-9._-]/g, '').trim();
}

// Validate username format
function isValidUsername(username) {
  if (typeof username !== 'string') return false;
  // Allow alphanumeric, underscore, dash, 3-20 characters
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map();

function checkRateLimit(identifier, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(identifier) || [];
  
  // Remove old requests outside the time window
  const recentRequests = userRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  recentRequests.push(now);
  rateLimitMap.set(identifier, recentRequests);
  return true;
}

// =========================
// Image Upload (max 5 per user)
// =========================

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const extForMime = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const username = sanitizeString(req.params.username || '');
      if (!isValidUsername(username)) return cb(new Error('Invalid username'));
      const dir = await ensureUserImagesDir(username);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = extForMime[file.mimetype] || path.extname(file.originalname).toLowerCase();
    const safeBase = crypto.randomBytes(8).toString('hex');
    cb(null, `${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) return cb(new Error('Only JPEG/PNG/WEBP allowed'));
    cb(null, true);
  }
});

async function listUserImages(username) {
  const dir = path.join(IMAGES_DIR, username.toLowerCase());
  try {
    const items = await fs.readdir(dir);
    return items.filter(name => /\.(jpg|jpeg|png|webp)$/i.test(name)).map(sanitizeFilename);
  } catch (_) {
    return [];
  }
}

// List images
app.get('/users/:username/images', async (req, res) => {
  try {
    const username = sanitizeString(req.params.username);
    if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username' });
    const ok = await authorizeUser(req, res, username);
    if (!ok) return;
    const files = await listUserImages(username);
    res.json({ ok: true, files });
  } catch (err) {
    console.error('Error in GET /users/:username/images:', err);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// Upload images (array field name: "images")
app.post('/users/:username/images', upload.array('images', 5), async (req, res) => {
  try {
    const username = sanitizeString(req.params.username);
    if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username' });
    const ok = await authorizeUser(req, res, username);
    if (!ok) return;

    const existing = await listUserImages(username);
    const remaining = Math.max(0, 5 - existing.length);

    const uploaded = (req.files || []).map(f => sanitizeFilename(path.basename(f.filename)));
    if (uploaded.length > remaining) {
      // Delete just-uploaded files to enforce cap
      const dir = path.join(IMAGES_DIR, username.toLowerCase());
      const toDelete = uploaded.slice(remaining);
      await Promise.all(toDelete.map(name => fs.unlink(path.join(dir, name)).catch(() => {})));
      const kept = uploaded.slice(0, remaining);
      const all = [...existing, ...kept];
      return res.status(400).json({ ok: false, message: 'Image limit reached (max 5)', files: all });
    }

    const files = [...existing, ...uploaded];
    res.json({ ok: true, files });
  } catch (err) {
    console.error('Error in POST /users/:username/images:', err);
    res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
});

// Serve one image (controlled, no directory traversal)
app.get('/users/:username/images/:name', async (req, res) => {
  try {
    const username = sanitizeString(req.params.username);
    if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username' });
    const ok = await authorizeUser(req, res, username);
    if (!ok) return;

    const name = sanitizeFilename(req.params.name || '');
    if (!name || !/\.(jpg|jpeg|png|webp)$/i.test(name)) {
      return res.status(400).json({ error: 'Invalid image name' });
    }
    const filePath = path.join(IMAGES_DIR, username.toLowerCase(), name);
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});

// Delete image
app.delete('/users/:username/images/:name', async (req, res) => {
  try {
    const username = sanitizeString(req.params.username);
    if (!isValidUsername(username)) return res.status(400).json({ error: 'Invalid username' });
    const ok = await authorizeUser(req, res, username);
    if (!ok) return;

    const name = sanitizeFilename(req.params.name || '');
    if (!name) return res.status(400).json({ error: 'Invalid image name' });
    const filePath = path.join(IMAGES_DIR, username.toLowerCase(), name);
    await fs.unlink(filePath);
    const files = await listUserImages(username);
    res.json({ ok: true, files });
  } catch (err) {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});

// Create a new room
app.post('/rooms/create', async (req, res) => {
  try {
    const { roomId, username, host } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization required' });
    }

    // Rate limiting
    if (!checkRateLimit(`room_create_${token}`, 5, 60000)) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many room creation attempts. Try again later.' 
      });
    }

    // Sanitize inputs
    const sanitizedRoomId = sanitizeString(roomId).toUpperCase();
    const sanitizedUsername = sanitizeString(username);

    if (!sanitizedRoomId || !sanitizedUsername) {
      return res.status(400).json({ success: false, message: 'Room ID and username required' });
    }

    // Validate username format
    if (!isValidUsername(sanitizedUsername)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid username format (3-20 alphanumeric characters)' 
      });
    }

    // Validate room ID format (4 uppercase letters only)
    if (!/^[A-Z]{4}$/.test(sanitizedRoomId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room ID must be 4 uppercase letters (A-Z)' 
      });
    }

    const rooms = await readRooms();

    // Check if room ID already exists
    if (rooms[roomId]) {
      return res.status(409).json({ 
        success: false, 
        message: 'Room ID already exists. Try another code.' 
      });
    }

    // Create room with sanitized values
    rooms[sanitizedRoomId] = {
      id: sanitizedRoomId,
      host: sanitizedUsername,
      players: [sanitizedUsername],
      createdAt: new Date().toISOString(),
      status: 'active',
      maxPlayers: 8 // Limit players per room
    };

    await writeRooms(rooms);

    publishMQTT('cmuc/rooms/created', { roomId: sanitizedRoomId, host: sanitizedUsername, timestamp: Date.now() });

    res.json({ 
      success: true, 
      roomId: sanitizedRoomId, 
      host: sanitizedUsername,
      message: 'Room created successfully' 
    });
  } catch (err) {
    console.error('Error in POST /rooms/create:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Join an existing room
app.post('/rooms/join', async (req, res) => {
  try {
    const { roomId, username } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization required' });
    }

    // Rate limiting
    if (!checkRateLimit(`room_join_${token}`, 20, 60000)) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many join attempts. Try again later.' 
      });
    }

    // Sanitize inputs
    const sanitizedRoomId = sanitizeString(roomId).toUpperCase();
    const sanitizedUsername = sanitizeString(username);

    if (!sanitizedRoomId || !sanitizedUsername) {
      return res.status(400).json({ success: false, message: 'Room ID and username required' });
    }

    // Validate formats
    if (!isValidUsername(sanitizedUsername)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid username format' 
      });
    }

    if (!/^[A-Z]{4}$/.test(sanitizedRoomId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid room ID format' 
      });
    }

    const rooms = await readRooms();
    const room = rooms[sanitizedRoomId];

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found. Check the code and try again.' 
      });
    }

    if (room.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'Room is not active' 
      });
    }

    // Check max players limit
    if (!room.players.includes(sanitizedUsername) && room.players.length >= (room.maxPlayers || 8)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Room is full. Maximum players reached.' 
      });
    }

    // Add player if not already in room
    if (!room.players.includes(sanitizedUsername)) {
      room.players.push(sanitizedUsername);
      await writeRooms(rooms);
    }

    publishMQTT('cmuc/rooms/joined', { roomId: sanitizedRoomId, username: sanitizedUsername, timestamp: Date.now() });

    res.json({ 
      success: true, 
      roomId: sanitizedRoomId, 
      host: room.host,
      players: room.players,
      message: 'Joined room successfully' 
    });
  } catch (err) {
    console.error('Error in POST /rooms/join:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Get room status
app.get('/rooms/:roomId/status', async (req, res) => {
  try {
    const { roomId } = req.params;
    const rooms = await readRooms();
    const room = rooms[roomId];

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }

    res.json({ 
      success: true, 
      room: {
        id: room.id,
        host: room.host,
        players: room.players,
        status: room.status,
        createdAt: room.createdAt
      }
    });
  } catch (err) {
    console.error('Error in GET /rooms/:roomId/status:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Close/delete a room
app.delete('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authorization required' });
    }

    const rooms = await readRooms();
    const room = rooms[roomId];

    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found' 
      });
    }

    // Only host can close the room
    if (room.host !== username) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the host can close the room' 
      });
    }

    delete rooms[roomId];
    await writeRooms(rooms);

    publishMQTT('cmuc/rooms/closed', { roomId, timestamp: Date.now() });

    res.json({ 
      success: true, 
      message: 'Room closed successfully' 
    });
  } catch (err) {
    console.error('Error in DELETE /rooms/:roomId:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt: mqttClient?.connected || false,
    timestamp: Date.now()
  });
});

// Start server
const httpServer = server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket running on ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (mqttClient) {
    mqttClient.end();
  }
  wss.clients.forEach(client => client.close());
  process.exit(0);
});

// ==========================================
// WEBSOCKET ROOM SYNCHRONIZATION
// ==========================================
const roomConnections = new Map(); // roomCode -> Set of WebSocket clients

wss.on('connection', (ws) => {
  console.log('🔗 WebSocket client connected');
  
  let clientRoom = null;
  let clientType = null; // 'web' or 'tv'
  let clientName = null;
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      console.log('📨 WebSocket message:', message);
      
      switch(message.type) {
        case 'JOIN_ROOM':
          await handleJoinRoom(ws, message, (room) => { clientRoom = room; }, (type) => { clientType = type; }, (name) => { clientName = name; });
          break;
          
        case 'LEAVE_ROOM':
          await handleLeaveRoom(ws, clientRoom, clientType, clientName, () => { clientRoom = null; });
          break;
          
        case 'TOGGLE_READY':
          await handleToggleReady(ws, clientRoom, clientName);
          break;
          
        case 'CHANGE_HOST':
          await handleChangeHost(ws, clientRoom, message.host);
          break;
          
        case 'ROOM_STATE':
          await handleRoomStateUpdate(ws, clientRoom, message.data);
          break;
          
        case 'CREATE_ROOM':
          await handleCreateRoom(ws, message, (room) => { clientRoom = room; }, (type) => { clientType = type; }, (name) => { clientName = name; });
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid message format' }));
    }
  });
  
  ws.on('close', async () => {
    console.log('🔌 WebSocket client disconnected');
    if (clientRoom) {
      await handleLeaveRoom(ws, clientRoom, clientType, clientName, () => { clientRoom = null; });
    }
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// WebSocket Handlers
async function handleCreateRoom(ws, message, setRoom, setType, setName) {
  try {
    const rooms = await readRooms();
    const roomCode = (message.roomCode ? String(message.roomCode).toUpperCase() : generateRoomCode());
    const clientType = message.clientType || 'web';
    const clientName = message.clientName || (clientType === 'tv' ? 'Android TV' : 'Guest');
    
    // If room already exists, treat as join
    if (rooms[roomCode]) {
      const room = rooms[roomCode];
      room.players = (room.players || []).filter(p => !(p.type === clientType && p.name === clientName));
      room.players.push({ name: clientName, type: clientType, ready: false, joinedAt: Date.now() });
      await writeRooms(rooms);
      
      setRoom(roomCode);
      setType(clientType);
      setName(clientName);
      registerWebSocketConnection(roomCode, ws);
      broadcastToRoom(roomCode, { type: 'ROOM_UPDATED', room });
      ws.send(JSON.stringify({ type: 'ROOM_JOINED', room }));
      return;
    }

    const newRoom = {
      code: roomCode,
      created: Date.now(),
      host: clientType,
      players: [{
        name: clientName,
        type: clientType,
        ready: false,
        joinedAt: Date.now()
      }],
      status: 'open',
      tvState: null // State of TV simulator
    };
    rooms[roomCode] = newRoom;
    await writeRooms(rooms);
    
    setRoom(roomCode);
    setType(clientType);
    setName(clientName);
    registerWebSocketConnection(roomCode, ws);
    broadcastToRoom(roomCode, { type: 'ROOM_UPDATED', room: newRoom });
    ws.send(JSON.stringify({ type: 'ROOM_CREATED', room: newRoom }));
  } catch (err) {
    console.error('Error creating room:', err);
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to create room' }));
  }
}

async function handleJoinRoom(ws, message, setRoom, setType, setName) {
  try {
    const roomCode = message.roomCode.toUpperCase();
    const rooms = await readRooms();
    const room = rooms[roomCode];
    
    if (!room) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Room not found' }));
      return;
    }
    
    const clientType = message.clientType || 'web';
    const clientName = message.clientName || (clientType === 'tv' ? 'Android TV' : 'Guest');
    
    // Remove if already in room
    room.players = room.players.filter(p => !(p.type === clientType && p.name === clientName));
    
    // Add player
    room.players.push({
      name: clientName,
      type: clientType,
      ready: false,
      joinedAt: Date.now()
    });
    
    await writeRooms(rooms);
    
    setRoom(roomCode);
    setType(clientType);
    setName(clientName);
    
    registerWebSocketConnection(roomCode, ws);
    broadcastToRoom(roomCode, {
      type: 'ROOM_UPDATED',
      room: room
    });
    
    ws.send(JSON.stringify({
      type: 'ROOM_JOINED',
      room: room
    }));
  } catch (err) {
    console.error('Error joining room:', err);
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to join room' }));
  }
}

async function handleLeaveRoom(ws, roomCode, clientType, clientName, clearRoom) {
  try {
    if (!roomCode) return;
    
    const rooms = await readRooms();
    const room = rooms[roomCode];
    
    if (room) {
      room.players = room.players.filter(p => !(p.type === clientType && p.name === clientName));
      
      // Delete room if empty
      if (room.players.length === 0) {
        delete rooms[roomCode];
      }
      
      await writeRooms(rooms);
    }
    
    unregisterWebSocketConnection(roomCode, ws);
    
    if (room && room.players.length > 0) {
      broadcastToRoom(roomCode, {
        type: 'ROOM_UPDATED',
        room: room
      });
    }
    
    clearRoom();
  } catch (err) {
    console.error('Error leaving room:', err);
  }
}

async function handleToggleReady(ws, roomCode, clientName) {
  try {
    if (!roomCode) return;
    
    const rooms = await readRooms();
    const room = rooms[roomCode];
    
    if (!room) return;
    
    const player = room.players.find(p => p.name === clientName);
    if (!player) return;
    
    player.ready = !player.ready;
    await writeRooms(rooms);
    
    broadcastToRoom(roomCode, {
      type: 'ROOM_UPDATED',
      room: room
    });
  } catch (err) {
    console.error('Error toggling ready:', err);
  }
}

async function handleChangeHost(ws, roomCode, newHostType) {
  try {
    if (!roomCode || !newHostType) return;
    
    const rooms = await readRooms();
    const room = rooms[roomCode];
    
    if (!room) return;
    
    // Validate newHostType is 'tv' or 'web'
    if (!['tv', 'web'].includes(newHostType)) return;
    
    room.host = newHostType;
    await writeRooms(rooms);
    
    broadcastToRoom(roomCode, {
      type: 'ROOM_UPDATED',
      room: room
    });
  } catch (err) {
    console.error('Error changing host:', err);
  }
}

async function handleRoomStateUpdate(ws, roomCode, stateData) {
  try {
    if (!roomCode) return;
    
    const rooms = await readRooms();
    const room = rooms[roomCode];
    
    if (!room) return;
    
    room.tvState = stateData;
    await writeRooms(rooms);
    
    broadcastToRoom(roomCode, {
      type: 'ROOM_STATE_UPDATED',
      tvState: stateData
    });
  } catch (err) {
    console.error('Error updating room state:', err);
  }
}

function registerWebSocketConnection(roomCode, ws) {
  if (!roomConnections.has(roomCode)) {
    roomConnections.set(roomCode, new Set());
  }
  roomConnections.get(roomCode).add(ws);
}

function unregisterWebSocketConnection(roomCode, ws) {
  const connections = roomConnections.get(roomCode);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      roomConnections.delete(roomCode);
    }
  }
}

function broadcastToRoom(roomCode, message) {
  const connections = roomConnections.get(roomCode);
  if (!connections) return;
  
  const data = JSON.stringify(message);
  connections.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Helper functions
async function readRooms() {
  try {
    const data = await fs.readFile(ROOMS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

async function writeRooms(rooms) {
  await fs.writeFile(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}
