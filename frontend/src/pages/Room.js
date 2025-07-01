import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const socket = io('https://video-conferencing-platform.onrender.com');

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const peersRef = useRef({});
  const videoRefs = useRef({});
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
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      socket.emit('join-room', { roomId });

      socket.on('all-users', (users) => {
        setParticipants([socket.id, ...users]);
        users.forEach((userId) => {
          const peer = createPeer(userId);
          peersRef.current[userId] = peer;
        });
      });

      socket.on('user-joined', ({ userId }) => {
        if (!isLocked) {
          setParticipants((prev) => [...prev, userId]);
          const peer = createPeer(userId);
          peersRef.current[userId] = peer;
        } else {
          socket.emit('kick-user', { roomId, userId });
        }
      });

      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIce);
      socket.on('user-disconnected', ({ userId }) => handleDisconnect(userId));
      socket.on('chat-message', (m) => setMsgList((p) => [...p, m]));
      socket.on('kicked', () => {
        alert('You were removed by the host.');
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

  const createPeer = (userId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStreamRef.current
      .getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: userId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      setRemoteStreams((prev) => ({ ...prev, [userId]: remoteStream }));

      // Dynamically assign to the correct video ref
      setTimeout(() => {
        if (videoRefs.current[userId]) {
          videoRefs.current[userId].srcObject = remoteStream;
        }
      }, 100); // slight delay ensures ref is mounted
    };

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() =>
        socket.emit('offer', { target: userId, sdp: pc.localDescription })
      );

    return pc;
  };

  async function handleOffer({ sdp, callerId }) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[callerId] = pc;

    localStreamRef.current
      .getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: callerId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      setRemoteStreams((prev) => ({ ...prev, [callerId]: remoteStream }));
      setTimeout(() => {
        if (videoRefs.current[callerId]) {
          videoRefs.current[callerId].srcObject = remoteStream;
        }
      }, 100);
    };

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

  function handleDisconnect(userId) {
    const pc = peersRef.current[userId];
    if (pc) pc.close();
    delete peersRef.current[userId];

    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
    setParticipants((prev) => prev.filter((id) => id !== userId));
  }

  const sendMsg = () => {
    if (!msg.trim()) return;
    const m = { sender: socket.id, message: msg };
    socket.emit('chat-message', m);
    setMsgList((p) => [...p, m]);
    setMsg('');
  };

  const toggleMute = () => {
    const enabled = !muted;
    localStreamRef.current.getAudioTracks()[0].enabled = enabled;
    setMuted(!enabled);
  };

  const toggleCam = () => {
    const enabled = !camOff;
    localStreamRef.current.getVideoTracks()[0].enabled = enabled;
    setCamOff(!enabled);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Copied!');
  };

  const shareWA = () => {
    const text = encodeURIComponent(`Join my meeting: ${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div>
      <h2>
        Room: {roomId} {isLocked ? '🔒' : ''}
      </h2>

      <div className='video-grid'>
        <div>
          <p>You</p>
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
        {Object.entries(remoteStreams).map(([id, _]) => (
          <div key={id}>
            <p>{id === socket.id ? 'Me' : id.slice(-4)}</p>
            <video
              ref={(ref) => (videoRefs.current[id] = ref)}
              autoPlay
              playsInline
              muted={id === socket.id}
            />
            {isHost && id !== socket.id && (
              <button
                onClick={() => socket.emit('kick-user', { roomId, userId: id })}
              >
                Kick
              </button>
            )}
          </div>
        ))}
      </div>

      <div>
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

      <div>
        <h4>Participants</h4>
        <ul>
          {participants.map((id) => (
            <li key={id}>{id === socket.id ? 'You (Host)' : id.slice(-5)}</li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>Chat</h4>
        <div
          style={{ height: 200, overflowY: 'auto', border: '1px solid gray' }}
        >
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

      <div style={{ marginTop: 20 }}>
        <h4>Invite</h4>
        <code>{inviteLink}</code>
        <button onClick={copyLink}>Copy</button>
        <button onClick={shareWA}>WhatsApp</button>
      </div>
    </div>
  );
}

export default Room;
