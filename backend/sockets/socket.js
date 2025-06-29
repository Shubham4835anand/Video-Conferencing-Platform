module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log('User connected', socket.id);

    socket.on('join-room', ({ roomId, userId }) => {
      socket.join(roomId);
      socket.to(roomId).emit('user-connected', userId);

      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', userId);
      });

      socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', data);
      });

      socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', data);
      });

      socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', data);
      });
    });
  });
};
