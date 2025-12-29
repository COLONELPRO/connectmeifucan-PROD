/**
 * Drawing Game - Client-side logic for collaborative drawing game
 * Integrates with existing room system via WebSocket
 */

class DrawingGameClient {
  constructor() {
    // UI Elements
    this.gameInfo = document.getElementById('drawing-game-info');
    this.gameActive = document.getElementById('drawing-game-active');
    this.gameResults = document.getElementById('drawing-game-results');
    
    // Canvas
    this.canvas = document.getElementById('drawing-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    
    // Drawing state
    this.isDrawing = false;
    this.strokes = []; // All strokes in current contribution
    this.currentStroke = null;
    this.drawingHistory = []; // For undo
    this.drawingColor = '#000000';
    this.drawingSize = 3;
    
    // Game state
    this.roomCode = null;
    this.ws = null;
    this.currentRound = 0;
    this.maxRounds = 3;
    this.theme = '';
    this.participants = [];
    this.timerInterval = null;
    this.timeLeft = 15;
    this.canvasBeforeImage = null; // For comparison/scoring
    
    // Initialize if DOM is ready
    if (this.canvas) {
      this.setupEventListeners();
      this.restoreWSUrl();
    }
  }
  
  setupEventListeners() {
    // Room connection buttons
    const btnCreate = document.getElementById('btn-create-drawing-room');
    const btnJoin = document.getElementById('btn-join-drawing-room');
    const btnLeave = document.getElementById('btn-leave-drawing-room');
    const btnSwipe = document.getElementById('btn-swipe-next');
    const btnNewGame = document.getElementById('btn-new-drawing-game');
    
    if (btnCreate) btnCreate.addEventListener('click', () => this.createRoom());
    if (btnJoin) btnJoin.addEventListener('click', () => this.joinRoom());
    if (btnLeave) btnLeave.addEventListener('click', () => this.leaveRoom());
    if (btnSwipe) btnSwipe.addEventListener('click', () => this.submitDrawing());
    if (btnNewGame) btnNewGame.addEventListener('click', () => this.newGame());
    
    // Drawing tools
    const colorPicker = document.getElementById('drawing-color');
    const sizePicker = document.getElementById('drawing-size');
    const btnClear = document.getElementById('btn-clear-canvas');
    const btnUndo = document.getElementById('btn-undo-drawing');
    
    if (colorPicker) {
      colorPicker.addEventListener('change', (e) => {
        this.drawingColor = e.target.value;
      });
    }
    
    if (sizePicker) {
      sizePicker.addEventListener('input', (e) => {
        this.drawingSize = parseInt(e.target.value);
        const display = document.getElementById('drawing-size-display');
        if (display) display.textContent = `${this.drawingSize}px`;
      });
    }
    
    if (btnClear) btnClear.addEventListener('click', () => this.clearCanvas());
    if (btnUndo) btnUndo.addEventListener('click', () => this.undoStroke());
    
    // Canvas drawing events (mouse)
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());
    
    // Canvas drawing events (touch)
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDrawing(e.touches[0]);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.draw(e.touches[0]);
    });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });
  }
  
  restoreWSUrl() {
    const savedWS = localStorage.getItem('ws-drawing-url');
    if (savedWS) {
      // Use the same WebSocket URL as the room system
      // We'll reuse the existing room WebSocket
    }
  }
  
  async createRoom() {
    try {
      const code = this.generateCode();
      this.roomCode = code;
      
      // Connect to room system WebSocket
      await this.connectWebSocket(code);
      
      // Initialize game state
      this.currentRound = 1;
      this.theme = this.generateTheme();
      this.timeLeft = 15;
      
      this.showGameActive();
      this.updateUI();
      this.startTimer();
      
    } catch (error) {
      this.showError('Erreur création room: ' + error.message);
    }
  }
  
  async joinRoom() {
    try {
      const input = document.getElementById('drawing-room-code');
      const code = input.value.trim().toUpperCase();
      
      if (!code || code.length !== 4) {
        this.showError('Code invalide (4 caractères)');
        return;
      }
      
      this.roomCode = code;
      
      // Connect to room system WebSocket
      await this.connectWebSocket(code);
      
      this.showGameActive();
      this.updateUI();
      
    } catch (error) {
      this.showError('Erreur connexion: ' + error.message);
    }
  }
  
  async connectWebSocket(roomCode) {
    return new Promise((resolve, reject) => {
      // Get WebSocket URL from room system or use default
      // Check if we're in production or development
      const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const defaultWsUrl = isProduction 
        ? `wss://api.connectmeifucan.com/ws?room=${roomCode}`
        : `ws://localhost:3000/ws?room=${roomCode}`;
      
      const wsUrl = localStorage.getItem('room-ws-url') 
        ? localStorage.getItem('room-ws-url') + `?room=${roomCode}`
        : defaultWsUrl;
      
      console.log('[DrawingGame] Connecting to WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        // Send join message
        this.ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          code: roomCode,
          clientType: 'player',
          clientName: 'Player_' + Math.random().toString(36).substr(2, 5)
        }));
        resolve();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.handleDisconnect();
      };
    });
  }
  
  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'ROOM_JOINED':
        this.roomCode = data.roomCode;
        this.participants = data.participants || [];
        this.updateUI();
        break;
        
      case 'ROOM_UPDATE':
        this.participants = data.participants || [];
        this.updateUI();
        break;
        
      case 'GAME_START':
        this.currentRound = data.round || 1;
        this.theme = data.theme;
        this.timeLeft = 15;
        this.clearCanvas();
        this.startTimer();
        this.updateUI();
        break;
        
      case 'DRAWING_STROKE':
        // Receive drawing stroke from another player (for TV display)
        if (data.stroke) {
          this.drawStrokeFromData(data.stroke);
        }
        break;
        
      case 'DRAWING_SUBMITTED':
        // A player submitted their drawing
        console.log('Drawing submitted by', data.playerId);
        break;
        
      case 'ROUND_END':
        this.stopTimer();
        this.currentRound = data.nextRound || this.currentRound + 1;
        if (this.currentRound > this.maxRounds) {
          this.showResults(data.results);
        } else {
          // Next round
          setTimeout(() => {
            this.theme = data.nextTheme || this.generateTheme();
            this.clearCanvas();
            this.timeLeft = 15;
            this.startTimer();
            this.updateUI();
          }, 2000);
        }
        break;
        
      case 'GAME_RESULTS':
        this.showResults(data.results);
        break;
        
      default:
        console.log('Unknown message type:', data.type);
    }
  }
  
  handleDisconnect() {
    this.stopTimer();
    this.showError('Connexion perdue');
    setTimeout(() => {
      this.showGameInfo();
    }, 2000);
  }
  
  leaveRoom() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopTimer();
    this.roomCode = null;
    this.showGameInfo();
  }
  
  startDrawing(e) {
    this.isDrawing = true;
    const pos = this.getCanvasPosition(e);
    
    this.currentStroke = {
      color: this.drawingColor,
      size: this.drawingSize,
      points: [pos],
      timestamp: Date.now()
    };
    
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }
  
  draw(e) {
    if (!this.isDrawing || !this.currentStroke) return;
    
    const pos = this.getCanvasPosition(e);
    this.currentStroke.points.push(pos);
    
    this.ctx.strokeStyle = this.currentStroke.color;
    this.ctx.lineWidth = this.currentStroke.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
    
    // Broadcast stroke to other players (throttled)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'DRAWING_STROKE',
        roomCode: this.roomCode,
        stroke: {
          color: this.currentStroke.color,
          size: this.currentStroke.size,
          points: [pos]
        }
      }));
    }
  }
  
  stopDrawing() {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    if (this.currentStroke) {
      this.strokes.push(this.currentStroke);
      this.drawingHistory.push(this.getCanvasImage());
      this.currentStroke = null;
    }
  }
  
  getCanvasPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }
  
  drawStrokeFromData(stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    
    this.ctx.strokeStyle = stroke.color;
    this.ctx.lineWidth = stroke.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.ctx.beginPath();
    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    
    for (let i = 1; i < stroke.points.length; i++) {
      this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    
    this.ctx.stroke();
  }
  
  clearCanvas() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokes = [];
    this.currentStroke = null;
    this.drawingHistory = [];
  }
  
  undoStroke() {
    if (this.drawingHistory.length === 0) return;
    
    this.drawingHistory.pop();
    this.strokes.pop();
    
    if (this.drawingHistory.length > 0) {
      const lastImage = this.drawingHistory[this.drawingHistory.length - 1];
      this.restoreCanvasFromImage(lastImage);
    } else {
      this.clearCanvas();
    }
  }
  
  getCanvasImage() {
    return this.canvas.toDataURL('image/png');
  }
  
  restoreCanvasFromImage(dataURL) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = dataURL;
  }
  
  submitDrawing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.showError('Non connecté');
      return;
    }
    
    const imageData = this.getCanvasImage();
    
    this.ws.send(JSON.stringify({
      type: 'SUBMIT_DRAWING',
      roomCode: this.roomCode,
      round: this.currentRound,
      imageData: imageData,
      strokes: this.strokes,
      theme: this.theme
    }));
    
    // Stop timer and wait for next round
    this.stopTimer();
    this.showMessage('✅ Dessin envoyé ! Attente des autres joueurs...');
  }
  
  startTimer() {
    this.stopTimer();
    
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimerDisplay();
      
      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.submitDrawing();
      }
    }, 1000);
  }
  
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
  
  updateTimerDisplay() {
    const timerEl = document.getElementById('drawing-timer');
    if (timerEl) {
      timerEl.textContent = this.timeLeft;
      if (this.timeLeft <= 5) {
        timerEl.style.color = '#ff6b6b';
      } else {
        timerEl.style.color = 'var(--accent)';
      }
    }
  }
  
  updateUI() {
    // Update room code display
    const codeDisplay = document.getElementById('drawing-room-code-display');
    if (codeDisplay) {
      codeDisplay.textContent = this.roomCode || 'XXXX';
    }
    
    // Update round display
    const roundDisplay = document.getElementById('drawing-round-display');
    if (roundDisplay) {
      roundDisplay.textContent = `${this.currentRound}/${this.maxRounds}`;
    }
    
    // Update theme display
    const themeDisplay = document.getElementById('drawing-theme-text');
    if (themeDisplay) {
      themeDisplay.textContent = this.theme || 'En attente...';
    }
    
    // Update participants list
    const participantsList = document.getElementById('drawing-participants-list');
    if (participantsList) {
      participantsList.innerHTML = this.participants
        .map(p => `<div style="color:var(--text);">👤 ${p.name || p.clientName || 'Joueur'}</div>`)
        .join('');
    }
    
    this.updateTimerDisplay();
  }
  
  showGameInfo() {
    this.gameInfo.style.display = 'flex';
    this.gameActive.style.display = 'none';
    this.gameResults.style.display = 'none';
  }
  
  showGameActive() {
    this.gameInfo.style.display = 'none';
    this.gameActive.style.display = 'flex';
    this.gameResults.style.display = 'none';
  }
  
  showGameResults() {
    this.gameInfo.style.display = 'none';
    this.gameActive.style.display = 'none';
    this.gameResults.style.display = 'flex';
  }
  
  showResults(results) {
    this.stopTimer();
    this.showGameResults();
    
    const resultsContent = document.getElementById('drawing-results-content');
    if (!resultsContent) return;
    
    if (!results || !results.players) {
      resultsContent.innerHTML = '<p style="color:var(--muted);">Pas de résultats disponibles</p>';
      return;
    }
    
    // Sort players by score
    const sortedPlayers = [...results.players].sort((a, b) => b.totalScore - a.totalScore);
    
    let html = '<div style="display:flex; flex-direction:column; gap:16px;">';
    
    sortedPlayers.forEach((player, index) => {
      const isWinner = index === 0;
      html += `
        <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:20px; border:2px solid ${isWinner ? 'var(--accent)' : 'var(--border)'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <span style="font-size:1.5rem;">${isWinner ? '👑' : `${index + 1}.`}</span>
              <span style="font-size:1.2rem; font-weight:bold; color:${isWinner ? 'var(--accent)' : 'var(--text)'}; margin-left:8px;">${player.name || 'Joueur'}</span>
            </div>
            <div style="font-size:2rem; font-weight:bold; color:var(--accent);">${player.totalScore.toFixed(1)}</div>
          </div>
          
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
            <div style="text-align:center; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
              <div style="font-size:0.8rem; color:var(--muted);">Fluidité</div>
              <div style="font-size:1.1rem; font-weight:bold;">${player.scores?.fluidity?.toFixed(2) || '0.00'}</div>
            </div>
            <div style="text-align:center; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
              <div style="font-size:0.8rem; color:var(--muted);">Cohérence</div>
              <div style="font-size:1.1rem; font-weight:bold;">${player.scores?.coherence?.toFixed(2) || '0.00'}</div>
            </div>
            <div style="text-align:center; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
              <div style="font-size:0.8rem; color:var(--muted);">Thème</div>
              <div style="font-size:1.1rem; font-weight:bold;">${player.scores?.theme?.toFixed(2) || '0.00'}</div>
            </div>
            <div style="text-align:center; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
              <div style="font-size:0.8rem; color:var(--muted);">Créativité</div>
              <div style="font-size:1.1rem; font-weight:bold;">${player.scores?.creativity?.toFixed(2) || '0.00'}</div>
            </div>
          </div>
          
          ${player.titles && player.titles.length > 0 ? `
            <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
              ${player.titles.map(title => `<span style="background:rgba(255,204,0,0.2); color:var(--accent); padding:4px 12px; border-radius:16px; font-size:0.85rem;">${title}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    });
    
    html += '</div>';
    resultsContent.innerHTML = html;
  }
  
  newGame() {
    this.currentRound = 0;
    this.theme = '';
    this.strokes = [];
    this.clearCanvas();
    this.showGameInfo();
  }
  
  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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
  
  showError(message) {
    const errorEl = document.getElementById('drawing-room-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
  }
  
  showMessage(message) {
    // Could use a toast notification here
    console.log(message);
  }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.drawingGame = new DrawingGameClient();
  });
} else {
  window.drawingGame = new DrawingGameClient();
}
