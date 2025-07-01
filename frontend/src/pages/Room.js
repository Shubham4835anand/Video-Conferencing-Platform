import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const socket = io('http://localhost:5000');

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef();
  const peers = useRef({});
  const videoRefs = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [msgList, setMsgList] = useState([]);
  const [msg, setMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const isHost = participants[0] === socket.id;
  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      localVideoRef.current.srcObject = stream;

      socket.emit('join-room', { roomId });

      socket.on('all-users', (users) => {
        setParticipants([socket.id, ...users]);
        users.forEach((uid) => initiatePeer(uid, stream));
      });

      socket.on('user-joined', ({ userId }) => {
        if (!isLocked) {
          setParticipants((p) => [...p, userId]);
          initiatePeer(userId, localVideoRef.current.srcObject);
        } else socket.emit('kick-user', { roomId, userId });
      });

      socket.on('offer', handleReceiveOffer);
      socket.on('answer', handleReceiveAnswer);
      socket.on('ice-candidate', handleNewICE);

      socket.on('user-disconnected', ({ userId }) => handleDisconnect(userId));
      socket.on(
        'chat-message',
        setMsgList((p) => [...p, p[p.length]])
      );
      socket.on('room-locked', () => setIsLocked(true));
      socket.on('room-unlocked', () => setIsLocked(false));
      socket.on('kicked', () => {
        alert('Kicked by host');
        navigate('/');
      });
    }
    init();
    return () => socket.disconnect();
  }, [roomId]);

  const initiatePeer = (uid, stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) =>
      e.candidate &&
      socket.emit('ice-candidate', { target: uid, candidate: e.candidate });
    pc.ontrack = (e) => assignStream(uid, e.streams[0]);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .then(() =>
        socket.emit('offer', { target: uid, sdp: pc.localDescription })
      );
    peers.current[uid] = pc;
  };

  const handleReceiveOffer = async ({ sdp, callerId }) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) =>
      e.candidate &&
      socket.emit('ice-candidate', {
        target: callerId,
        candidate: e.candidate,
      });
    pc.ontrack = (e) => assignStream(callerId, e.streams[0]);
    localVideoRef.current.srcObject
      .getTracks()
      .forEach((t) => pc.addTrack(t, localVideoRef.current.srcObject));
    peers.current[callerId] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: callerId, sdp: pc.localDescription });
  };

  const handleReceiveAnswer = ({ sdp, target }) => {
    const pc = peers.current[target];
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(sdp));
  };

  const handleNewICE = ({ from, candidate }) => {
    const pc = peers.current[from];
    if (pc)
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  };

  const assignStream = (uid, strm) => {
    setRemoteStreams((prev) => ({ ...prev, [uid]: strm }));
    setTimeout(() => {
      const v = videoRefs.current[uid];
      if (v && v.srcObject !== strm) v.srcObject = strm;
    }, 50);
  };

  const handleDisconnect = (uid) => {
    if (peers.current[uid]) peers.current[uid].close();
    delete peers.current[uid];
    delete videoRefs.current[uid];
    setRemoteStreams((prev) => {
      const c = { ...prev };
      delete c[uid];
      return c;
    });
    setParticipants((p) => p.filter((id) => id !== uid));
  };

  const toggleMute = () => {
    localVideoRef.current.srcObject.getAudioTracks()[0].enabled = muted;
    setMuted(!muted);
  };

  const toggleCam = () => {
    localVideoRef.current.srcObject.getVideoTracks()[0].enabled = camOff;
    setCamOff(!camOff);
  };

  const sendMsg = () => {
    if (!msg.trim()) return;
    const o = { roomId, sender: socket.id, message: msg };
    socket.emit('chat-message', o);
    setMsgList((p) => [...p, o]);
    setMsg('');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>
        Room {roomId} {isLocked ? '🔒' : ''}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
          gap: 10,
        }}
      >
        <div>
          <p>You (Host)</p>
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            style={{ width: '100%' }}
          />
        </div>
        {participants
          .filter((id) => id !== socket.id)
          .map((uid) => (
            <div key={uid}>
              <p>{uid.slice(-4)}</p>
              <video
                ref={(v) => (videoRefs.current[uid] = v)}
                autoPlay
                playsInline
                muted
                style={{ width: '100%' }}
              />
              {isHost && (
                <button
                  onClick={() =>
                    socket.emit('kick-user', { roomId, userId: uid })
                  }
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
            {isLocked ? 'Unlock' : 'Lock'}
          </button>
        )}
      </div>
      <div>
        <h4>Chat</h4>
        <div
          style={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid #ddd',
            padding: 5,
          }}
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
          placeholder='Say something…'
        />
        <button onClick={sendMsg}>Send</button>
      </div>
      <div style={{ marginTop: 20 }}>
        <p>Invite Link:</p>
        <code>{inviteLink}</code>
      </div>
    </div>
  );
}
