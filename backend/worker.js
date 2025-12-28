// Cloudflare Worker pour le backend CMUC
// Adapté pour utiliser KV Store au lieu de fichiers JSON

import { RoomDurableObject } from './room-durable-object.js';

export { RoomDurableObject };

// Security utilities
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'`]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/\0/g, '');
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

function isValidRoomId(roomId) {
  return typeof roomId === 'string' && /^[A-Z]{4}$/.test(roomId);
}

function isValidAccessCode(code) {
  return typeof code === 'string' && /^[A-Z0-9]{4,20}$/.test(code);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      
      // Handle WebSocket connections for rooms
      const upgradeHeader = request.headers.get('Upgrade');
      console.log('[Worker] Path:', url.pathname, 'Upgrade header:', upgradeHeader);
    
    if (url.pathname.startsWith('/room/')) {
      if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        const roomCode = url.pathname.split('/')[2];
        console.log('[Worker] WebSocket request for room:', roomCode);
        
        if (!isValidRoomId(roomCode)) {
          console.log('[Worker] Invalid room code:', roomCode);
          return new Response('Invalid room code', { status: 400 });
        }
        
        // Get Durable Object instance for this room
        const id = env.ROOM_DO.idFromName(roomCode);
        const room = env.ROOM_DO.get(id);
        
        console.log('[Worker] Forwarding to Durable Object');
        // Forward the request to the Durable Object
        return room.fetch(request);
      } else {
        console.log('[Worker] Non-WebSocket request to /room/');
        return new Response('WebSocket upgrade required', { status: 426 });
      }
    }
    
    // CORS headers with security
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Routes
      if (url.pathname === '/health') {
        return jsonResponse({ status: 'ok', timestamp: Date.now() }, corsHeaders);
      }

      if (url.pathname === '/auth/check' && request.method === 'POST') {
        return handleCheck(request, env, corsHeaders);
      }

      if (url.pathname === '/auth/verify' && request.method === 'POST') {
        return handleVerify(request, env, corsHeaders);
      }

      if (url.pathname === '/auth/create' && request.method === 'POST') {
        return handleCreate(request, env, corsHeaders);
      }

      if (url.pathname.startsWith('/settings/')) {
        const username = url.pathname.split('/')[2];
        if (request.method === 'GET') {
          return handleGetSettings(username, request, env, corsHeaders);
        }
        if (request.method === 'POST') {
          return handleUpdateSettings(username, request, env, corsHeaders);
        }
      }

      if (url.pathname === '/rooms/create' && request.method === 'POST') {
        return handleCreateRoom(request, env, corsHeaders);
      }

      if (url.pathname === '/rooms/join' && request.method === 'POST') {
        return handleJoinRoom(request, env, corsHeaders);
      }

      if (url.pathname.startsWith('/rooms/') && url.pathname.endsWith('/status') && request.method === 'GET') {
        const roomId = url.pathname.split('/')[2];
        return handleRoomStatus(roomId, env, corsHeaders);
      }

      if (url.pathname.startsWith('/rooms/') && request.method === 'DELETE') {
        const roomId = url.pathname.split('/')[2];
        return handleCloseRoom(roomId, request, env, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, corsHeaders, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, corsHeaders, 500);
    }
  }
};

async function handleCheck(request, env, corsHeaders) {
  let { username } = await request.json();
  
  if (!username) {
    return jsonResponse({ error: 'Username required' }, corsHeaders, 400);
  }
  
  username = sanitizeInput(username, 20);
  if (!isValidUsername(username)) {
    return jsonResponse({ error: 'Invalid username format. Use 3-20 alphanumeric characters.' }, corsHeaders, 400);
  }

  const userKey = username.toLowerCase();
  const user = await env.USERS.get(userKey, 'json');
  const accessCodes = await env.ACCESS_CODES.get('codes', 'json') || {};

  const response = {
    exists: !!user,
    hasAccess: user ? user.hasAccess || false : false,
    requireCode: user ? user.requireCode || false : false,
    requiresCodeForCreate: !user && Object.keys(accessCodes).length > 0
  };

  return jsonResponse(response, corsHeaders);
}

async function handleVerify(request, env, corsHeaders) {
  let { username, code } = await request.json();
  
  if (!username || !code) {
    return jsonResponse({ error: 'Username and code required' }, corsHeaders, 400);
  }
  
  username = sanitizeInput(username, 20);
  code = sanitizeInput(code, 20);
  if (!isValidUsername(username)) {
    return jsonResponse({ ok: false, error: 'Invalid username format' }, corsHeaders, 400);
  }
  if (!isValidAccessCode(code)) {
    return jsonResponse({ ok: false, error: 'Invalid access code format' }, corsHeaders, 400);
  }

  const userKey = username.toLowerCase();
  const user = await env.USERS.get(userKey, 'json');

  if (!user) {
    return jsonResponse({ ok: false, error: 'User not found' }, corsHeaders, 404);
  }

  const accessCodes = await env.ACCESS_CODES.get('codes', 'json') || {};
  const validCode = accessCodes[code] || (user.accessCode === code);
  
  if (!validCode) {
    return jsonResponse({ ok: false, error: 'Invalid code' }, corsHeaders, 401);
  }

  user.hasAccess = true;
  user.lastVerified = new Date().toISOString();
  user.token = generateToken();
  
  await env.USERS.put(userKey, JSON.stringify(user));

  return jsonResponse({ ok: true, token: user.token }, corsHeaders);
}

async function handleCreate(request, env, corsHeaders) {
  let { username, code } = await request.json();
  
  if (!username) {
    return jsonResponse({ error: 'Username required' }, corsHeaders, 400);
  }
  
  username = sanitizeInput(username, 20);
  if (code) code = sanitizeInput(code, 20);
  if (!isValidUsername(username)) {
    return jsonResponse({ ok: false, error: 'Invalid username format' }, corsHeaders, 400);
  }
  if (code && !isValidAccessCode(code)) {
    return jsonResponse({ ok: false, error: 'Invalid access code format' }, corsHeaders, 400);
  }

  const userKey = username.toLowerCase();
  const existingUser = await env.USERS.get(userKey);

  if (existingUser) {
    return jsonResponse({ ok: false, error: 'User already exists' }, corsHeaders, 409);
  }

  const accessCodes = await env.ACCESS_CODES.get('codes', 'json') || {};
  const requireCode = Object.keys(accessCodes).length > 0;

  if (requireCode) {
    if (!code || !accessCodes[code]) {
      return jsonResponse({ ok: false, error: 'Valid access code required' }, corsHeaders, 401);
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

  await env.USERS.put(userKey, JSON.stringify(newUser));

  return jsonResponse({ ok: true, token }, corsHeaders);
}

async function handleGetSettings(username, request, env, corsHeaders) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return jsonResponse({ error: 'Authorization required' }, corsHeaders, 401);
  }

  const userKey = username.toLowerCase();
  const user = await env.USERS.get(userKey, 'json');

  if (!user || user.token !== token) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  return jsonResponse({ settings: user.settings || {} }, corsHeaders);
}

async function handleUpdateSettings(username, request, env, corsHeaders) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const { settings } = await request.json();

  if (!token) {
    return jsonResponse({ error: 'Authorization required' }, corsHeaders, 401);
  }

  if (!settings || typeof settings !== 'object') {
    return jsonResponse({ error: 'Settings object required' }, corsHeaders, 400);
  }

  const userKey = username.toLowerCase();
  const user = await env.USERS.get(userKey, 'json');

  if (!user || user.token !== token) {
    return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
  }

  user.settings = { ...user.settings, ...settings };
  user.updatedAt = new Date().toISOString();
  
  await env.USERS.put(userKey, JSON.stringify(user));

  return jsonResponse({ ok: true, settings: user.settings }, corsHeaders);
}

// ========================================
// Security Helper Functions
// ========================================

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'&;]/g, '').trim();
}

// ========================================
// Room Management Functions
// ========================================

async function handleCreateRoom(request, env, corsHeaders) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const { roomId, username, host } = await request.json();

  if (!token) {
    return jsonResponse({ success: false, message: 'Authorization required' }, corsHeaders, 401);
  }

  // Sanitize inputs
  const sanitizedRoomId = sanitizeString(roomId).toUpperCase();
  const sanitizedUsername = sanitizeString(username);

  if (!sanitizedRoomId || !sanitizedUsername) {
    return jsonResponse({ success: false, message: 'Room ID and username required' }, corsHeaders, 400);
  }

  // Validate formats
  if (!isValidUsername(sanitizedUsername)) {
    return jsonResponse({ 
      success: false, 
      message: 'Invalid username format (3-20 alphanumeric characters)' 
    }, corsHeaders, 400);
  }

  if (!isValidRoomId(sanitizedRoomId)) {
    return jsonResponse({ 
      success: false, 
      message: 'Room ID must be 4 uppercase letters (A-Z)' 
    }, corsHeaders, 400);
  }

  // Check if room already exists
  const existingRoom = await env.ROOMS.get(sanitizedRoomId, 'json');
  if (existingRoom) {
    return jsonResponse({ 
      success: false, 
      message: 'Room ID already exists. Try another code.' 
    }, corsHeaders, 409);
  }

  // Create room with sanitized values
  const room = {
    id: sanitizedRoomId,
    host: sanitizedUsername,
    players: [sanitizedUsername],
    createdAt: new Date().toISOString(),
    status: 'active',
    maxPlayers: 8
  };

  await env.ROOMS.put(sanitizedRoomId, JSON.stringify(room));

  return jsonResponse({ 
    success: true, 
    roomId: sanitizedRoomId, 
    host: sanitizedUsername,
    message: 'Room created successfully' 
  }, corsHeaders);
}

async function handleJoinRoom(request, env, corsHeaders) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const { roomId, username } = await request.json();

  if (!token) {
    return jsonResponse({ success: false, message: 'Authorization required' }, corsHeaders, 401);
  }

  // Sanitize inputs
  const sanitizedRoomId = sanitizeString(roomId).toUpperCase();
  const sanitizedUsername = sanitizeString(username);

  if (!sanitizedRoomId || !sanitizedUsername) {
    return jsonResponse({ success: false, message: 'Room ID and username required' }, corsHeaders, 400);
  }

  // Validate formats
  if (!isValidUsername(sanitizedUsername)) {
    return jsonResponse({ 
      success: false, 
      message: 'Invalid username format' 
    }, corsHeaders, 400);
  }

  if (!isValidRoomId(sanitizedRoomId)) {
    return jsonResponse({ 
      success: false, 
      message: 'Invalid room ID format' 
    }, corsHeaders, 400);
  }

  const room = await env.ROOMS.get(sanitizedRoomId, 'json');

  if (!room) {
    return jsonResponse({ 
      success: false, 
      message: 'Room not found. Check the code and try again.' 
    }, corsHeaders, 404);
  }

  if (room.status !== 'active') {
    return jsonResponse({ 
      success: false, 
      message: 'Room is not active' 
    }, corsHeaders, 400);
  }

  // Check max players limit
  if (!room.players.includes(sanitizedUsername) && room.players.length >= (room.maxPlayers || 8)) {
    return jsonResponse({ 
      success: false, 
      message: 'Room is full. Maximum players reached.' 
    }, corsHeaders, 400);
  }

  // Add player if not already in room
  if (!room.players.includes(sanitizedUsername)) {
    room.players.push(sanitizedUsername);
    await env.ROOMS.put(sanitizedRoomId, JSON.stringify(room));
  }

  return jsonResponse({ 
    success: true, 
    roomId: sanitizedRoomId, 
    host: room.host,
    players: room.players,
    message: 'Joined room successfully' 
  }, corsHeaders);
}

async function handleRoomStatus(roomId, env, corsHeaders) {
  const room = await env.ROOMS.get(roomId, 'json');

  if (!room) {
    return jsonResponse({ 
      success: false, 
      message: 'Room not found' 
    }, corsHeaders, 404);
  }

  return jsonResponse({ 
    success: true, 
    room: {
      id: room.id,
      host: room.host,
      players: room.players,
      status: room.status,
      createdAt: room.createdAt
    }
  }, corsHeaders);
}

async function handleCloseRoom(roomId, request, env, corsHeaders) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const { username } = await request.json();

  if (!token) {
    return jsonResponse({ success: false, message: 'Authorization required' }, corsHeaders, 401);
  }

  const room = await env.ROOMS.get(roomId, 'json');

  if (!room) {
    return jsonResponse({ 
      success: false, 
      message: 'Room not found' 
    }, corsHeaders, 404);
  }

  // Only host can close the room
  if (room.host !== username) {
    return jsonResponse({ 
      success: false, 
      message: 'Only the host can close the room' 
    }, corsHeaders, 403);
  }

  await env.ROOMS.delete(roomId);

  return jsonResponse({ 
    success: true, 
    message: 'Room closed successfully' 
  }, corsHeaders);
}

function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
