/**
 * Protoo-Signaling wie mediasoup-demo (Server-getriebene Consumer + newConsumer-Request).
 * Easymeet-Erweiterungen: Notification "easymeet" mit { type, ... } (Chat, Dateien, …).
 *
 * Übernommene Abläufe angelehnt an versatica/mediasoup-demo (ISC).
 */

import { createRequire } from 'module';
import { normalizeRoomCode } from '../roomCode.js';
import {
  getOrCreateRoom,
  getRoom,
  closePeer,
  createPeerState,
  createWebRtcTransport,
  cleanupMediasoupPeerResources,
} from './rooms.js';

const require = createRequire(import.meta.url);
const { WebSocketServer: ProtooWebSocketServer } = require('protoo-server');

function buildMembersList(room) {
  return Array.from(room.peers.values())
    .filter((p) => p.joined)
    .map((p) => ({
      peerId: p.peerId,
      nick: p.nick,
      muted: p.muted,
      videoEnabled: p.videoEnabled,
      backgroundEffect: p.backgroundEffect,
    }));
}

function serializeProtoPeer(msPeer) {
  return {
    peerId: msPeer.peerId,
    displayName: msPeer.nick,
    device: { flag: 'easymeet', name: 'Easymeet' },
  };
}

function getConsumerTransport(msPeer) {
  for (const t of msPeer.transports.values()) {
    if (t.appData?.direction === 'consumer') return t;
  }
  return null;
}

/**
 * Protoo: Peer.notify ist async — „transport closed“ landet als rejected Promise, nicht in try/catch.
 */
function safeProtooNotify(protooPeer, method, data) {
  if (!protooPeer) return;
  Promise.resolve(protooPeer.notify(method, data)).catch(() => {});
}

function broadcastEasymeet(roomId, payload, excludePeerId = null) {
  const room = getRoom(roomId);
  if (!room) return;
  for (const p of room.peers.values()) {
    if (!p.joined || p.peerId === excludePeerId) continue;
    safeProtooNotify(p.protooPeer, 'easymeet', payload);
  }
}

/**
 * @param {import('./rooms.js').PeerState} consumerPeer
 * @param {import('mediasoup').types.Producer} producer
 * @param {import('./rooms.js').RoomState} room
 */
async function consumeProducerForPeer(consumerPeer, producer, room) {
  const transport = getConsumerTransport(consumerPeer);
  if (!transport) return;
  if (!consumerPeer.joined || !consumerPeer.rtpCapabilities) return;

  if (
    !room.router.canConsume({
      producerId: producer.id,
      rtpCapabilities: consumerPeer.rtpCapabilities,
    })
  ) {
    console.warn(
      '[mediasoup] canConsume false peer=%s producer=%s kind=%s',
      consumerPeer.peerId,
      producer.id,
      producer.kind
    );
    return;
  }

  let consumer;
  try {
    consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities: consumerPeer.rtpCapabilities,
      enableRtx: true,
      /* paused: true + sofort resume() traf nach schnellem Producer-Neuaufbau (z. B. Hintergrundwechsel) in
       * mediasoup gelegentlich „Channel request handler … not found“ beim resume — Client ist nach newConsumer bereit. */
      paused: false,
      ignoreDtx: true,
      appData: {
        peerId: producer.appData.peerId,
        source: producer.appData.source || 'mic',
      },
    });
  } catch (err) {
    console.warn('consumeProducerForPeer failed:', err?.message || err);
    return;
  }

  consumerPeer.consumers.set(consumer.id, consumer);

  consumer.on('transportclose', () => {
    consumerPeer.consumers.delete(consumer.id);
  });

  consumer.on('producerclose', () => {
    consumerPeer.consumers.delete(consumer.id);
    safeProtooNotify(consumerPeer.protooPeer, 'consumerClosed', { consumerId: consumer.id });
  });

  const protooPeer = consumerPeer.protooPeer;
  if (!protooPeer) {
    consumer.close();
    consumerPeer.consumers.delete(consumer.id);
    return;
  }

  try {
    await protooPeer.request('newConsumer', {
      peerId: producer.appData.peerId,
      transportId: transport.id,
      consumerId: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
      consumerScore: consumer.score,
      appData: consumer.appData,
    });
  } catch (err) {
    console.warn('newConsumer request failed:', err?.message || err);
    try {
      consumer.close();
    } catch (_) {}
    consumerPeer.consumers.delete(consumer.id);
  }
}

async function notifyExistingProducersToNewPeer(room, joiningPeer) {
  for (const other of room.peers.values()) {
    if (other.peerId === joiningPeer.peerId || !other.joined) continue;
    for (const producer of other.producers.values()) {
      await consumeProducerForPeer(joiningPeer, producer, room);
    }
  }
}

async function notifyNewProducerToOthers(room, producingPeerId, producer) {
  for (const other of room.peers.values()) {
    if (other.peerId === producingPeerId || !other.joined) continue;
    await consumeProducerForPeer(other, producer, room);
  }
}

function attachPeerToRoom(roomId, room, msPeer, protooPeer) {
  msPeer.protooPeer = protooPeer;

  protooPeer.on('close', () => {
    const roomNow = getRoom(roomId);
    if (!roomNow) return;
    const still = roomNow.peers.get(msPeer.peerId);
    if (!still) return;
    const nick = still.nick ?? '?';
    const leftId = msPeer.peerId;

    /* Abgehender Peer noch in room.peers — nicht an seinen geschlossenen Transport notify-en */
    broadcastEasymeet(
      roomId,
      { type: 'peer_left', peerId: leftId, nick },
      leftId
    );

    closePeer(roomId, leftId, { closeProtooPeer: false });

    const roomAfter = getRoom(roomId);
    if (roomAfter) {
      broadcastEasymeet(
        roomId,
        { type: 'members_updated', members: buildMembersList(roomAfter) },
        null
      );
    }
  });

  protooPeer.on('request', async (request, accept, reject) => {
    try {
      await handleProtooRequest(roomId, room, msPeer, request, accept, reject);
    } catch (err) {
      console.error('protoo request error', request.method, err);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });

  protooPeer.on('notification', (notification) => {
    handleProtooNotification(roomId, room, msPeer, notification).catch((e) =>
      console.warn('protoo notification error', notification.method, e)
    );
  });
}

async function handleProtooRequest(roomId, room, msPeer, request, accept, reject) {
  const { method, data } = request;

  switch (method) {
    case 'getRouterRtpCapabilities': {
      accept({ routerRtpCapabilities: room.router.rtpCapabilities });
      break;
    }

    case 'join': {
      if (msPeer.joined) {
        reject(new Error('Peer already joined'));
        return;
      }
      const {
        displayName,
        device: _device,
        rtpCapabilities,
        sctpCapabilities,
        easymeet,
      } = data;

      msPeer.nick = displayName || msPeer.nick || '?';
      msPeer.rtpCapabilities = rtpCapabilities ?? null;
      msPeer.sctpCapabilities = sctpCapabilities ?? null;
      msPeer.joined = true;

      if (easymeet && typeof easymeet === 'object') {
        if (easymeet.muted !== undefined) msPeer.muted = easymeet.muted;
        if (easymeet.videoEnabled !== undefined) msPeer.videoEnabled = easymeet.videoEnabled;
        if (easymeet.backgroundEffect !== undefined) {
          msPeer.backgroundEffect = easymeet.backgroundEffect ?? 'none';
        }
      }

      const otherPeers = Array.from(room.peers.values()).filter(
        (p) => p.peerId !== msPeer.peerId && p.joined
      );

      for (const other of otherPeers) {
        safeProtooNotify(other.protooPeer, 'newPeer', { peer: serializeProtoPeer(msPeer) });
      }
      broadcastEasymeet(
        roomId,
        {
          type: 'new_peer',
          peerId: msPeer.peerId,
          nick: msPeer.nick,
          muted: msPeer.muted,
          videoEnabled: msPeer.videoEnabled,
          backgroundEffect: msPeer.backgroundEffect,
        },
        msPeer.peerId
      );

      const peersPayload = otherPeers.map((p) => serializeProtoPeer(p));
      accept({ peers: peersPayload });

      await notifyExistingProducersToNewPeer(room, msPeer);

      const members = buildMembersList(room);
      broadcastEasymeet(roomId, { type: 'members_updated', members }, null);
      break;
    }

    case 'createWebRtcTransport': {
      const { sctpCapabilities, forceTcp, appData } = data;
      const direction = appData?.direction === 'consumer' ? 'consumer' : 'producer';
      const info = await createWebRtcTransport(roomId, msPeer.peerId, {
        direction,
        sctpCapabilities,
        forceTcp: !!forceTcp,
      });
      if (!info) {
        reject(new Error('createWebRtcTransport failed'));
        return;
      }
      accept({
        transportId: info.id,
        iceParameters: info.iceParameters,
        iceCandidates: info.iceCandidates,
        dtlsParameters: info.dtlsParameters,
        sctpParameters: info.sctpParameters,
      });
      break;
    }

    case 'connectWebRtcTransport': {
      const { transportId, dtlsParameters } = data;
      const transport = msPeer.transports.get(transportId);
      if (!transport) {
        reject(new Error('transport not found'));
        return;
      }
      await transport.connect({ dtlsParameters });
      accept();
      break;
    }

    case 'restartIce': {
      const { transportId } = data;
      const transport = msPeer.transports.get(transportId);
      if (!transport) {
        reject(new Error('transport not found'));
        return;
      }
      const iceParameters = await transport.restartIce();
      accept({ iceParameters });
      break;
    }

    case 'produce': {
      if (!msPeer.joined) {
        reject(new Error('not joined'));
        return;
      }
      const { transportId, kind, rtpParameters, appData } = data;
      const transport = msPeer.transports.get(transportId);
      if (!transport) {
        reject(new Error('transport not found'));
        return;
      }

      const incomingSource = appData?.source || 'mic';
      /* Race: produceLocalTracks + updateLocalStream können kurz zwei Webcam-Producer erzeugen → doppelte Video-Consumer / schwarze Kachel */
      if (kind === 'video' && (incomingSource === 'video' || incomingSource === 'cam')) {
        for (const [existingId, existingProducer] of [...msPeer.producers.entries()]) {
          const src = existingProducer.appData?.source;
          if (
            existingProducer.kind === 'video' &&
            (src === 'video' || src === 'cam')
          ) {
            try {
              existingProducer.close();
            } catch (_) {}
            msPeer.producers.delete(existingId);
          }
        }
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
        enableMediasoupPacketIdHeaderExtension: true,
        appData: {
          ...(appData || {}),
          peerId: msPeer.peerId,
          source: appData?.source || 'mic',
        },
      });

      msPeer.producers.set(producer.id, producer);
      producer.on('transportclose', () => msPeer.producers.delete(producer.id));

      accept({ producerId: producer.id });

      await notifyNewProducerToOthers(room, msPeer.peerId, producer);
      break;
    }

    default:
      reject(new Error(`unknown method "${method}"`));
  }
}

async function handleProtooNotification(roomId, room, msPeer, notification) {
  const { method, data } = notification;

  switch (method) {
    case 'closeProducer': {
      const producer = msPeer.producers.get(data.producerId);
      if (producer) {
        producer.close();
        msPeer.producers.delete(data.producerId);
      }
      break;
    }

    case 'pauseProducer': {
      const producer = msPeer.producers.get(data.producerId);
      if (producer) await producer.pause();
      break;
    }

    case 'resumeProducer': {
      const producer = msPeer.producers.get(data.producerId);
      if (producer) await producer.resume();
      break;
    }

    case 'pauseConsumer': {
      const consumer = msPeer.consumers.get(data.consumerId);
      if (consumer) await consumer.pause();
      break;
    }

    case 'resumeConsumer': {
      const consumer = msPeer.consumers.get(data.consumerId);
      /* Consumer oft mit paused:false erzeugt — erneutes resume() trifft im Worker „handler not found“. */
      if (consumer && consumer.paused && !consumer.closed) {
        try {
          await consumer.resume();
        } catch (e) {
          console.warn('resumeConsumer:', e?.message || e);
        }
      }
      break;
    }

    case 'easymeet': {
      const msg = data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'chat':
          broadcastEasymeet(
            roomId,
            {
              type: 'chat',
              nick: msg.nick,
              text: msg.text,
              ts: msg.ts,
              giphyUrls: msg.giphyUrls || [],
              peerId: msPeer.peerId,
            },
            msPeer.peerId
          );
          break;

        case 'file_share':
          broadcastEasymeet(
            roomId,
            {
              type: 'file_share',
              nick: msg.nick,
              filename: msg.filename,
              ts: msg.ts,
              fileId: msg.fileId,
              peerId: msPeer.peerId,
            },
            msPeer.peerId
          );
          break;

        case 'mute':
          msPeer.muted = msg.muted ?? msPeer.muted;
          broadcastEasymeet(
            roomId,
            { type: 'mute', peerId: msPeer.peerId, muted: msg.muted },
            msPeer.peerId
          );
          broadcastEasymeet(
            roomId,
            { type: 'members_updated', members: buildMembersList(room) },
            null
          );
          break;

        case 'video':
          msPeer.videoEnabled = msg.videoEnabled ?? msPeer.videoEnabled;
          broadcastEasymeet(
            roomId,
            { type: 'video', peerId: msPeer.peerId, videoEnabled: msg.videoEnabled },
            msPeer.peerId
          );
          broadcastEasymeet(
            roomId,
            { type: 'members_updated', members: buildMembersList(room) },
            null
          );
          break;

        case 'background_effect':
          msPeer.backgroundEffect = msg.effect ?? 'none';
          broadcastEasymeet(
            roomId,
            {
              type: 'background_effect',
              peerId: msPeer.peerId,
              effect: msg.effect || 'none',
            },
            msPeer.peerId
          );
          break;

        case 'screen_stream':
          broadcastEasymeet(
            roomId,
            {
              type: 'screen_stream',
              peerId: msPeer.peerId,
              nick: msg.nick ?? msPeer.nick,
            },
            msPeer.peerId
          );
          break;

        case 'screen_sharing_stopped':
          broadcastEasymeet(
            roomId,
            { type: 'screen_sharing_stopped', peerId: msPeer.peerId },
            msPeer.peerId
          );
          break;

        case 'file_start':
        case 'file_end':
        case 'file_chunk':
          broadcastEasymeet(roomId, msg, msPeer.peerId);
          break;

        default:
          break;
      }
      break;
    }

    default:
      break;
  }
}

/**
 * @param {import('http').Server} httpServer
 */
export function attachProtooToHttpServer(httpServer) {
  const protooWss = new ProtooWebSocketServer(httpServer, {
    maxReceivedFrameSize: 960000,
    maxReceivedMessageSize: 960000,
    fragmentOutgoingMessages: true,
    fragmentationThreshold: 960000,
  });

  protooWss.on('connectionrequest', (info, accept, reject) => {
    try {
      const host = info.request.headers.host || 'localhost';
      const u = new URL(info.request.url || '/', `http://${host}`);

      if (u.pathname !== '/ws') {
        reject(404, 'Not Found');
        return;
      }

      const rawRoomId = u.searchParams.get('roomId');
      const peerId = u.searchParams.get('peerId');
      const roomId = normalizeRoomCode(rawRoomId || '');
      if (!roomId || !peerId) {
        reject(400, 'missing or invalid roomId or peerId');
        return;
      }

      (async () => {
        try {
          const room = await getOrCreateRoom(roomId);

          if (room.protooRoom.hasPeer(peerId)) {
            room.protooRoom.getPeer(peerId).close();
          }
          if (room.peers.has(peerId)) {
            cleanupMediasoupPeerResources(room, peerId);
          }

          const transport = accept();
          const protooPeer = room.protooRoom.createPeer(peerId, transport);
          const msPeer = createPeerState(peerId, '');
          room.peers.set(peerId, msPeer);

          attachPeerToRoom(roomId, room, msPeer, protooPeer);
        } catch (err) {
          console.error('protoo connection failed', err);
          reject(500, String(err?.message || err));
        }
      })();
    } catch (e) {
      reject(500, String(e?.message || e));
    }
  });

  return protooWss;
}
