const WebSocket = require('ws');

let roomCode = '';

function log(prefix, msg) {
  const time = new Date().toISOString().split('T')[1].replace('Z','');
  console.log(`[${time}] ${prefix}:`, msg);
}

const c1 = new WebSocket('ws://localhost:3000');

c1.on('open', () => {
  log('c1', 'open');
  c1.send(JSON.stringify({ type: 'CREATE_ROOM', clientType: 'web', clientName: 'TesterWeb' }));
});

c1.on('message', (m) => {
  log('c1 msg', m.toString());
  const msg = JSON.parse(m);
  if (msg.type === 'ROOM_CREATED') {
    roomCode = msg.room.code;
    log('c1', `room created: ${roomCode}`);

    // Connect second client (tv) and join same room
    const c2 = new WebSocket('ws://localhost:3000');

    c2.on('open', () => {
      log('c2', 'open');
      c2.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode, clientType: 'tv', clientName: 'TesterTV' }));
      setTimeout(() => {
        log('c2', 'toggle ready');
        c2.send(JSON.stringify({ type: 'TOGGLE_READY' }));
      }, 1000);
      setTimeout(() => { log('c2', 'closing'); c2.close(); }, 3500);
    });

    c2.on('message', (m2) => log('c2 msg', m2.toString()));
    c2.on('close', () => log('c2', 'closed'));

    // Client1 toggles ready after TV
    setTimeout(() => {
      log('c1', 'toggle ready');
      c1.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    }, 2000);
    setTimeout(() => { log('c1', 'closing'); c1.close(); }, 4500);
  }
});

c1.on('close', () => log('c1', 'closed'));
