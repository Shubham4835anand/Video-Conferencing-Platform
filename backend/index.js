const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = {}; // { roomId: { locked: false } }

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = { locked: false };
    const users = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(
      (id) => id !== socket.id
    );
    socket.emit('all-users', users);
    socket.to(roomId).emit('user-joined', { userId: socket.id });
  });

  socket.on('offer', ({ target, sdp }) =>
    io.to(target).emit('offer', { sdp, callerId: socket.id })
  );
  socket.on('answer', ({ target, sdp }) =>
    io.to(target).emit('answer', { sdp, target: socket.id })
  );
  socket.on('ice-candidate', ({ target, candidate }) =>
    io.to(target).emit('ice-candidate', { from: socket.id, candidate })
  );

  socket.on('chat-message', (msg) =>
    io.to(msg.roomId).emit('chat-message', msg)
  );

  socket.on('toggle-lock', ({ roomId }) => {
    rooms[roomId].locked = !rooms[roomId].locked;
    io.to(roomId).emit(rooms[roomId].locked ? 'room-locked' : 'room-unlocked');
  });

  socket.on('kick-user', ({ roomId, userId }) => {
    io.to(userId).emit('kicked');
    io.to(roomId).emit('user-disconnected', { userId });
  });

  socket.on('disconnecting', () => {
    const roomsJoined = Array.from(socket.rooms);
    roomsJoined.forEach((r) => {
      if (r !== socket.id)
        io.to(r).emit('user-disconnected', { userId: socket.id });
    });
  });
});

server.listen(5000, () => console.log('Server running on port 5000'));
