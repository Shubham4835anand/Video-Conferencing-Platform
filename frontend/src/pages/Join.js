// src/pages/Join.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Join() {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleJoin = () => {
    // For now, skip actual password check
    if (roomId.trim()) navigate(`/room/${roomId}`);
    else alert('Enter Room ID');
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h2>Join a Meeting</h2>
      <input
        type='text'
        placeholder='Room ID'
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        style={{ padding: 10, margin: 10 }}
      />
      <br />
      <input
        type='password'
        placeholder='Password'
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 10, margin: 10 }}
      />
      <br />
      <button onClick={handleJoin} style={{ padding: '10px 20px' }}>
        Join Room
      </button>
    </div>
  );
}

export default Join;
