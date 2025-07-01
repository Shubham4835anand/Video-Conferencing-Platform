// src/pages/Room.js
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import '../styles/Room.css';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Update backend URL or use env var
const socket = io(process.env.REACT_APP_SOCKET_URL);

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [msgList, setMsgList] = useState([]);
  const [msg, setMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isLocked, setIsLocked] = useState(false);

  const isHost = participants[0] === socket.id;
  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      socket.emit('join-room', { roomId });
      socket.on('all-users', (users) => {
        setParticipants([socket.id, ...users]);
        users.forEach((userId) => {
          const peer = createPeer(userId);
          peersRef.current[userId] = peer;
        });
      });

      socket.on('user-joined', ({ userId }) => {
        setParticipants((p) => [...p, userId]);
        if (!isLocked) {
          const peer = createPeer(userId);
          peersRef.current[userId] = peer;
        } else {
          socket.emit('kick-user', { roomId, userId });
        }
      });

      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIce);
      socket.on('user-disconnected', ({ userId }) => {
        removePeer(userId);
      });

      socket.on('chat-message', (m) => setMsgList((p) => [...p, m]));
      socket.on('kicked', () => {
        alert('You have been removed by the host');
        navigate('/');
      });

      socket.on('room-locked', () => setIsLocked(true));
      socket.on('room-unlocked', () => setIsLocked(false));
    }

    init();
    return () => {
      Object.values(peersRef.current).forEach((p) => p.close());
      socket.disconnect();
    };
  }, [roomId]);

  const createPeer = (target) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    localStreamRef.current
      .getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('ice-candidate', { target, candidate: e.candidate });
    };

    pc.ontrack = (e) =>
      setRemoteStreams((p) => ({ ...p, [target]: e.streams[0] }));

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() => socket.emit('offer', { target, sdp: pc.localDescription }));

    return pc;
  };

  async function handleOffer({ sdp, callerId }) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[callerId] = pc;

    localStreamRef.current
      .getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit('ice-candidate', {
          target: callerId,
          candidate: e.candidate,
        });
    };
    pc.ontrack = (e) =>
      setRemoteStreams((p) => ({ ...p, [callerId]: e.streams[0] }));

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: callerId, sdp: pc.localDescription });
  }

  function handleAnswer({ sdp, target }) {
    const pc = peersRef.current[target];
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  function handleIce({ candidate, from }) {
    const pc = peersRef.current[from];
    if (pc)
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  }

  const removePeer = (userId) => {
    const p = peersRef.current[userId];
    if (p) p.close();
    delete peersRef.current[userId];
    setRemoteStreams((p) => {
      const copy = { ...p };
      delete copy[userId];
      return copy;
    });
    setParticipants((p) => p.filter((id) => id !== userId));
  };

  const sendMsg = () => {
    if (!msg.trim()) return;
    const m = { sender: socket.id, message: msg };
    socket.emit('chat-message', m);
    setMsgList((p) => [...p, m]);
    setMsg('');
  };

  const toggleMute = () => {
    const en = !muted;
    localStreamRef.current.getAudioTracks()[0].enabled = en;
    setMuted(!en);
  };

  const toggleCam = () => {
    const en = !camOff;
    localStreamRef.current.getVideoTracks()[0].enabled = en;
    setCamOff(!en);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Link copied!');
  };

  const shareWA = () => {
    const text = encodeURIComponent(`Join my meeting: ${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className='room-container'>
      <h2>
        Room: {roomId}
        {isLocked ? ' 🔒' : ''}
      </h2>
      <div className='video-grid'>
        <div className='vid-box'>
          <p className='vid-label'>You (Host)</p>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
        {Object.entries(remoteStreams).map(([id, st]) => (
          <div className='vid-box' key={id}>
            <p className='vid-label'>
              {id === socket.id ? 'Me' : id.slice(-5)}
            </p>
            <video ref={(r) => r && (r.srcObject = st)} autoPlay playsInline />
            {isHost && id !== socket.id && (
              <button
                className='kick-btn'
                onClick={() => socket.emit('kick-user', { roomId, userId: id })}
              >
                Kick
              </button>
            )}
          </div>
        ))}
      </div>

      <div className='partners'>
        <div className='controls-panel'>
          <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCam}>
            {camOff ? 'Camera On' : 'Camera Off'}
          </button>
          {isHost && (
            <button onClick={() => socket.emit('toggle-lock', { roomId })}>
              {isLocked ? 'Unlock Room' : 'Lock Room'}
            </button>
          )}
        </div>

        <div className='chat-panel'>
          <h4>Chat</h4>
          <div className='chat-box'>
            {msgList.map((m, i) => (
              <div key={i}>
                <b>{m.sender === socket.id ? 'Me' : 'User'}:</b> {m.message}
              </div>
            ))}
          </div>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder='Type...'
          />
          <button onClick={sendMsg}>Send</button>
        </div>

        <div className='invite-panel'>
          <h4>Invite</h4>
          <p>
            <code>{inviteLink}</code>
          </p>
          <button onClick={copyLink}>Copy</button>
          <button onClick={shareWA}>Share WhatsApp</button>
        </div>

        <div className='participant-panel'>
          <h4>Participants ({participants.length})</h4>
          <ul>
            {participants.map((id) => (
              <li key={id}>{id === socket.id ? 'You (Host)' : id.slice(-5)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
export default Room;
