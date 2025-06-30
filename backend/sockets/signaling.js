module.exports = function (io) {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId }) => {
      socket.join(roomId);

      const usersInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      const otherUsers = usersInRoom.filter((id) => id !== socket.id);

      // Send existing users to the new user
      socket.emit('all-users', otherUsers);

      // Notify existing users about the new user
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
    });
  });
};
