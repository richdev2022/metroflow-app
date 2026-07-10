import { useEffect, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';
import { useSocket } from '../hooks/useSocket';
import { Button } from './ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff, MessageSquare } from 'lucide-react';

interface VideoCallRoomProps {
  roomId: string;
  onLeave: () => void;
  userName: string;
}

interface Peer {
  id: string;
  producers: string[];
  name?: string;
}

export default function VideoCallRoom({ roomId, onLeave, userName }: VideoCallRoomProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [sendTransport, setSendTransport] = useState<types.Transport | null>(null);
  const [recvTransport, setRecvTransport] = useState<types.Transport | null>(null);
  const [localProducer, setLocalProducer] = useState<types.Producer | null>(null);
  const [localScreenProducer, setLocalScreenProducer] = useState<types.Producer | null>(null);
  const [consumers, setConsumers] = useState<Map<string, types.Consumer>>(new Map());
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; userId: string; userName: string; content: string; timestamp: Date }>>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  
  const { socket, isConnected } = useSocket({
    userId: localStorage.getItem('userId') || '',
    businessId: localStorage.getItem('businessId') || '',
  });

  // Initialize device and get router capabilities
  useEffect(() => {
    if (!socket || !isConnected) return;

    const initializeDevice = async () => {
      try {
        const newDevice = new Device();
        
        socket.emit('mediasoup:getRouterRtpCapabilities', (response: any) => {
          const { routerRtpCapabilities } = response;
          
          newDevice.load({ routerRtpCapabilities })
            .then(() => {
              setDevice(newDevice);
            })
            .catch((error) => {
              console.error('Error loading device:', error);
            });
        });
      } catch (error) {
        console.error('Error initializing device:', error);
      }
    };

    initializeDevice();

    // Listen for new producers from other peers
    const handleNewProducer = ({ producerId, kind, peerId, peerName }: any) => {
      console.log('New producer:', producerId, kind, 'from peer:', peerId);
      
      setPeers(prev => {
        const newPeers = new Map(prev);
        const peer = newPeers.get(peerId) || { id: peerId, producers: [], name: peerName };
        if (!peer.producers.includes(producerId)) {
          peer.producers.push(producerId);
        }
        newPeers.set(peerId, peer);
        return newPeers;
      });
      
      // If we have a recv transport, consume this producer
      if (recvTransport) {
        consume(producerId, kind);
      }
    };

    socket.on('mediasoup:newProducer', handleNewProducer);

    return () => {
      socket.off('mediasoup:newProducer', handleNewProducer);
    };
  }, [socket, isConnected, recvTransport]);

  // Create transports when device is ready
  useEffect(() => {
    if (!device || !socket || !isConnected) return;

    const createTransports = async () => {
      // Create send transport
      socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'send' }, async (response: any) => {
        const { id, iceParameters, iceCandidates, dtlsParameters } = response;
        
        const transport = await device.createSendTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters
        });

        transport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            socket.emit('mediasoup:connectWebRtcTransport', {
              transportId: id,
              dtlsParameters,
              roomId
            }, callback);
          } catch (error) {
            errback(error);
          }
        });

        transport.on('produce', async ({ kind, rtpParameters, appData }: any, callback: any, errback: any) => {
          try {
            socket.emit('mediasoup:produce', {
              transportId: id,
              kind,
              rtpParameters,
              appData,
              roomId
            }, (response: any) => {
              callback({ id: response.id });
            });
          } catch (error) {
            errback(error);
          }
        });

        setSendTransport(transport);
      });

      // Create recv transport
      socket.emit('mediasoup:createWebRtcTransport', { roomId, direction: 'recv' }, async (response: any) => {
        const { id, iceParameters, iceCandidates, dtlsParameters } = response;
        
        const transport = await device.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters
        });

        transport.on('connect', async ({ dtlsParameters }: any, callback: any, errback: any) => {
          try {
            socket.emit('mediasoup:connectWebRtcTransport', {
              transportId: id,
              dtlsParameters,
              roomId
            }, callback);
          } catch (error) {
            errback(error);
          }
        });

        setRecvTransport(transport);
      });
    };

    createTransports();
  }, [device, socket, isConnected, roomId]);

  // When recv transport is ready, consume any existing producers
  useEffect(() => {
    if (!recvTransport || !peers) return;

    peers.forEach(peer => {
      peer.producers.forEach(producerId => {
        if (!consumers.has(producerId)) {
          // We don't know the kind here, but let's assume we'll get it later
        }
      });
    });
  }, [recvTransport, peers, consumers]);

  const consume = async (producerId: string, kind: types.MediaKind) => {
    if (!recvTransport || !device || !socket) return;

    try {
      socket.emit('mediasoup:consume', {
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.recvRtpCapabilities,
        roomId
      }, async (response: any) => {
        const { id, rtpParameters, producerId: prodId } = response;
        
        const consumer = await recvTransport.consume({
          id,
          producerId: prodId,
          kind,
          rtpParameters
        });

        // Resume the consumer
        socket.emit('mediasoup:resume', { consumerId: id, roomId }, () => {
          console.log('Consumer resumed');
        });

        setConsumers(prev => new Map(prev.set(producerId, consumer)));
      });
    } catch (error) {
      console.error('Error consuming:', error);
    }
  };

  const startLocalMedia = async () => {
    if (!sendTransport || !device) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      // Attach local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Produce audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { userName }
        });
        setLocalProducer(audioProducer);
      }

      // Produce video
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: { userName }
        });
        setLocalProducer(videoProducer);
      }
    } catch (error) {
      console.error('Error starting local media:', error);
    }
  };

  const stopLocalMedia = () => {
    if (localProducer) {
      localProducer.close();
      setLocalProducer(null);
    }
    if (localVideoRef.current?.srcObject) {
      const tracks = (localVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const toggleAudio = () => {
    if (localProducer) {
      if (isAudioEnabled) {
        localProducer.pause();
      } else {
        localProducer.resume();
      }
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  const toggleVideo = () => {
    if (localProducer) {
      if (isVideoEnabled) {
        localProducer.pause();
      } else {
        localProducer.resume();
      }
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const startScreenShare = async () => {
    if (!sendTransport) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      if (localScreenRef.current) {
        localScreenRef.current.srcObject = stream;
      }

      const track = stream.getVideoTracks()[0];
      if (track) {
        const screenProducer = await sendTransport.produce({
          track,
          appData: { userName, screenShare: true }
        });
        setLocalScreenProducer(screenProducer);
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  const stopScreenShare = () => {
    if (localScreenProducer) {
      localScreenProducer.close();
      setLocalScreenProducer(null);
    }
    if (localScreenRef.current?.srcObject) {
      const tracks = (localScreenRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsScreenSharing(false);
  };

  const leaveCall = () => {
    stopLocalMedia();
    stopScreenShare();
    consumers.forEach(consumer => consumer.close());
    onLeave();
  };

  const sendChatMessage = (content: string) => {
    if (!socket) return;

    const message = {
      id: Date.now().toString(),
      userId: localStorage.getItem('userId') || '',
      userName,
      content,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, message]);
    socket.emit('meeting-chat:message', {
      meetingId: roomId,
      message: content
    });
  };

  // Listen for incoming chat messages
  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = ({ userId, message, timestamp, userName: senderName }: any) => {
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        userId,
        userName: senderName || userId,
        content: message,
        timestamp: new Date(timestamp)
      }]);
    };

    socket.on('meeting-chat:message', handleIncomingMessage);

    return () => {
      socket.off('meeting-chat:message', handleIncomingMessage);
    };
  }, [socket]);

  // Start local media when component mounts
  useEffect(() => {
    if (device && sendTransport) {
      startLocalMedia();
    }
  }, [device, sendTransport]);

  return (
    <div className="flex flex-col h-full bg-black">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {/* Local video */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
            You
          </div>
        </div>

        {/* Screen share */}
        {isScreenSharing && localScreenRef.current && (
          <div className="relative bg-gray-900 rounded-lg overflow-hidden md:col-span-2 lg:col-span-2">
            <video
              ref={localScreenRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
              Your Screen
            </div>
          </div>
        )}

        {/* Remote videos */}
        {Array.from(peers.values()).map(peer => (
          peer.producers.map(producerId => {
            const consumer = consumers.get(producerId);
            if (!consumer) return null;

            return (
              <div key={`${peer.id}-${producerId}`} className="relative bg-gray-900 rounded-lg overflow-hidden">
                <video
                  ref={(el) => {
                    if (el) {
                      remoteVideosRef.current.set(producerId, el);
                      if (consumer.track) {
                        const stream = new MediaStream([consumer.track]);
                        el.srcObject = stream;
                      }
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded">
                  {peer.name || peer.id}
                </div>
              </div>
            );
          })
        ))}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 p-4 flex items-center justify-center gap-4">
        <Button
          onClick={toggleAudio}
          variant="secondary"
          className="rounded-full w-12 h-12 p-0"
        >
          {isAudioEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>

        <Button
          onClick={toggleVideo}
          variant="secondary"
          className="rounded-full w-12 h-12 p-0"
        >
          {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
        </Button>

        <Button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          variant="secondary"
          className="rounded-full w-12 h-12 p-0"
        >
          {isScreenSharing ? <ScreenShareOff className="h-6 w-6" /> : <ScreenShare className="h-6 w-6" />}
        </Button>

        <Button
          onClick={() => setShowChat(!showChat)}
          variant="secondary"
          className="rounded-full w-12 h-12 p-0"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>

        <Button
          onClick={leaveCall}
          variant="destructive"
          className="rounded-full w-12 h-12 p-0"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>

      {/* Chat panel */}
      {showChat && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Chat</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {chatMessages.map(msg => (
              <div key={msg.id} className="text-sm">
                <span className="font-semibold">{msg.userName}:</span> {msg.content}
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 border rounded-lg"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    sendChatMessage(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                if (input.value) {
                  sendChatMessage(input.value);
                  input.value = '';
                }
              }}>
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
