const WebSocket = require('ws');

let roomCode = '';

function log(prefix, msg) {
  const time = new Date().toISOString().split('T')[1].replace('Z','');
  console.log(`[${time}] ${prefix}:`, msg);
}

const cWeb = new WebSocket('ws://localhost:3000');

cWeb.on('open', () => {
  log('web', 'open');
  cWeb.send(JSON.stringify({ type: 'CREATE_ROOM', clientType: 'web', clientName: 'TesterWeb' }));
});

cWeb.on('message', (m) => {
  const msg = JSON.parse(m);
  log('web msg', msg);
  if (msg.type === 'ROOM_CREATED') {
    roomCode = msg.room.code;
    log('web', `room created: ${roomCode}`);

    // Connect TV client and join same room
    const cTv = new WebSocket('ws://localhost:3000');

    cTv.on('open', () => {
      log('tv', 'open');
      cTv.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode, clientType: 'tv', clientName: 'TesterTV' }));

      // After join, promote web to host
      setTimeout(() => {
        log('web', 'CHANGE_HOST -> web');
        cWeb.send(JSON.stringify({ type: 'CHANGE_HOST', host: 'web' }));
      }, 1500);

      // Then promote tv to host
      setTimeout(() => {
        log('tv', 'CHANGE_HOST -> tv');
        cTv.send(JSON.stringify({ type: 'CHANGE_HOST', host: 'tv' }));
      }, 3000);

      // Close both after a bit
      setTimeout(() => { log('tv', 'closing'); cTv.close(); }, 5000);
    });

    cTv.on('message', (m2) => log('tv msg', JSON.parse(m2)));
    cTv.on('close', () => log('tv', 'closed'));

    // Close web later
    setTimeout(() => { log('web', 'closing'); cWeb.close(); }, 6000);
  }
});

cWeb.on('close', () => log('web', 'closed'));
