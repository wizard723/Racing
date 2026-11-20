const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 20000,
  pingInterval: 10000
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const START_POSITIONS = [
  { x: 500, y: 400, angle: 0 },
  { x: 500, y: 500, angle: 0 },
  { x: 500, y: 600, angle: 0 },
  { x: 500, y: 700, angle: 0 },
  { x: 500, y: 800, angle: 0 },
  { x: 500, y: 900, angle: 0 }
];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? genCode() : code;
}
function sanitize(s) { return String(s || 'Игрок').replace(/[<>]/g, '').slice(0, 16); }
function sanitizeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#ff3366'; }
function getPlayers(code) {
  return Object.values(rooms[code].players).map(p => ({
    id: p.id, name: p.name, color: p.color,
    x: p.x, y: p.y, angle: p.angle, speed: p.speed, lap: p.lap || 1
  }));
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, color }, cb) => {
    const code = genCode();
    rooms[code] = { players: {}, started: false };
    const pos = START_POSITIONS[0];
    rooms[code].players[socket.id] = {
      id: socket.id, name: sanitize(name), color: sanitizeColor(color),
      x: pos.x, y: pos.y, angle: pos.angle, speed: 0, lap: 1
    };
    socket.join(code);
    socket.roomCode = code;
    cb({ ok: true, code, players: getPlayers(code) });
  });

  socket.on('joinRoom', ({ code, name, color }, cb) => {
    code = (code || '').toUpperCase().trim();
    if (!rooms[code]) return cb({ ok: false, error: 'Комната не найдена' });
    if (Object.keys(rooms[code].players).length >= 6) return cb({ ok: false, error: 'Комната заполнена (макс 6)' });
    const idx = Object.keys(rooms[code].players).length;
    const pos = START_POSITIONS[idx] || START_POSITIONS[0];
    rooms[code].players[socket.id] = {
      id: socket.id, name: sanitize(name), color: sanitizeColor(color),
      x: pos.x, y: pos.y, angle: pos.angle, speed: 0, lap: 1
    };
    socket.join(code);
    socket.roomCode = code;
    io.to(code).emit('playerJoined', {
      id: socket.id, name: rooms[code].players[socket.id].name,
      color: rooms[code].players[socket.id].color,
      x: pos.x, y: pos.y, angle: pos.angle, speed: 0, lap: 1
    });
    cb({ ok: true, code, players: getPlayers(code) });
  });

  socket.on('startGame', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].started = true;
    io.to(code).emit('gameStarted');
  });

  socket.on('update', (d) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const p = rooms[code].players[socket.id];
    if (!p) return;
    p.x = d.x; p.y = d.y; p.angle = d.angle; p.speed = d.speed; p.lap = d.lap || 1;
    socket.to(code).volatile.emit('playerUpdate', {
      id: socket.id, x: p.x, y: p.y, angle: p.angle, speed: p.speed, lap: p.lap
    });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    delete rooms[code].players[socket.id];
    io.to(code).emit('playerLeft', socket.id);
    if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on port ' + PORT));
