// Durable Object for managing game rooms with WebSocket connections
export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // WebSocket connections: sessionId -> { ws, clientType, clientName, isReady }
    this.roomData = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    
    console.log('[DurableObject] fetch() called, path:', url.pathname, 'Upgrade:', upgradeHeader);
    
    // Handle WebSocket upgrade
    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      console.log('[DurableObject] Handling WebSocket upgrade');
      return this.handleWebSocket(request);
    }

    // Handle REST API for room info
    if (url.pathname === '/info') {
      const roomData = await this.getRoomInfo();
      return new Response(JSON.stringify(roomData), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('[DurableObject] No handler found, returning 404');
    return new Response('Not found', { status: 404 });
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    await this.handleSession(server, request);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws, request) {
    ws.accept();
    
    const sessionId = crypto.randomUUID();
    const session = {
      ws,
      clientType: null,
      clientName: null,
      isReady: false,
      sessionId
    };
    
    this.sessions.set(sessionId, session);

    ws.addEventListener('message', async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        await this.handleMessage(sessionId, data);
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendToSession(sessionId, {
          type: 'ERROR',
          error: error.message
        });
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      this.broadcast({
        type: 'PARTICIPANT_LEFT',
        sessionId,
        participants: this.getParticipants()
      });
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.sessions.delete(sessionId);
    });
  }

  async handleMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (message.type) {
      case 'JOIN_ROOM':
        session.clientType = message.clientType || 'web';
        session.clientName = message.clientName || 'Guest';
        
        // Initialize room if needed
        if (!this.roomData) {
          this.roomData = {
            roomCode: message.roomCode,
            createdAt: Date.now(),
            host: session.clientType
          };
          await this.state.storage.put('roomData', this.roomData);
        }

        // Send room joined confirmation
        this.sendToSession(sessionId, {
          type: 'ROOM_JOINED',
          roomCode: this.roomData.roomCode,
          participants: this.getParticipants(),
          host: this.roomData.host
        });

        // Notify others
        this.broadcast({
          type: 'PARTICIPANT_JOINED',
          sessionId,
          clientType: session.clientType,
          clientName: session.clientName,
          participants: this.getParticipants()
        }, sessionId);
        break;

      case 'CREATE_ROOM':
        session.clientType = message.clientType || 'web';
        session.clientName = message.clientName || 'Host';
        
        // If room already exists (has data), don't recreate
        if (this.roomData) {
          this.sendToSession(sessionId, {
            type: 'ROOM_CREATED',
            roomCode: this.roomData.roomCode,
            participants: this.getParticipants(),
            host: this.roomData.host
          });
          break;
        }
        
        const roomCode = message.roomCode || this.generateRoomCode();
        this.roomData = {
          roomCode,
          createdAt: Date.now(),
          host: session.clientType
        };
        await this.state.storage.put('roomData', this.roomData);

        this.sendToSession(sessionId, {
          type: 'ROOM_CREATED',
          roomCode: this.roomData.roomCode,
          participants: this.getParticipants(),
          host: this.roomData.host
        });
        break;

      case 'TOGGLE_READY':
        session.isReady = !session.isReady;
        this.broadcast({
          type: 'READY_STATE_CHANGED',
          sessionId,
          isReady: session.isReady,
          participants: this.getParticipants()
        });
        break;

      case 'CHANGE_HOST':
        if (this.roomData) {
          this.roomData.host = message.host || 'web';
          await this.state.storage.put('roomData', this.roomData);
          this.broadcast({
            type: 'HOST_CHANGED',
            host: this.roomData.host
          });
        }
        break;

      case 'CONTROL_COMMAND':
        // Forward control commands to all participants
        this.broadcast({
          type: 'CONTROL_COMMAND',
          command: message.command,
          from: session.clientType
        }, sessionId);
        break;

      case 'LEAVE_ROOM':
        this.sessions.delete(sessionId);
        this.broadcast({
          type: 'PARTICIPANT_LEFT',
          sessionId,
          participants: this.getParticipants()
        });
        session.ws.close();
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  sendToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws.readyState === 1) { // WebSocket.OPEN = 1
      session.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message, excludeSessionId = null) {
    for (const [sessionId, session] of this.sessions) {
      if (sessionId !== excludeSessionId && session.ws.readyState === 1) {
        session.ws.send(JSON.stringify(message));
      }
    }
  }

  getParticipants() {
    return Array.from(this.sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      clientType: session.clientType,
      clientName: session.clientName,
      isReady: session.isReady
    }));
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async getRoomInfo() {
    if (!this.roomData) {
      this.roomData = await this.state.storage.get('roomData');
    }
    return {
      roomCode: this.roomData?.roomCode,
      participants: this.getParticipants(),
      host: this.roomData?.host,
      createdAt: this.roomData?.createdAt
    };
  }
}
