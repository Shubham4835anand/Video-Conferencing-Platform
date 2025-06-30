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
  const [remoteStreams, setRemoteStreams] = useState({});
  const [msgList, setMsgList] = useState([]);
  const [msg, setMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [participants, setParticipants] = useState([]);

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
        setParticipants(users);
        users.forEach((userId) => {
          const peer = createPeer(userId, localStreamRef.current);
          peersRef.current[userId] = peer;
        });
      });

      socket.on('user-joined', ({ userId }) => {
        setParticipants((prev) => [...prev, userId]);
      });

      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIce);
      socket.on('user-disconnected', ({ userId }) => {
        handleDisconnect(userId);
        setParticipants((prev) => prev.filter((id) => id !== userId));
      });

      socket.on('chat-message', (m) => setMsgList((p) => [...p, m]));
    }

    init();
    return () => {
      Object.values(peersRef.current).forEach((p) => p.close());
      socket.disconnect();
    };
  }, [roomId]);

  function createPeer(userId, stream) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: userId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams((prev) => ({ ...prev, [userId]: e.streams[0] }));
    };

    pc.createOffer().then((o) => {
      pc.setLocalDescription(o);
      socket.emit('offer', { target: userId, sdp: o });
    });

    return pc;
  }

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
      setRemoteStreams((prev) => ({ ...prev, [callerId]: e.streams[0] }));
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
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
      const c = { ...prev };
      delete c[userId];
      return c;
    });
  }

  function sendMsg() {
    if (!msg.trim()) return;
    const m = { sender: socket.id, message: msg };
    socket.emit('chat-message', m);
    setMsgList((p) => [...p, m]);
    setMsg('');
  }

  function toggleMute() {
    const enabled = !muted;
    localStreamRef.current.getAudioTracks()[0].enabled = enabled;
    setMuted(!enabled);
  }

  function toggleCam() {
    const enabled = !camOff;
    localStreamRef.current.getVideoTracks()[0].enabled = enabled;
    setCamOff(!enabled);
  }

  function copyLink() {
    navigator.clipboard.writeText(inviteLink);
    alert('Copied!');
  }

  function shareWA() {
    const text = encodeURIComponent(`Join me: ${inviteLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  return (
    <div>
      <h2>Room: {roomId}</h2>
      <div className='video-grid'>
        <video ref={localVideoRef} autoPlay muted playsInline />
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <video
            key={id}
            ref={(r) => r && (r.srcObject = stream)}
            autoPlay
            playsInline
          />
        ))}
      </div>

      <div>
        <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleCam}>
          {camOff ? 'Camera On' : 'Camera Off'}
        </button>
      </div>

      <div>
        <h4>Participants</h4>
        <ul>
          {participants.map((id) => (
            <li key={id}>{id}</li>
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
        <button onClick={shareWA}>Share on WhatsApp</button>
      </div>
    </div>
  );
}

export default Room;
