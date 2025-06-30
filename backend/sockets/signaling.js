module.exports = function (io) {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);

      const existingUsers = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      ).filter((id) => id !== socket.id);
      existingUsers.forEach((id) => {
        socket.emit('user-joined', { userId: id });
      });

      socket.to(roomId).emit('user-joined', { userId: socket.id });

      socket.on('offer', ({ target, sdp }) => {
        io.to(target).emit('offer', { sdp, callerId: socket.id });
      });

      socket.on('answer', ({ target, sdp }) => {
        io.to(target).emit('answer', { sdp, target: socket.id });
      });

      socket.on('ice-candidate', ({ target, candidate }) => {
        io.to(target).emit('ice-candidate', { candidate, from: socket.id });
      });

      socket.on('chat-message', (msg) => {
        socket.to(roomId).emit('chat-message', msg);
      });

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', { userId: socket.id });
      });
    });
  });
};
