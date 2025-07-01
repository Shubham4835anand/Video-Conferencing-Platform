const express = require('express');
const Room = require('../models/Room');
const router = express.Router();

router.post('/create', async (req, res) => {
  const { roomId, password } = req.body;
  const room = await Room.create({ roomId, password, participants: [] });
  res.json(room);
});

router.post('/validate', (req, res) => {
  const { roomId, password } = req.body;
  if (!rooms[roomId])
    return res.status(404).json({ message: 'Room not found' });
  if (rooms[roomId].password !== password)
    return res.status(401).json({ message: 'Wrong password' });
  return res.json({ ok: true });
});

module.exports = router;
