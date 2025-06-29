import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000'; // Replace with your backend

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function Room() {
  const { roomId } = useParams();
  const socketRef = useRef();
  const peerConnections = useRef({});
  const localVideoRef = useRef();
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [screenSharing, setScreenSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const localStreamRef = useRef();

  const currentURL = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    socketRef.current = io(SERVER_URL);
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream;
        localVideoRef.current.srcObject = stream;
        socketRef.current.emit('join-room', roomId);
      });

    socketRef.current.on('all-users', (users) => {
      users.forEach((userId) => {
        createPeer(userId, true);
      });
    });

    socketRef.current.on('user-joined', (userId) => {
      createPeer(userId, false);
    });

    socketRef.current.on('offer', async ({ sdp, from }) => {
      const pc = createPeer(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush pending ICE candidates
      const pcWrapper = peerConnections.current[from];
      pcWrapper.pendingCandidates.forEach((c) => {
        pcWrapper.connection
          .addIceCandidate(new RTCIceCandidate(c))
          .catch(console.error);
      });
      pcWrapper.pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit('answer', {
        target: from,
        sdp: pc.localDescription,
      });
    });

    socketRef.current.on('answer', async ({ sdp, from }) => {
      await peerConnections.current[from]?.setRemoteDescription(
        new RTCSessionDescription(sdp)
      );
    });

    socketRef.current.on('ice-candidate', ({ candidate, from }) => {
      const pcWrapper = peerConnections.current[from];
      if (!pcWrapper) return;

      if (pcWrapper.connection.remoteDescription) {
        pcWrapper.connection
          .addIceCandidate(new RTCIceCandidate(candidate))
          .catch(console.error);
      } else {
        pcWrapper.pendingCandidates.push(candidate);
      }
    });

    socketRef.current.on('chat-message', ({ user, message }) => {
      setChatMessages((prev) => [...prev, { user, message }]);
    });

    socketRef.current.on('user-left', (userId) => {
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].connection.close();
        delete peerConnections.current[userId];
        setRemoteStreams((prev) => prev.filter((v) => v.id !== userId));
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [roomId]);

  const createPeer = (userId, isInitiator) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[userId] = {
      connection: pc,
      pendingCandidates: [],
    };

    localStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit('ice-candidate', {
          target: userId,
          candidate: e.candidate,
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStreams((prev) => {
        const exists = prev.find((v) => v.id === userId);
        if (!exists) {
          return [...prev, { id: userId, stream: e.streams[0] }];
        }
        return prev;
      });
    };

    if (isInitiator) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socketRef.current.emit('offer', {
          target: userId,
          sdp: offer,
        });
      });
    }

    return pc;
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socketRef.current.emit('chat-message', {
        roomId,
        user: 'You',
        message: chatInput,
      });
      setChatMessages((prev) => [...prev, { user: 'You', message: chatInput }]);
      setChatInput('');
    }
  };

  const handleScreenShare = async () => {
    if (!screenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        const screenTrack = screenStream.getTracks()[0];
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });
        screenTrack.onended = () => {
          stopScreenShare();
        };
        localVideoRef.current.srcObject = screenStream;
        setScreenSharing(true);
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  };

  const stopScreenShare = () => {
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    });
    localVideoRef.current.srcObject = localStreamRef.current;
    setScreenSharing(false);
  };

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(currentURL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className='room-container'>
      <div className='video-grid'>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className='video-box'
        />
        {remoteStreams.map(({ id, stream }) => (
          <video
            key={id}
            autoPlay
            playsInline
            className='video-box'
            ref={(video) => {
              if (video) video.srcObject = stream;
            }}
          />
        ))}
      </div>

      <div className='controls'>
        <button onClick={screenSharing ? stopScreenShare : handleScreenShare}>
          {screenSharing ? 'Stop Sharing' : 'Share Screen'}
        </button>
      </div>

      <div className='chat-box'>
        <div className='chat-messages'>
          {chatMessages.map((msg, i) => (
            <div key={i}>
              <strong>{msg.user}:</strong> {msg.message}
            </div>
          ))}
        </div>
        <form onSubmit={handleChatSubmit}>
          <input
            type='text'
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder='Type message'
          />
          <button type='submit'>Send</button>
        </form>
        <div style={{ margin: '10px 0' }}>
          <button onClick={copyLinkToClipboard}>🔗 Copy Invite Link</button>
          {copied && (
            <span style={{ marginLeft: '10px', color: 'green' }}>
              Link Copied!
            </span>
          )}
        </div>
        <a
          href={`https://wa.me/?text=Join my video call: ${currentURL}`}
          target='_blank'
          rel='noopener noreferrer'
        >
          Share via WhatsApp
        </a>
      </div>
    </div>
  );
}

export default Room;
