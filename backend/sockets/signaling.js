// server/sockets/signaling.js
const rooms = {}; // { roomId: { password, locked: bool } }

module.exports = function (io) {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId }) => {
      if (!rooms[roomId])
        rooms[roomId] = { password: 'secret123', locked: false };
      socket.join(roomId);

      const usersInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      const otherUsers = usersInRoom.filter((id) => id !== socket.id);

      socket.emit('all-users', otherUsers);
      socket.to(roomId).emit('user-joined', { userId: socket.id });

      socket.on('offer', ({ sdp, target }) => {
        io.to(target).emit('offer', { sdp, callerId: socket.id });
      });

      socket.on('answer', ({ sdp, target }) => {
        io.to(target).emit('answer', { sdp, target: socket.id });
      });

      socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', {
          ...payload,
          from: socket.id,
        });
      });

      socket.on('chat-message', (msg) => {
        socket.to(roomId).emit('chat-message', msg);
      });

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', { userId: socket.id });
      });

      socket.on('remove-user', ({ roomId, userId }) => {
        io.to(userId).emit('removed');
      });
    });

    socket.on('validate-room', ({ roomId, password }, cb) => {
      if (!rooms[roomId]) return cb({ ok: false, msg: 'No such room' });
      if (rooms[roomId].password !== password)
        return cb({ ok: false, msg: 'Wrong password' });
      cb({ ok: true });
    });

    socket.on('toggle-lock', ({ roomId }) => {
      if (rooms[roomId]) {
        rooms[roomId].locked = !rooms[roomId].locked;
        io.to(roomId).emit(
          rooms[roomId].locked ? 'room-locked' : 'room-unlocked'
        );
      }
    });

    socket.on('kick-user', ({ roomId, userId }) => {
      io.to(userId).emit('kicked');
      io.to(roomId).emit('user-disconnected', { userId });
    });
  });
};
