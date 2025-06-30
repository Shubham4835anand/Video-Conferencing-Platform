import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const socket = io('https://your-backend.onrender.com'); // 🔁 Change to your deployed backend

function Room() {
  const { roomId } = useParams();
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const inviteLink = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      socket.emit('join-room', { roomId });

      socket.on('user-joined', ({ userId }) => {
        if (!peersRef.current[userId]) {
          const peer = createPeer(userId, stream);
          peersRef.current[userId] = peer;
        }
      });

      socket.on('offer', handleReceiveOffer);
      socket.on('answer', handleReceiveAnswer);
      socket.on('ice-candidate', handleNewICECandidateMsg);
      socket.on('user-disconnected', handleUserDisconnect);
      socket.on('chat-message', (msg) =>
        setChatMessages((prev) => [...prev, msg])
      );
    };

    init();

    return () => {
      Object.values(peersRef.current).forEach((pc) => pc?.close?.());
      socket.disconnect();
    };
  }, [roomId]);

  const createPeer = (userId, stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: userId,
          candidate: e.candidate,
        });
      }
    };

    peer.ontrack = (e) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [userId]: e.streams[0],
      }));
    };

    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .then(() => {
        socket.emit('offer', {
          target: userId,
          sdp: peer.localDescription,
        });
      });

    return peer;
  };

  const handleReceiveOffer = async ({ sdp, callerId }) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[callerId] = peer;

    localStreamRef.current
      .getTracks()
      .forEach((track) => peer.addTrack(track, localStreamRef.current));

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: callerId,
          candidate: e.candidate,
        });
      }
    };

    peer.ontrack = (e) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [callerId]: e.streams[0],
      }));
    };

    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit('answer', {
      target: callerId,
      sdp: peer.localDescription,
    });
  };

  const handleReceiveAnswer = async ({ sdp, target }) => {
    const peer = peersRef.current[target];
    if (peer) {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  };

  const handleNewICECandidateMsg = async ({ candidate, from }) => {
    const peer = peersRef.current[from];
    if (peer && candidate) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('ICE Error:', err);
      }
    }
  };

  const handleUserDisconnect = ({ userId }) => {
    if (peersRef.current[userId]) {
      peersRef.current[userId].close?.();
      delete peersRef.current[userId];
      setRemoteStreams((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    }
  };

  const sendMessage = () => {
    if (message.trim()) {
      const msgObj = { sender: socket.id, message };
      socket.emit('chat-message', msgObj); // No roomId needed here
      setChatMessages((prev) => [...prev, msgObj]);
      setMessage('');
    }
  };

  const toggleMute = () => {
    const enabled = !isMuted;
    localStreamRef.current.getAudioTracks()[0].enabled = enabled;
    setIsMuted(!enabled);
  };

  const toggleCamera = () => {
    const enabled = !cameraOff;
    localStreamRef.current.getVideoTracks()[0].enabled = enabled;
    setCameraOff(!enabled);
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    alert('Link copied to clipboard!');
  };

  const shareOnWhatsApp = () => {
    const encoded = encodeURIComponent(`Join my video call: ${inviteLink}`);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Room: {roomId}</h2>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <h4>Local</h4>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: 300 }}
          />
          <div>
            <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
            <button onClick={toggleCamera}>
              {cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
            </button>
          </div>
        </div>

        <div>
          <h4>Remote Users</h4>
          {Object.entries(remoteStreams).map(([id, stream]) => (
            <video
              key={id}
              autoPlay
              playsInline
              style={{ width: 300, marginBottom: 10 }}
              ref={(ref) => ref && (ref.srcObject = stream)}
            />
          ))}
        </div>

        <div>
          <h4>Chat</h4>
          <div
            style={{
              height: 200,
              overflowY: 'auto',
              border: '1px solid gray',
              padding: 5,
            }}
          >
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <strong>{msg.sender === socket.id ? 'Me' : 'User'}:</strong>{' '}
                {msg.message}
              </div>
            ))}
          </div>
          <input
            type='text'
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder='Message'
          />
          <button onClick={sendMessage}>Send</button>
        </div>

        <div>
          <h4>Invite</h4>
          <p>
            <code>{inviteLink}</code>
          </p>
          <button onClick={copyInviteLink}>Copy Link</button>
          <button onClick={shareOnWhatsApp}>Share via WhatsApp</button>
        </div>
        <div className='video-grid'>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%' }}
          />
          {Object.entries(remoteStreams).map(([id, stream]) => (
            <video
              key={id}
              autoPlay
              playsInline
              style={{ width: '100%' }}
              ref={(ref) => ref && (ref.srcObject = stream)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default Room;
