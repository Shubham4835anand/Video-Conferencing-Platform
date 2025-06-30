import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const socket = io('https://video-conferencing-platform.onrender.com'); // use your deployed URL

function Room() {
  const { roomId } = useParams();
  const localVideoRef = useRef();
  const localStreamRef = useRef();
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [msgList, setMsgList] = useState([]);
  const [msg, setMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

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

      socket.on('user-joined', ({ userId }) => {
        const peer = createPeer(userId, stream);
        peersRef.current[userId] = peer;
      });

      socket.on('offer', handleOffer);
      socket.on('answer', handleAnswer);
      socket.on('ice-candidate', handleIce);
      socket.on('user-disconnected', handleDisconnect);
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
      setRemoteStreams((p) => ({ ...p, [userId]: e.streams[0] }));
    };

    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() =>
        socket.emit('offer', { target: userId, sdp: pc.localDescription })
      );

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
      setRemoteStreams((p) => ({ ...p, [callerId]: e.streams[0] }));
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

  function handleDisconnect({ userId }) {
    const pc = peersRef.current[userId];
    if (pc) pc.close();
    delete peersRef.current[userId];
    setRemoteStreams((p) => {
      const c = { ...p };
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
    const en = !muted;
    localStreamRef.current.getAudioTracks()[0].enabled = en;
    setMuted(!en);
  }

  function toggleCam() {
    const en = !camOff;
    localStreamRef.current.getVideoTracks()[0].enabled = en;
    setCamOff(!en);
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
        {Object.entries(remoteStreams).map(([no, st]) => (
          <video
            key={no}
            ref={(r) => r && (r.srcObject = st)}
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
