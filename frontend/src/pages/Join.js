// src/pages/Join.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Join() {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoin = async () => {
    if (!roomId.trim()) return setError('Room ID is required');
    // Check password
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/room/validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, password }),
        }
      );
      if (!res.ok) {
        const { message } = await res.json();
        return setError(message || 'Invalid room or password');
      }
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError('Server error');
    }
  };

  return (
    <div className='join-container'>
      <h2>Join a Meeting</h2>
      {error && <p className='join-error'>{error}</p>}
      <input
        value={roomId}
        placeholder='Room ID'
        onChange={(e) => setRoomId(e.target.value)}
      />
      <input
        type='password'
        value={password}
        placeholder='Password'
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleJoin}>Join Room</button>
    </div>
  );
}

export default Join;
