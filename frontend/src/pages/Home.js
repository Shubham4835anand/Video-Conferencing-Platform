import React from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const navigate = useNavigate();
  const createMeeting = () => {
    const roomId = uuidv4();
    navigate(`/room/${roomId}`);
  };

  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <h1>Welcome to WebRTC Meet</h1>
      <button onClick={createMeeting}>Create Meeting</button>
    </div>
  );
}

export default Home;
