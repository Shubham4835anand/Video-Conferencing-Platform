module.exports = function (io) {
  io.on('connection', (socket) => {
    socket.on('join-room', (roomId) => {
      socket.join(roomId);

      const otherUsers = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      ).filter((id) => id !== socket.id);
      socket.emit('all-users', otherUsers);

      socket.to(roomId).emit('user-joined', socket.id);

      socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', payload);
      });

      socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', payload);
      });

      socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', {
          ...payload,
          from: socket.id,
        });
      });

      socket.on('chat-message', ({ roomId, user, message }) => {
        socket.to(roomId).emit('chat-message', { user, message });
      });

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-left', socket.id);
      });
    });
  });
};
