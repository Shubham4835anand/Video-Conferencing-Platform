const express = require('express');
const Room = require('../models/Room');
const router = express.Router();

router.post('/create', async (req, res) => {
  const { roomId, password } = req.body;
  const room = await Room.create({ roomId, password, participants: [] });
  res.json(room);
});

module.exports = router;
