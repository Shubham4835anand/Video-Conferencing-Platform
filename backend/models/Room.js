const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: String,
  participants: [String],
  password: String,
});

module.exports = mongoose.model('Room', roomSchema);
