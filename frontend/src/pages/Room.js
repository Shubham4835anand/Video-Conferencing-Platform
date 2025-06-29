import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const socket = io('http://localhost:5000'); // Update if hosted elsewhere

function Room() {
  const { roomId } = useParams();
  const localVideoRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    async function startMedia() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      socket.emit('join-room', { roomId });

      socket.on('user-joined', ({ userId }) => {
        const peer = createPeer(userId, socket.id, stream);
        peersRef.current[userId] = peer;
      });

      socket.on('offer', handleReceiveOffer);
      socket.on('answer', handleReceiveAnswer);
      socket.on('ice-candidate', handleNewICECandidate);
      socket.on('user-disconnected', handleUserDisconnected);

      socket.on('chat-message', (msg) => {
        setChatMessages((prev) => [...prev, msg]);
      });
    }

    startMedia();

    return () => {
      Object.values(peersRef.current).forEach((pc) => pc.close());
      socket.disconnect();
    };
  }, [roomId]);

  const createPeer = (targetUserId, callerId, stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach((track) => {
      peer.addTrack(track, stream);
    });

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', {
          target: targetUserId,
          candidate: e.candidate,
        });
      }
    };

    peer.ontrack = (e) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [targetUserId]: e.streams[0],
      }));
    };

    peer
      .createOffer()
      .then((offer) => peer.setLocalDescription(offer))
      .then(() => {
        socket.emit('offer', {
          target: targetUserId,
          callerId,
          sdp: peer.localDescription,
        });
      });

    return peer;
  };

  const handleReceiveOffer = async ({ sdp, callerId }) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current[callerId] = peer;

    localStreamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });

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

  const handleNewICECandidate = async ({ candidate, from }) => {
    const peer = peersRef.current[from];
    if (peer && candidate) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding received ICE candidate', err);
      }
    }
  };

  const handleUserDisconnected = ({ userId }) => {
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
      socket.emit('chat-message', msgObj);
      setChatMessages((prev) => [...prev, msgObj]);
      setMessage('');
    }
  };

  const toggleMute = () => {
    const enabled = !isMuted;
    localStreamRef.current.getAudioTracks()[0].enabled = !isMuted;
    setIsMuted(!enabled);
  };

  const toggleCamera = () => {
    const enabled = !cameraOff;
    localStreamRef.current.getVideoTracks()[0].enabled = !cameraOff;
    setCameraOff(!enabled);
  };

  return (
    <div style={{ display: 'flex', gap: '20px', padding: '10px' }}>
      <div>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '300px' }}
        />
        {Object.entries(remoteStreams).map(([userId, stream]) => (
          <video
            key={userId}
            srcObject={stream}
            autoPlay
            playsInline
            style={{ width: '300px' }}
          />
        ))}
        <div style={{ marginTop: '10px' }}>
          <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
          <button onClick={toggleCamera}>
            {cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          </button>
        </div>
      </div>

      <div style={{ width: '250px' }}>
        <h4>Chat</h4>
        <div
          style={{
            height: '300px',
            overflowY: 'auto',
            border: '1px solid gray',
            padding: '5px',
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
          placeholder='Type message'
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Room;
