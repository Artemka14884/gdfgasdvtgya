const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

// Game constants
const TANK_SPEED = 2.5;
const BULLET_SPEED = 6;
const MAP_SIZE = 2000;
const MAX_PLAYERS = 5;

// Game state
const players = {};
const bullets = [];
const walls = [];
let gameStarted = false;

// Create walls (obstacles)
function createWalls() {
  const wallConfigs = [
    // Horizontal walls
    { x: 300, y: 300, w: 150, h: 20 },
    { x: 600, y: 200, w: 20, h: 150 },
    { x: 900, y: 400, w: 150, h: 20 },
    { x: 400, y: 700, w: 20, h: 150 },
    { x: 700, y: 600, w: 150, h: 20 },
    { x: 1100, y: 300, w: 20, h: 150 },
    { x: 1300, y: 500, w: 150, h: 20 },
    { x: 200, y: 1100, w: 20, h: 150 },
    { x: 500, y: 1200, w: 150, h: 20 },
    { x: 900, y: 1100, w: 20, h: 150 },
    { x: 1200, y: 1200, w: 150, h: 20 },
    { x: 1500, y: 300, w: 20, h: 150 },
    { x: 1600, y: 800, w: 150, h: 20 },
    { x: 300, y: 1500, w: 150, h: 20 },
    { x: 800, y: 1600, w: 20, h: 150 },
    { x: 1300, y: 1500, w: 150, h: 20 },
    // Corner walls
    { x: 100, y: 100, w: 100, h: 20 },
    { x: 100, y: 100, w: 20, h: 100 },
    { x: 1800, y: 100, w: 100, h: 20 },
    { x: 1880, y: 100, w: 20, h: 100 },
    { x: 100, y: 1800, w: 100, h: 20 },
    { x: 100, y: 1880, w: 20, h: 100 },
    { x: 1800, y: 1800, w: 100, h: 20 },
    { x: 1880, y: 1880, w: 20, h: 100 },
  ];
  
  wallConfigs.forEach((w, index) => {
    walls.push({
      id: index,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      color: '#666'
    });
  });
}

createWalls();

class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name || 'Tank';
    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.score = 0;
    this.color = '';
    this.radius = 18;
    this.cooldown = 0;
    this.kills = 0;
    this.alive = true;
    this.respawnTimer = 0;
    this.shieldTimer = 0;
  }
}

function getSpawnPosition(index) {
  const positions = [
    { x: 100, y: 100 },
    { x: 1900, y: 100 },
    { x: 100, y: 1900 },
    { x: 1900, y: 1900 },
    { x: 1000, y: 1000 }
  ];
  return positions[index % positions.length];
}

function getRandomSpawn() {
  const index = Math.floor(Math.random() * 5);
  return getSpawnPosition(index);
}

const playerNames = ['1', '2', '3', '4', '5'];
const playerColors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff'];
let playerIndex = 0;

class Bullet {
  constructor(x, y, angle, ownerId) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = BULLET_SPEED;
    this.ownerId = ownerId;
    this.radius = 5;
    this.life = 300;
    this.damage = 20;
    this.trail = [];
  }
}

function checkWallCollision(x, y, radius) {
  for (const wall of walls) {
    // Check if circle collides with rectangle
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if (dx * dx + dy * dy < radius * radius) {
      return true;
    }
  }
  return false;
}

function isPositionValid(x, y, radius, excludeId = null) {
  // Check map boundaries
  if (x < radius || x > MAP_SIZE - radius || y < radius || y > MAP_SIZE - radius) {
    return false;
  }
  
  // Check walls
  if (checkWallCollision(x, y, radius)) {
    return false;
  }
  
  // Check other players
  for (const id in players) {
    if (id === excludeId) continue;
    const p = players[id];
    if (!p.alive) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < (radius + p.radius) * (radius + p.radius)) {
      return false;
    }
  }
  
  return true;
}

function findValidSpawn(excludeId = null) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pos = getRandomSpawn();
    if (isPositionValid(pos.x, pos.y, 20, excludeId)) {
      return pos;
    }
  }
  // Fallback: try random positions
  for (let attempt = 0; attempt < 100; attempt++) {
    const pos = {
      x: 50 + Math.random() * (MAP_SIZE - 100),
      y: 50 + Math.random() * (MAP_SIZE - 100)
    };
    if (isPositionValid(pos.x, pos.y, 20, excludeId)) {
      return pos;
    }
  }
  return { x: 100, y: 100 };
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  if (Object.keys(players).length >= MAX_PLAYERS) {
    socket.emit('serverFull', { message: 'Server is full (max 5 players)' });
    socket.disconnect();
    return;
  }

  const name = playerNames[playerIndex % playerNames.length];
  const color = playerColors[playerIndex % playerColors.length];
  playerIndex++;
  
  const player = new Player(socket.id, name);
  player.color = color;
  const spawn = findValidSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  players[socket.id] = player;

  console.log(`${name} joined the game`);

  io.emit('playerJoined', {
    id: socket.id,
    name: player.name,
    color: player.color
  });

  socket.emit('init', {
    id: socket.id,
    players: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, { 
        id: p.id, 
        name: p.name, 
        x: p.x, 
        y: p.y, 
        angle: p.angle, 
        color: p.color, 
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        score: p.score, 
        kills: p.kills,
        shieldTimer: p.shieldTimer
      }])
    ),
    walls: walls,
    mapSize: MAP_SIZE,
    maxPlayers: MAX_PLAYERS
  });

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;

    const { forward, backward, left, right } = data;
    
    if (left) p.angle -= 0.06;
    if (right) p.angle += 0.06;
    
    let dx = 0, dy = 0;
    if (forward) {
      dx += Math.cos(p.angle) * TANK_SPEED;
      dy += Math.sin(p.angle) * TANK_SPEED;
    }
    if (backward) {
      dx -= Math.cos(p.angle) * TANK_SPEED;
      dy -= Math.sin(p.angle) * TANK_SPEED;
    }
    
    if (dx !== 0 || dy !== 0) {
      // Try X movement separately
      if (isPositionValid(p.x + dx, p.y, p.radius, socket.id)) {
        p.x += dx;
      }
      // Try Y movement separately
      if (isPositionValid(p.x, p.y + dy, p.radius, socket.id)) {
        p.y += dy;
      }
    }
  });

  socket.on('shoot', () => {
    const p = players[socket.id];
    if (!p || !p.alive || p.cooldown > 0) return;
    
    p.cooldown = 15;
    const bullet = new Bullet(
      p.x + Math.cos(p.angle) * p.radius * 1.2,
      p.y + Math.sin(p.angle) * p.radius * 1.2,
      p.angle,
      socket.id
    );
    bullets.push(bullet);
    
    io.emit('bulletFired', {
      id: Date.now() + Math.random(),
      x: bullet.x,
      y: bullet.y,
      angle: bullet.angle,
      ownerId: socket.id
    });
  });

  socket.on('setName', (name) => {
    if (players[socket.id]) {
      players[socket.id].name = name.substring(0, 10);
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      const name = players[socket.id].name;
      delete players[socket.id];
      io.emit('playerLeft', socket.id);
      console.log(`${name} disconnected`);
    }
  });
});

// Game loop
setInterval(() => {
  // Update players
  for (const id in players) {
    const p = players[id];
    if (p.cooldown > 0) p.cooldown--;
    if (p.shieldTimer > 0) p.shieldTimer--;
    
    if (!p.alive) {
      p.respawnTimer--;
      if (p.respawnTimer <= 0) {
        const spawn = findValidSpawn(id);
        p.x = spawn.x;
        p.y = spawn.y;
        p.alive = true;
        p.hp = p.maxHp;
        p.shieldTimer = 60; // 1 second shield after respawn
        io.emit('playerRespawn', { 
          id: p.id, 
          x: p.x, 
          y: p.y,
          name: p.name
        });
      }
    }
  }

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += Math.cos(b.angle) * b.speed;
    b.y += Math.sin(b.angle) * b.speed;
    b.life--;
    
    // Check wall collision
    if (checkWallCollision(b.x, b.y, b.radius)) {
      io.emit('bulletHitWall', { x: b.x, y: b.y });
      bullets.splice(i, 1);
      continue;
    }
    
    if (b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE || b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Check collisions with players
    let hit = false;
    for (const id in players) {
      const p = players[id];
      if (id === b.ownerId || !p.alive) continue;
      
      // Check if player has shield
      if (p.shieldTimer > 0) continue;
      
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < p.radius + b.radius) {
        p.hp -= b.damage;
        io.emit('playerHit', { 
          id: p.id, 
          hp: p.hp,
          damage: b.damage
        });
        
        if (p.hp <= 0) {
          p.alive = false;
          p.respawnTimer = 90; // 1.5 seconds
          const killer = players[b.ownerId];
          if (killer) {
            killer.kills++;
            killer.score += 10;
            io.emit('playerKilled', { 
              victim: id, 
              killer: b.ownerId,
              victimName: p.name,
              killerName: killer.name,
              victimColor: p.color,
              killerColor: killer.color
            });
          } else {
            io.emit('playerKilled', { 
              victim: id, 
              killer: null,
              victimName: p.name,
              killerName: 'Unknown'
            });
          }
        }
        hit = true;
        break;
      }
    }
    if (hit) {
      bullets.splice(i, 1);
    }
  }

  // Send game state
  const state = {
    players: Object.fromEntries(
      Object.entries(players).map(([id, p]) => [id, {
        id: p.id,
        x: p.x,
        y: p.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        kills: p.kills,
        score: p.score,
        name: p.name,
        color: p.color,
        shieldTimer: p.shieldTimer
      }])
    ),
    bullets: bullets.map(b => ({
      x: b.x,
      y: b.y,
      angle: b.angle
    }))
  };
  io.emit('gameState', state);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Max players: ${MAX_PLAYERS}`);
});