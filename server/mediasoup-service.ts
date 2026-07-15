import * as mediasoup from "mediasoup";

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

type PeerInfo = {
  socketId: string;
  userId?: string;
  userName?: string;
};

type RoomState = {
  router: any;
  transports: Map<string, any>;
  producers: Map<string, any>;
  consumers: Map<string, any>;
  producerPeers: Map<string, PeerInfo>;
  transportPeers: Map<string, PeerInfo>;
};

let worker: any;
const rooms = new Map<string, RoomState>();

async function getWorker() {
  if (worker) return worker;

  worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.MEDIASOUP_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_MAX_PORT || 49999),
  });

  worker.on("died", () => {
    console.error("mediasoup worker died; exiting process");
    setTimeout(() => process.exit(1), 1000);
  });

  return worker;
}

export async function getOrCreateRoom(roomId: string): Promise<RoomState> {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const mediasoupWorker = await getWorker();
  const router = await mediasoupWorker.createRouter({ mediaCodecs });
  const room: RoomState = {
    router,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    producerPeers: new Map(),
    transportPeers: new Map(),
  };

  rooms.set(roomId, room);
  return room;
}

export async function getRouterRtpCapabilities(roomId: string) {
  const room = await getOrCreateRoom(roomId);
  return room.router.rtpCapabilities;
}

export async function createWebRtcTransport(roomId: string, peer: PeerInfo) {
  const room = await getOrCreateRoom(roomId);
  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: "0.0.0.0", announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  room.transports.set(transport.id, transport);
  room.transportPeers.set(transport.id, peer);

  transport.on("dtlsstatechange", (state: string) => {
    if (state === "closed") {
      transport.close();
    }
  });

  transport.on("close", () => {
    room.transports.delete(transport.id);
    room.transportPeers.delete(transport.id);
  });

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

export async function connectWebRtcTransport(roomId: string, transportId: string, dtlsParameters: any) {
  const room = await getOrCreateRoom(roomId);
  const transport = room.transports.get(transportId);
  if (!transport) throw new Error("Transport not found");
  await transport.connect({ dtlsParameters });
}

export async function produce(
  roomId: string,
  transportId: string,
  kind: "audio" | "video",
  rtpParameters: any,
  appData: any,
) {
  const room = await getOrCreateRoom(roomId);
  const transport = room.transports.get(transportId);
  if (!transport) throw new Error("Transport not found");

  const peer = room.transportPeers.get(transportId) || { socketId: "" };
  const producer = await transport.produce({
    kind,
    rtpParameters,
    appData: { ...appData, ...peer },
  });

  room.producers.set(producer.id, producer);
  room.producerPeers.set(producer.id, peer);

  producer.on("transportclose", () => {
    room.producers.delete(producer.id);
    room.producerPeers.delete(producer.id);
  });

  producer.on("close", () => {
    room.producers.delete(producer.id);
    room.producerPeers.delete(producer.id);
  });

  return {
    id: producer.id,
    kind: producer.kind,
    peer,
    appData: producer.appData,
  };
}

export async function consume(roomId: string, transportId: string, producerId: string, rtpCapabilities: any) {
  const room = await getOrCreateRoom(roomId);
  const transport = room.transports.get(transportId);
  const producer = room.producers.get(producerId);

  if (!transport) throw new Error("Transport not found");
  if (!producer) throw new Error("Producer not found");
  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error("Cannot consume this producer");
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  });

  room.consumers.set(consumer.id, consumer);

  consumer.on("transportclose", () => {
    room.consumers.delete(consumer.id);
  });

  consumer.on("producerclose", () => {
    room.consumers.delete(consumer.id);
  });

  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export async function resumeConsumer(roomId: string, consumerId: string) {
  const room = await getOrCreateRoom(roomId);
  const consumer = room.consumers.get(consumerId);
  if (!consumer) throw new Error("Consumer not found");
  await consumer.resume();
}

export async function getRoomProducers(roomId: string, socketId?: string) {
  const room = await getOrCreateRoom(roomId);
  return Array.from(room.producers.values())
    .filter((producer: any) => producer.appData?.socketId !== socketId)
    .map((producer: any) => ({
      producerId: producer.id,
      kind: producer.kind,
      peerId: producer.appData?.userId || producer.appData?.socketId,
      peerName: producer.appData?.userName,
      appData: producer.appData,
    }));
}

export function closePeer(socketId: string) {
  for (const [roomId, room] of rooms.entries()) {
    for (const [transportId, peer] of room.transportPeers.entries()) {
      if (peer.socketId === socketId) {
        room.transports.get(transportId)?.close();
        room.transports.delete(transportId);
        room.transportPeers.delete(transportId);
      }
    }

    if (room.transports.size === 0 && room.producers.size === 0 && room.consumers.size === 0) {
      room.router.close();
      rooms.delete(roomId);
    }
  }
}
