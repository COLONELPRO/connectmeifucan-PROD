// Durable Object for managing game rooms with WebSocket connections
export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // WebSocket connections: sessionId -> { ws, clientType, clientName, isReady }
    this.roomData = null;
    this.initialized = false;
  }
  
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Load room data from storage if it exists
      const storedData = await this.state.storage.get('roomData');
      if (storedData) {
        this.roomData = storedData;
        console.log('[DurableObject] Loaded existing room data:', this.roomData.roomCode);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[DurableObject] Failed to initialize:', error);
      this.initialized = true; // Mark as initialized anyway to prevent repeated failures
    }
  }

  async fetch(request) {
    // Ensure initialization
    await this.initialize();
    
    try {
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
    } catch (error) {
      console.error('[DurableObject] Error in fetch():', error.message, error.stack);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
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
    
    // Limit maximum sessions to prevent memory issues
    const MAX_SESSIONS = 50;
    if (this.sessions.size >= MAX_SESSIONS) {
      console.warn('[DurableObject] Max sessions reached, rejecting connection');
      ws.send(JSON.stringify({
        type: 'ERROR',
        error: 'Room is full'
      }));
      ws.close(1008, 'Room is full');
      return;
    }
    
    const sessionId = crypto.randomUUID();
    const session = {
      ws,
      clientType: null,
      clientName: null,
      isReady: false,
      sessionId
    };
    
    this.sessions.set(sessionId, session);
    console.log('[DurableObject] Session added:', sessionId, 'Total sessions:', this.sessions.size);

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
      if (this.sessions.has(sessionId)) {
        this.sessions.delete(sessionId);
        try {
          this.broadcast({
            type: 'PARTICIPANT_LEFT',
            sessionId,
            participants: this.getParticipants()
          });
        } catch (error) {
          console.error('[DurableObject] Error in close handler:', error);
        }
      }
    });

    ws.addEventListener('error', (error) => {
      console.error('WebSocket error:', error);
      this.sessions.delete(sessionId);
    });
  }

  async handleMessage(sessionId, message) {
    try {
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
            host: session.clientType
          };
          try {
            await this.state.storage.put('roomData', this.roomData);
          } catch (error) {
            console.error('[DurableObject] Failed to save room data:', error);
            throw new Error('Failed to initialize room');
          }
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
          host: session.clientType
        };
        try {
          await this.state.storage.put('roomData', this.roomData);
        } catch (error) {
          console.error('[DurableObject] Failed to save room data:', error);
          throw new Error('Failed to create room');
        }

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
          try {
            await this.state.storage.put('roomData', this.roomData);
          } catch (error) {
            console.error('[DurableObject] Failed to save host change:', error);
            throw new Error('Failed to change host');
          }
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

      // ========== DRAWING GAME MESSAGES ==========
      case 'START_DRAWING_GAME':
        // Initialize drawing game state
        if (!this.roomData.drawingGame) {
          this.roomData.drawingGame = {
            currentRound: 1,
            maxRounds: 3,
            theme: message.theme || '',
            players: [],
            contributions: []
          };
        }
        
        this.roomData.drawingGame.currentRound = 1;
        this.roomData.drawingGame.theme = message.theme;
        
        try {
          await this.state.storage.put('roomData', this.roomData);
        } catch (error) {
          console.error('[DurableObject] Failed to save drawing game state:', error);
        }
        
        // Broadcast game start to all participants
        this.broadcast({
          type: 'GAME_START',
          round: this.roomData.drawingGame.currentRound,
          theme: this.roomData.drawingGame.theme,
          maxRounds: this.roomData.drawingGame.maxRounds
        });
        break;

      case 'DRAWING_STROKE':
        // Broadcast drawing stroke to all participants (for real-time sync)
        this.broadcast({
          type: 'DRAWING_STROKE',
          playerId: sessionId,
          stroke: message.stroke
        }, sessionId); // Exclude sender
        break;

      case 'SUBMIT_DRAWING':
        // Store player's drawing contribution
        if (!this.roomData.drawingGame) {
          console.error('[DurableObject] Drawing game not initialized');
          break;
        }
        
        const contribution = {
          playerId: sessionId,
          playerName: session.clientName,
          round: message.round,
          imageData: message.imageData,
          strokes: message.strokes,
          theme: message.theme,
          timestamp: Date.now()
        };
        
        this.roomData.drawingGame.contributions = this.roomData.drawingGame.contributions || [];
        this.roomData.drawingGame.contributions.push(contribution);
        
        try {
          await this.state.storage.put('roomData', this.roomData);
        } catch (error) {
          console.error('[DurableObject] Failed to save contribution:', error);
        }
        
        // Notify all that drawing was submitted
        this.broadcast({
          type: 'DRAWING_SUBMITTED',
          playerId: sessionId,
          round: message.round
        });
        
        // Check if all players have submitted for this round
        const playersInRound = this.sessions.size;
        const submissionsInRound = this.roomData.drawingGame.contributions.filter(
          c => c.round === message.round
        ).length;
        
        if (submissionsInRound >= playersInRound) {
          // All players submitted, end round
          setTimeout(() => this.endDrawingRound(), 1000);
        }
        break;

      case 'REQUEST_GAME_RESULTS':
        // Calculate and send game results
        const results = this.calculateDrawingGameResults();
        this.sendToSession(sessionId, {
          type: 'GAME_RESULTS',
          results
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
    } catch (error) {
      console.error('[DurableObject] Error in handleMessage:', error.message, error.stack);
      // Try to notify the client of the error
      try {
        this.sendToSession(sessionId, {
          type: 'ERROR',
          error: 'Server error: ' + error.message
        });
      } catch (e) {
        console.error('[DurableObject] Failed to send error message:', e);
      }
    }
  }

  sendToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session && session.ws.readyState === 1) { // WebSocket.OPEN = 1
      try {
        session.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[DurableObject] Error sending to session:', sessionId, error);
        this.sessions.delete(sessionId);
      }
    }
  }

  broadcast(message, excludeSessionId = null) {
    const deadSessions = [];
    for (const [sessionId, session] of this.sessions) {
      if (sessionId !== excludeSessionId && session.ws.readyState === 1) {
        try {
          session.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error('[DurableObject] Error broadcasting to session:', sessionId, error);
          deadSessions.push(sessionId);
        }
      }
    }
    // Cleanup dead sessions
    for (const sessionId of deadSessions) {
      this.sessions.delete(sessionId);
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
      host: this.roomData?.host
    };
  }

  // ========== DRAWING GAME METHODS ==========
  async endDrawingRound() {
    if (!this.roomData || !this.roomData.drawingGame) return;
    
    const game = this.roomData.drawingGame;
    const nextRound = game.currentRound + 1;
    
    if (nextRound > game.maxRounds) {
      // Game is over, calculate final results
      const results = this.calculateDrawingGameResults();
      
      this.broadcast({
        type: 'GAME_RESULTS',
        results
      });
      
      // Reset game state
      this.roomData.drawingGame = null;
      try {
        await this.state.storage.put('roomData', this.roomData);
      } catch (error) {
        console.error('[DurableObject] Failed to reset game state:', error);
      }
    } else {
      // Start next round
      game.currentRound = nextRound;
      game.theme = this.generateTheme();
      
      try {
        await this.state.storage.put('roomData', this.roomData);
      } catch (error) {
        console.error('[DurableObject] Failed to save next round:', error);
      }
      
      this.broadcast({
        type: 'ROUND_END',
        currentRound: game.currentRound - 1,
        nextRound: game.currentRound,
        nextTheme: game.theme
      });
    }
  }

  calculateDrawingGameResults() {
    if (!this.roomData || !this.roomData.drawingGame) {
      return { players: [] };
    }
    
    const game = this.roomData.drawingGame;
    const contributions = game.contributions || [];
    
    // Group contributions by player
    const playerContributions = new Map();
    
    contributions.forEach(contrib => {
      if (!playerContributions.has(contrib.playerId)) {
        playerContributions.set(contrib.playerId, {
          playerId: contrib.playerId,
          playerName: contrib.playerName,
          contributions: []
        });
      }
      playerContributions.get(contrib.playerId).contributions.push(contrib);
    });
    
    // Calculate scores for each player
    const playerResults = [];
    
    playerContributions.forEach((playerData) => {
      const scores = {
        fluidity: 0,
        coherence: 0,
        theme: 0,
        creativity: 0
      };
      
      playerData.contributions.forEach(contrib => {
        // Simple scoring based on stroke count and complexity
        // In a real implementation, you'd use the AnalyseurTrait, AnalyseurVisuel, etc.
        const strokeCount = contrib.strokes?.length || 0;
        
        // Fluidity: based on stroke smoothness (simplified)
        scores.fluidity += Math.min(strokeCount / 20, 1);
        
        // Coherence: based on stroke consistency (simplified)
        scores.coherence += Math.min(strokeCount / 15, 1);
        
        // Theme: based on adherence (simplified - would need real analysis)
        scores.theme += Math.random() * 0.5 + 0.5; // Placeholder
        
        // Creativity: based on variation (simplified)
        scores.creativity += Math.min(strokeCount / 25, 1);
      });
      
      // Average scores across all contributions
      const numContributions = playerData.contributions.length;
      if (numContributions > 0) {
        scores.fluidity /= numContributions;
        scores.coherence /= numContributions;
        scores.theme /= numContributions;
        scores.creativity /= numContributions;
      }
      
      const totalScore = scores.fluidity + scores.coherence + scores.theme + scores.creativity;
      
      playerResults.push({
        playerId: playerData.playerId,
        name: playerData.playerName,
        scores,
        totalScore,
        contributions: playerData.contributions.length,
        titles: this.assignTitles(playerData, scores, totalScore)
      });
    });
    
    // Sort by total score
    playerResults.sort((a, b) => b.totalScore - a.totalScore);
    
    return {
      players: playerResults,
      totalRounds: game.maxRounds,
      themes: [game.theme] // Could track all themes
    };
  }

  assignTitles(playerData, scores, totalScore) {
    const titles = [];
    
    // Check for various achievements
    if (scores.fluidity >= 0.8) {
      titles.push('⚡ Maître du Swipe');
    }
    
    if (scores.coherence >= 0.8) {
      titles.push('🎨 Artiste Cohérent');
    }
    
    if (scores.theme >= 0.8) {
      titles.push('🎯 Génie du Thème');
    }
    
    if (scores.creativity >= 0.8) {
      titles.push('✨ Créateur Original');
    }
    
    if (totalScore >= 3.5) {
      titles.push('👑 Chaînon d\'Or');
    }
    
    return titles;
  }

  generateTheme() {
    const themes = [
      'Un chat dans l\'espace',
      'Un robot qui danse',
      'Une licorne arc-en-ciel',
      'Un pirate alien',
      'Un dragon endormi',
      'Une maison volante',
      'Un arbre magique',
      'Un poisson astronaute',
      'Une voiture du futur',
      'Un monstre gentil'
    ];
    return themes[Math.floor(Math.random() * themes.length)];
  }
}

