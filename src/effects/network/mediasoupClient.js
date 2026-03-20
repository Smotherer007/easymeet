/**
 * mediasoup Client – Protoo wie mediasoup-demo (`_reference/mediasoup-demo/app/src/RoomClient.js`).
 * Öffentliche API unverändert für bootstrap / roomView.
 *
 * Abläufe angelehnt an versatica/mediasoup-demo (ISC).
 */

import * as mediasoupClient from 'mediasoup-client';
import { AwaitQueue } from 'awaitqueue';
import * as cryptoUtil from '../../utils/crypto.js';
import protooPkg from 'protoo-client';

const ProtooPeer = protooPkg.Peer;
const WebSocketTransport = protooPkg.WebSocketTransport;

const CHUNK_SIZE = 16384;
const CHUNK_DELAY_MS = 30;

/** Wie mediasoup-demo RoomClient.js – leeres Objekt, Platzhalter für ggf. proprietaryConstraints */
const PC_PROPRIETARY_CONSTRAINTS = {};

function isWebcamVideoSource(src) {
  return src === 'cam' || src === 'video';
}

function isScreenShareSource(src) {
  return src === 'screen' || src === 'screensharing';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Diagnose: immer sichtbar — bei Bedarf in Konsole filtern: easymeet/ms */
function msLog(...args) {
  console.info('[easymeet/ms]', ...args);
}

function msWarn(...args) {
  console.warn('[easymeet/ms]', ...args);
}

/**
 * Protoo-WebSocket-URL.
 * In Vite-Dev: direkt Port 3001 — der Vite-WS-Proxy (/ws) verliert oft das Subprotokoll „protoo“,
 * dann verbindet der Browser ohne Fehlermeldung nicht zuverlässig (protoo-client nutzt protocol „protoo“).
 * Production: gleicher Host wie die Seite (ein Server für Static + API + /ws).
 */
function canonicalRoomIdForProtoo(roomId) {
  const s = String(roomId ?? '').trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return s || String(roomId ?? '').trim();
}

function getProtooUrl(roomId, peerId) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const id = canonicalRoomIdForProtoo(roomId);
  const q = new URLSearchParams({ roomId: id, peerId });
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_MEDIASOUP_PROTOO_PORT || '3001';
    const url = `${proto}//${location.hostname}:${port}/ws?${q}`;
    msLog('Dev: Protoo direkt (nicht über Vite-Proxy):', url);
    return url;
  }
  return `${proto}//${location.host}/ws?${q}`;
}

async function notifyEasymeet(protoo, payload) {
  if (protoo.closed) return;
  await protoo.notify('easymeet', payload);
}

/* ---------- getUserMedia etc. ---------- */

export async function getUserMedia(inputDeviceId = null, requestVideo = true, videoDeviceId = null) {
  const videoOnly = requestVideo === 'videoOnly';
  /**
   * explizites Gerät (Einstellungen / gespeicherte ID): `exact` — sonst ignoriert Chromium
   * `ideal` oft und es bleibt das erste Mikro/Kamera aktiv.
   */
  const constraints = {
    audio: videoOnly
      ? false
      : {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: false,
          ...(inputDeviceId && String(inputDeviceId).length ? { deviceId: { exact: inputDeviceId } } : {}),
        },
    video:
      requestVideo && requestVideo !== false
        ? {
            width: { ideal: 640 },
            height: { ideal: 480 },
            ...(videoDeviceId && String(videoDeviceId).length ? { deviceId: { exact: videoDeviceId } } : {}),
          }
        : false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

function isStaleDeviceConstraintError(e) {
  const n = e?.name;
  return (
    n === 'OverconstrainedError' ||
    n === 'NotFoundError' ||
    n === 'ConstraintNotSatisfiedError'
  );
}

export async function getUserMediaResilient(inputDeviceId, requestVideo, videoDeviceId) {
  const combos = [
    [inputDeviceId ?? null, videoDeviceId ?? null],
    [null, videoDeviceId ?? null],
    [inputDeviceId ?? null, null],
    [null, null],
  ];
  const seen = new Set();
  let lastErr;
  for (const [a, vId] of combos) {
    const key = `${a}|${vId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await getUserMedia(a || undefined, requestVideo, vId || undefined);
    } catch (e) {
      lastErr = e;
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') throw e;
      if (!isStaleDeviceConstraintError(e)) throw e;
    }
  }
  throw lastErr ?? new Error('getUserMedia failed');
}

export async function getAudioDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  return { inputs, outputs };
}

export async function getVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

export async function getScreenStream() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: true,
  });
}

/* ---------- Transports (protoo requests) ---------- */

async function createSendTransport(protoo, device) {
  const transportInfo = await protoo.request('createWebRtcTransport', {
    sctpCapabilities: undefined,
    forceTcp: false,
    appData: { direction: 'producer' },
  });

  const {
    transportId,
    iceParameters,
    iceCandidates,
    dtlsParameters,
    sctpParameters,
  } = transportInfo;

  const transport = device.createSendTransport({
    id: transportId,
    iceParameters,
    iceCandidates,
    dtlsParameters: { ...dtlsParameters, role: 'auto' },
    sctpParameters,
    iceServers: [],
    proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
    additionalSettings: { encodedInsertableStreams: false },
  });

  transport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
    protoo
      .request('connectWebRtcTransport', { transportId: transport.id, dtlsParameters: dtls })
      .then(callback)
      .catch(errback);
  });

  transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
    try {
      const { producerId } = await protoo.request('produce', {
        transportId: transport.id,
        kind,
        rtpParameters,
        appData,
      });
      callback({ id: producerId });
    } catch (e) {
      errback(e);
    }
  });

  return transport;
}

async function createRecvTransport(protoo, device) {
  const transportInfo = await protoo.request('createWebRtcTransport', {
    sctpCapabilities: undefined,
    forceTcp: false,
    appData: { direction: 'consumer' },
  });

  const {
    transportId,
    iceParameters,
    iceCandidates,
    dtlsParameters,
    sctpParameters,
  } = transportInfo;

  const transport = device.createRecvTransport({
    id: transportId,
    iceParameters,
    iceCandidates,
    dtlsParameters: { ...dtlsParameters, role: 'auto' },
    sctpParameters,
    iceServers: [],
    proprietaryConstraints: PC_PROPRIETARY_CONSTRAINTS,
    additionalSettings: { encodedInsertableStreams: false },
  });

  transport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
    protoo
      .request('connectWebRtcTransport', { transportId: transport.id, dtlsParameters: dtls })
      .then(callback)
      .catch(errback);
  });

  return transport;
}

/* ---------- produce (aligniert mit mediasoup-demo RoomClient enableMic / enableWebcam) ---------- */

async function produceDemoMic(sendTransport, track) {
  if (!track || !sendTransport) return null;
  /* Kein absCaptureTime: Easymeet-Router nutzt nur Standard-Codecs (vgl. server/mediasoup/config.js). */
  return sendTransport.produce({
    track,
    codecOptions: {
      opusStereo: true,
      opusDtx: true,
      opusFec: true,
      opusNack: true,
    },
    appData: { source: 'audio' },
  });
}

async function produceDemoWebcam(sendTransport, track) {
  if (!track || !sendTransport) return null;
  return sendTransport.produce({
    track,
    codecOptions: { videoGoogleStartBitrate: 1000 },
    appData: { source: 'video' },
  });
}

/** Bildschirmfreigabe: Demo nutzt source „screensharing“ für streamId-Zuordnung */
async function produceDemoScreenTrack(sendTransport, track) {
  if (!track || !sendTransport) return null;
  const base = {
    track,
    appData: { source: 'screensharing' },
  };
  if (track.kind === 'video') {
    return sendTransport.produce({
      ...base,
      codecOptions: { videoGoogleStartBitrate: 1000 },
    });
  }
  return sendTransport.produce({
    ...base,
    codecOptions: {
      opusStereo: true,
      opusDtx: true,
      opusFec: true,
      opusNack: true,
    },
  });
}

/* ---------- Peer-ID ---------- */

function generatePeerId() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createPeer() {
  const peerId = generatePeerId();
  return Promise.resolve({ peer: { id: peerId, _ms: true, destroy() {} }, id: peerId });
}

/* ---------- File handling ---------- */

function createFileDataHandler(dispatch, roomId = '', password = '') {
  let fileBuffer = [];
  let fileMeta = null;
  let chunkQueue = [];
  let chunkProcessing = false;
  let currentFileId = '';

  async function processChunkQueue() {
    if (chunkProcessing || !chunkQueue.length) return;
    chunkProcessing = true;
    while (chunkQueue.length) {
      const data = chunkQueue.shift();
      let chunk = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
      if (fileMeta?.encrypted && password && roomId) {
        const key = await cryptoUtil.deriveKey(password, roomId);
        const decrypted = await cryptoUtil.decrypt(chunk, key);
        chunk = new Uint8Array(decrypted);
      }
      fileBuffer.push(chunk);
      if (dispatch && fileMeta?.size) {
        const bytesReceived = fileBuffer.reduce((s, c) => s + (c.byteLength || c.length), 0);
        dispatch({
          type: 'file/progress',
          payload: {
            filename: fileMeta.filename,
            bytesReceived,
            total: fileMeta.size,
            speedKbps: 0,
            fileId: currentFileId,
            nick: fileMeta.fromNick,
          },
        });
      }
    }
    chunkProcessing = false;
  }

  return (data) => {
    if (typeof data === 'object' && data !== null && !(data instanceof ArrayBuffer)) {
      if (data.type === 'file_start') {
        currentFileId = data.fileId || '';
        fileMeta = {
          filename: data.filename,
          mimeType: data.mimeType || 'application/octet-stream',
          size: data.size,
          encrypted: data.encrypted,
          fromNick: data.fromNick || '?',
        };
        fileBuffer = [];
        if (dispatch && fileMeta.size) {
          dispatch({
            type: 'file/progress',
            payload: {
              filename: fileMeta.filename,
              bytesReceived: 0,
              total: fileMeta.size,
              speedKbps: 0,
              fileId: currentFileId,
              nick: fileMeta.fromNick,
            },
          });
        }
        return;
      }
      if (data.type === 'file_end' && fileMeta) {
        const blob = new Blob(fileBuffer, { type: fileMeta.mimeType });
        fileBuffer = [];
        dispatch?.({
          type: 'file/received',
          payload: {
            filename: fileMeta.filename,
            blob,
            mimeType: fileMeta.mimeType,
            fileId: currentFileId,
            fromNick: fileMeta.fromNick,
          },
        });
        fileMeta = null;
        currentFileId = '';
        return;
      }
      if (data.type === 'file_chunk' && data.chunk) {
        const binary = Uint8Array.from(atob(data.chunk), (c) => c.charCodeAt(0));
        chunkQueue.push(binary.buffer);
        processChunkQueue();
        return;
      }
    }
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      chunkQueue.push(data);
      processChunkQueue();
    }
  };
}

export async function sendFileToViewers(protoo, file, onProgress, roomId = '', password = '', fromNick = '', fileId = '') {
  const filename = file.name || 'download';
  const mimeType = file.type || 'application/octet-stream';
  await notifyEasymeet(protoo, {
    type: 'file_start',
    fileId,
    filename,
    size: file.size,
    mimeType,
    encrypted: !!(password && roomId),
    fromNick,
  });
  const buffer = await file.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
  let key = null;
  if (password && roomId) key = await cryptoUtil.deriveKey(password, roomId);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
    let chunk = buffer.slice(start, end);
    if (key) chunk = await cryptoUtil.encrypt(chunk, key);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(chunk)));
    await notifyEasymeet(protoo, { type: 'file_chunk', chunk: b64 });
    if (onProgress) onProgress({ bytesSent: end, total: buffer.byteLength });
    if (i < totalChunks - 1) await sleep(CHUNK_DELAY_MS);
  }
  await notifyEasymeet(protoo, { type: 'file_end', filename });
}

/* ---------- setupRoomParticipant ---------- */

export async function setupRoomParticipant(peerObj, nick, localStream, callbacks = {}) {
  const {
    dispatch,
    roomId = '',
    password = '',
    getLocalStream,
    getLocalBackgroundEffect,
    getMuted,
  } = callbacks;

  const peerId = peerObj.id;
  const url = getProtooUrl(roomId, peerId);
  msLog('setupRoomParticipant', { roomId: roomId || '(leer!)', peerId, nick });
  if (!roomId || String(roomId).trim() === '') {
    msWarn('roomId fehlt — Protoo/Join schlägt am Server fehl. Prüfe State nach create/join API.');
  }
  const transport = new WebSocketTransport(url);
  const protoo = new ProtooPeer(transport);

  const producers = new Map();
  const consumers = new Map();
  const peerStreams = new Map();
  /** Ein MediaStream pro Peer für Screen-Share (Video+Audio), vgl. Demo streamId „…-screensharing“ */
  const peerScreenStreams = new Map();
  let screenProducers = [];
  const fileHandler = dispatch ? createFileDataHandler(dispatch, roomId, password) : null;
  let membersRef = [];

  function getMemberNick(pid) {
    const m = membersRef.find((x) => x.peerId === pid);
    return m?.nick ?? '?';
  }

  /** @type {import('mediasoup-client').Device | null} */
  let device = null;
  let sendTransport = null;
  let recvTransport = null;

  /** Wie mediasoup-demo RoomClient: AwaitQueue für newConsumer */
  const consumingAwaitQueue = new AwaitQueue();

  function handleEasymeetPayload(msg) {
    if (!msg?.type) return;
    switch (msg.type) {
      case 'new_peer': {
        if (msg.peerId === peerId) break;
        const exists = membersRef.some((m) => m.peerId === msg.peerId);
        if (!exists) {
          membersRef.push({ peerId: msg.peerId, nick: msg.nick ?? '?' });
          dispatch?.({ type: 'voip/membersUpdated', payload: { members: [...membersRef] } });
          dispatch?.({ type: 'room/memberJoined', payload: { peerId: msg.peerId, nick: msg.nick ?? '?' } });
          dispatch?.({ type: 'chat/messageReceived', payload: { type: 'join', nick: msg.nick, peerId: msg.peerId } });
        } else {
          if (msg.nick) {
            const row = membersRef.find((m) => m.peerId === msg.peerId);
            if (row) row.nick = msg.nick;
            dispatch?.({ type: 'voip/membersUpdated', payload: { members: [...membersRef] } });
          }
        }
        if (msg.videoEnabled !== undefined) {
          dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: msg.peerId, isVideoEnabled: msg.videoEnabled } });
        }
        if (msg.backgroundEffect !== undefined) {
          dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: msg.peerId, effect: msg.backgroundEffect } });
        }
        if (msg.muted !== undefined) {
          dispatch?.({ type: 'voip/muteReceived', payload: { peerId: msg.peerId, isMuted: msg.muted } });
        }
        break;
      }
      case 'peer_left': {
        if (msg.peerId === peerId) break;
        membersRef = membersRef.filter((m) => m.peerId !== msg.peerId);
        dispatch?.({ type: 'voip/membersUpdated', payload: { members: [...membersRef] } });
        dispatch?.({ type: 'room/leave', payload: { peerId: msg.peerId } });
        dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId: msg.peerId } });
        dispatch?.({ type: 'chat/messageReceived', payload: { type: 'leave', nick: msg.nick ?? '?', peerId: msg.peerId } });
        peerStreams.delete(msg.peerId);
        peerScreenStreams.delete(msg.peerId);
        break;
      }
      case 'members_updated':
        membersRef = msg.members || [];
        dispatch?.({ type: 'voip/membersUpdated', payload: { members: membersRef } });
        dispatch?.({
          type: 'chat/membersUpdated',
          payload: { list: membersRef.map((m) => m.nick).filter(Boolean) },
        });
        membersRef.forEach((m) => {
          if (m.videoEnabled !== undefined) {
            dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: m.peerId, isVideoEnabled: m.videoEnabled } });
          }
          if (m.backgroundEffect !== undefined) {
            dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: m.peerId, effect: m.backgroundEffect } });
          }
          if (m.muted !== undefined) {
            dispatch?.({ type: 'voip/muteReceived', payload: { peerId: m.peerId, isMuted: m.muted } });
          }
        });
        break;
      case 'chat':
        dispatch?.({
          type: 'chat/messageReceived',
          payload: { type: 'chat', nick: msg.nick, text: msg.text, ts: msg.ts, giphyUrls: msg.giphyUrls || [] },
        });
        break;
      case 'file_share':
        dispatch?.({
          type: 'chat/messageReceived',
          payload: { type: 'file_share', nick: msg.nick, filename: msg.filename, ts: msg.ts, fileId: msg.fileId },
        });
        break;
      case 'mute':
        dispatch?.({ type: 'voip/muteReceived', payload: { peerId: msg.peerId, isMuted: msg.muted } });
        break;
      case 'video':
        dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: msg.peerId, isVideoEnabled: msg.videoEnabled } });
        break;
      case 'background_effect':
        dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: msg.peerId, effect: msg.effect } });
        break;
      case 'screen_sharing_stopped':
        dispatch?.({ type: 'voip/screenStreamStopped', payload: { peerId: msg.peerId } });
        break;
      case 'file_start':
      case 'file_end':
      case 'file_chunk':
        fileHandler?.(msg);
        break;
      default:
        break;
    }
  }

  protoo.on('request', async (request, accept, reject) => {
    if (request.method !== 'newConsumer') {
      reject(403, `unknown request ${request.method}`);
      return;
    }

    try {
      await consumingAwaitQueue.push(async () => {
        if (!recvTransport) {
          throw new Error('recvTransport not ready');
        }
        const data = request.data || {};
        const {
          peerId: remotePeerId,
          consumerId,
          producerId,
          kind,
          rtpParameters,
          appData = {},
        } = data;

        if (!consumerId || !producerId || !kind || !rtpParameters) {
          throw new Error(`newConsumer: ungültige Daten ${JSON.stringify(Object.keys(data))}`);
        }

        const src = appData?.source || 'audio';
        const streamSuffix = isScreenShareSource(src) ? 'screensharing' : 'audio-video';

        const consumer = await recvTransport.consume({
          id: consumerId,
          producerId,
          kind,
          rtpParameters,
          streamId: `${remotePeerId}-${streamSuffix}`,
          appData: { ...appData, peerId: remotePeerId },
        });

        consumers.set(consumer.id, { consumer, peerId: remotePeerId, source: src });

        consumer.on('transportclose', () => consumers.delete(consumer.id));

        if (isScreenShareSource(src)) {
          let screenStream = peerScreenStreams.get(remotePeerId);
          if (!screenStream) {
            screenStream = new MediaStream();
            peerScreenStreams.set(remotePeerId, screenStream);
          }
          screenStream.addTrack(consumer.track);
          dispatch?.({
            type: 'voip/screenStreamStarted',
            payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: screenStream },
          });
        } else {
          let peerStream = peerStreams.get(remotePeerId);
          if (!peerStream) {
            peerStream = new MediaStream();
            peerStreams.set(remotePeerId, peerStream);
          }
          peerStream.addTrack(consumer.track);

          if (kind === 'video' && isWebcamVideoSource(src)) {
            dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: remotePeerId, isVideoEnabled: true } });
          }

          dispatch?.({
            type: 'voip/remoteStreamAdded',
            payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: peerStream },
          });

          const t = consumer.track;
          if (t && t.kind === 'video') {
            const redispatch = () => {
              const ps = peerStreams.get(remotePeerId);
              if (ps) {
                dispatch?.({
                  type: 'voip/remoteStreamAdded',
                  payload: { peerId: remotePeerId, nick: getMemberNick(remotePeerId), stream: ps },
                });
              }
            };
            t.addEventListener('unmute', redispatch, { once: true });
            t.addEventListener('ended', () => t.removeEventListener('unmute', redispatch), { once: true });
          }
        }

        accept();
        msLog('newConsumer ok', { remotePeerId, kind, source: src, consumerId });
        /* Server resumed den Consumer nach accept — lokal Track sicher aktivieren */
        try {
          if (consumer.paused) consumer.resume();
          if (consumer.track) consumer.track.enabled = true;
        } catch (e) {
          console.warn('consumer local resume nach newConsumer', e);
        }
        /* Optional: Demo sendet notify — darf lokales resume nicht blockieren */
        protoo.notify('resumeConsumer', { consumerId: consumer.id }).catch((e) => {
          msWarn('resumeConsumer notify (optional):', e?.message || e);
        });
      });
    } catch (err) {
      console.error('[easymeet/ms] newConsumer failed', err);
      try {
        reject(err instanceof Error ? err : new Error(String(err)));
      } catch (_) {}
    }
  });

  protoo.on('notification', (notification) => {
    const { method, data } = notification;
    if (method === 'easymeet') {
      handleEasymeetPayload(data);
      return;
    }
    if (method === 'newPeer' && data?.peer) {
      const p = data.peer;
      if (!membersRef.some((m) => m.peerId === p.peerId)) {
        handleEasymeetPayload({
          type: 'new_peer',
          peerId: p.peerId,
          nick: p.displayName ?? '?',
        });
      }
      return;
    }
    if (method === 'peerClosed' && data?.peerId) {
      handleEasymeetPayload({
        type: 'peer_left',
        peerId: data.peerId,
        nick: getMemberNick(data.peerId),
      });
      return;
    }
    if (method === 'consumerClosed' && data?.consumerId) {
      const info = consumers.get(data.consumerId);
      if (info) {
        const wasVideo = info.consumer.kind === 'video' && isWebcamVideoSource(info.source);
        info.consumer.close();
        consumers.delete(data.consumerId);
        const srcPeerId = info.peerId;
        if (isScreenShareSource(info.source)) {
          const ss = peerScreenStreams.get(srcPeerId);
          if (ss) {
            ss.removeTrack(info.consumer.track);
            if (ss.getTracks().length === 0) peerScreenStreams.delete(srcPeerId);
          }
          if (!peerScreenStreams.has(srcPeerId)) {
            dispatch?.({ type: 'voip/screenStreamStopped', payload: { peerId: srcPeerId } });
          } else {
            dispatch?.({
              type: 'voip/screenStreamStarted',
              payload: { peerId: srcPeerId, nick: getMemberNick(srcPeerId), stream: peerScreenStreams.get(srcPeerId) },
            });
          }
        } else {
          if (wasVideo) {
            dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: srcPeerId, isVideoEnabled: false } });
          }
          const peerStream = peerStreams.get(srcPeerId);
          if (peerStream) {
            peerStream.removeTrack(info.consumer.track);
            if (peerStream.getTracks().length === 0) {
              peerStreams.delete(srcPeerId);
              dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId: srcPeerId } });
            }
          }
        }
      }
    }
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn) => {
      if (settled) return;
      settled = true;
      fn();
    };
    protoo.on('open', () => {
      done(() => {
        msLog('Protoo-Socket offen (Subprotokoll protoo)');
        resolve();
      });
    });
    protoo.on('failed', (attempt) => {
      done(() => {
        msWarn(
          'Protoo WebSocket fehlgeschlagen nach Retries. Versuch:',
          attempt,
          '| URL:',
          url,
          '| Läuft der Server? (npm run server / dev:all). Dev: Port',
          import.meta.env.VITE_MEDIASOUP_PROTOO_PORT || '3001'
        );
        reject(new Error(`protoo WebSocket failed (attempt ${attempt})`));
      });
    });
    protoo.on('close', () => {
      done(() => reject(new Error('protoo closed before open')));
    });
  });

  let produceRetryTimer = null;
  let produceRetryCount = 0;
  const MAX_PRODUCE_RETRIES = 60;
  let lastProduceLogSig = '';

  function clearProduceRetryTimer() {
    if (produceRetryTimer != null) {
      clearTimeout(produceRetryTimer);
      produceRetryTimer = null;
    }
  }

  try {
    const { routerRtpCapabilities } = await protoo.request('getRouterRtpCapabilities');

    device = await mediasoupClient.Device.factory({});
    await device.load({
      routerRtpCapabilities,
      preferLocalCodecsOrder: true,
    });
    msLog('mediasoup Device geladen', { handler: device.handlerName });

    /**
     * Wie mediasoup-demo RoomClient._joinRoom(): kurzer Mic-Zugriff (Track stumm) entsperrt
     * Autoplay für Remote-Audio/Video in Chromium/Safari — sonst oft schwarze Kachel / kein Ton.
     */
    try {
      const unlockStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const unlockTrack = unlockStream.getAudioTracks()[0];
      if (unlockTrack) {
        unlockTrack.enabled = false;
        setTimeout(() => {
          try {
            unlockTrack.stop();
          } catch (_) {}
        }, 120000);
      }
    } catch (e) {
      console.warn('[easymeet] Autoplay-Unlock (optional):', e?.message || e);
    }

    sendTransport = await createSendTransport(protoo, device);
    recvTransport = await createRecvTransport(protoo, device);
    msLog('WebRtcTransports erstellt', { send: sendTransport?.id, recv: recvTransport?.id });

    recvTransport.on('connectionstatechange', (cs) => {
      msLog('recvTransport connectionState:', cs);
      if (cs === 'failed' || cs === 'disconnected') {
        msWarn(
          'Empfangs-Transport getrennt/fehlgeschlagen — oft ICE/announcedIp. Lokal testen: MEDIASOUP_ANNOUNCED_IP=127.0.0.1'
        );
      }
    });
    sendTransport.on('connectionstatechange', (cs) => {
      msLog('sendTransport connectionState:', cs);
    });

    const getStream = typeof getLocalStream === 'function'
      ? getLocalStream
      : (typeof localStream === 'function' ? localStream : () => localStream);

    const videoEnabled = getStream()?.getVideoTracks?.().some((t) => t.enabled) ?? false;
    const backgroundEffect = getLocalBackgroundEffect?.() ?? 'none';
    /** Wie initialState.isMuted (false): ohne Callback nicht fälschlich „stumm“ signalisieren */
    const muted = getMuted?.() ?? false;

    const { peers } = await protoo.request('join', {
      displayName: nick,
      device: { flag: 'easymeet', name: 'Easymeet' },
      rtpCapabilities: device.rtpCapabilities,
      sctpCapabilities: undefined,
      easymeet: { muted, videoEnabled, backgroundEffect },
    });

    membersRef = [
      { peerId, nick },
      ...(peers || []).map((p) => ({ peerId: p.peerId, nick: p.displayName ?? '?' })),
    ];
    dispatch?.({ type: 'voip/membersUpdated', payload: { members: [...membersRef] } });
    dispatch?.({
      type: 'chat/membersUpdated',
      payload: { list: membersRef.map((m) => m.nick).filter(Boolean) },
    });

    function trackUsable(t) {
      return t && t.readyState !== 'ended';
    }

    async function produceLocalTracks() {
      const stream = getStream();
      if (!stream) return;
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      if (trackUsable(audioTrack) && !producers.has('mic')) {
        try {
          const p = await produceDemoMic(sendTransport, audioTrack);
          if (p) producers.set('mic', p);
        } catch (e) {
          console.error('[easymeet/mediasoup] Audio-Produce fehlgeschlagen:', e?.message || e);
        }
      }
      if (trackUsable(videoTrack) && !producers.has('cam')) {
        try {
          const p = await produceDemoWebcam(sendTransport, videoTrack);
          if (p) producers.set('cam', p);
        } catch (e) {
          console.error('[easymeet/mediasoup] Video-Produce fehlgeschlagen:', e?.message || e);
        }
      }
      const logSig = [
        producers.has('mic'),
        producers.has('cam'),
        !!trackUsable(stream.getAudioTracks()[0]),
        !!trackUsable(stream.getVideoTracks()[0]),
      ].join('|');
      if (logSig !== lastProduceLogSig) {
        lastProduceLogSig = logSig;
        msLog('produceLocalTracks', {
          hatMicProducer: producers.has('mic'),
          hatCamProducer: producers.has('cam'),
          streamAudio: !!trackUsable(stream.getAudioTracks()[0]),
          streamVideo: !!trackUsable(stream.getVideoTracks()[0]),
        });
      }
    }

    function scheduleProduceRetry() {
      clearProduceRetryTimer();
      produceRetryTimer = setTimeout(async () => {
        produceRetryTimer = null;
        if (protoo.closed) return;
        produceRetryCount++;
        if (produceRetryCount > MAX_PRODUCE_RETRIES) return;
        try {
          await produceLocalTracks();
        } catch (e) {
          console.warn('[easymeet/mediasoup] produce retry:', e?.message || e);
        }
        const stream = getStream();
        const liveA = stream?.getAudioTracks?.()?.some((t) => t.readyState === 'live');
        const liveV = stream?.getVideoTracks?.()?.some((t) => t.readyState === 'live');
        const missingForTracks =
          (liveA && !producers.has('mic')) || (liveV && !producers.has('cam'));
        const stillNoTracks = !liveA && !liveV;
        if (missingForTracks || stillNoTracks) scheduleProduceRetry();
      }, 500);
    }

    await produceLocalTracks();
    scheduleProduceRetry();
  } catch (setupErr) {
    try {
      sendTransport?.close();
      recvTransport?.close();
    } catch (_) {}
    try {
      if (!protoo.closed) protoo.close();
    } catch (_) {}
    throw setupErr;
  }

  async function closeProducerById(producerId) {
    if (protoo.closed) return;
    await protoo.notify('closeProducer', { producerId });
  }

  function sendChat(nickName, text, ts, giphyUrlOrUrls) {
    const giphyUrls = Array.isArray(giphyUrlOrUrls) ? giphyUrlOrUrls : (giphyUrlOrUrls ? [giphyUrlOrUrls] : []);
    notifyEasymeet(protoo, { type: 'chat', nick: nickName, text, ts, giphyUrls });
    dispatch?.({ type: 'chat/messageReceived', payload: { type: 'chat', nick: nickName, text, ts, giphyUrls } });
  }

  async function setScreenStream(stream) {
    if (stream) {
      notifyEasymeet(protoo, { type: 'screen_stream', peerId, nick });
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack) {
        const p = await produceDemoScreenTrack(sendTransport, videoTrack);
        if (p) {
          screenProducers.push(p);
          producers.set('screen_video', p);
        }
      }
      if (audioTrack) {
        const p = await produceDemoScreenTrack(sendTransport, audioTrack);
        if (p) {
          screenProducers.push(p);
          producers.set('screen_audio', p);
        }
      }
    }
  }

  function clearScreenStream() {
    screenProducers.forEach((p) => {
      closeProducerById(p.id);
      p.close();
    });
    screenProducers = [];
    producers.delete('screen_video');
    producers.delete('screen_audio');
  }

  function broadcastScreenSharing(pid, nickName) {
    notifyEasymeet(protoo, { type: 'screen_stream', peerId: pid, nick: nickName });
  }

  function broadcastScreenSharingStopped(pid) {
    notifyEasymeet(protoo, { type: 'screen_sharing_stopped', peerId: pid });
  }

  function broadcastFileShare(nickName, filename, ts, fileId) {
    notifyEasymeet(protoo, { type: 'file_share', nick: nickName, filename, ts, fileId });
    dispatch?.({ type: 'chat/messageReceived', payload: { type: 'file_share', nick: nickName, filename, ts, fileId } });
  }

  function broadcastMute(pid, mutedState) {
    notifyEasymeet(protoo, { type: 'mute', muted: mutedState });
    dispatch?.({ type: 'voip/muteReceived', payload: { peerId: pid, isMuted: mutedState } });
  }

  function broadcastVideo(pid, videoEnabledState) {
    notifyEasymeet(protoo, { type: 'video', videoEnabled: videoEnabledState });
    dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: pid, isVideoEnabled: videoEnabledState } });
  }

  function broadcastBackgroundEffect(pid, effect) {
    notifyEasymeet(protoo, { type: 'background_effect', effect: effect || 'none' });
    dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: pid, effect: effect || 'none' } });
  }

  let _updateLock = false;
  let _pendingStream = null;

  async function updateLocalStream(newStream) {
    if (!newStream) return;
    if (_updateLock) {
      _pendingStream = newStream;
      return;
    }
    _updateLock = true;
    try {
      await _doUpdateLocalStream(newStream);
    } finally {
      _updateLock = false;
      if (_pendingStream) {
        const next = _pendingStream;
        _pendingStream = null;
        await updateLocalStream(next);
      }
    }
  }

  async function _doUpdateLocalStream(newStream) {
    try {
      const newAudioTrack = newStream.getAudioTracks?.()?.[0] ?? null;
      const newVideoTrack = newStream.getVideoTracks?.()?.[0] ?? null;
      const micProducer = producers.get('mic');
      const camProducer = producers.get('cam');
      if (micProducer && newAudioTrack) {
        try {
          await micProducer.replaceTrack({ track: newAudioTrack });
        } catch (re) {
          console.warn('[easymeet/mediasoup] replaceTrack(Mic) fehlgeschlagen, Producer neu:', re?.message || re);
          await closeProducerById(micProducer.id);
          micProducer.close();
          producers.delete('mic');
          const p = await produceDemoMic(sendTransport, newAudioTrack);
          if (p) producers.set('mic', p);
        }
      } else if (!micProducer && newAudioTrack) {
        const p = await produceDemoMic(sendTransport, newAudioTrack);
        if (p) producers.set('mic', p);
      } else if (micProducer && !newAudioTrack) {
        await closeProducerById(micProducer.id);
        micProducer.close();
        producers.delete('mic');
      }
      if (camProducer && newVideoTrack) {
        try {
          await camProducer.replaceTrack({ track: newVideoTrack });
        } catch (re) {
          console.warn('[easymeet/mediasoup] replaceTrack(Cam) fehlgeschlagen, Producer neu:', re?.message || re);
          await closeProducerById(camProducer.id);
          camProducer.close();
          producers.delete('cam');
          const p = await produceDemoWebcam(sendTransport, newVideoTrack);
          if (p) producers.set('cam', p);
        }
      } else if (!camProducer && newVideoTrack) {
        const p = await produceDemoWebcam(sendTransport, newVideoTrack);
        if (p) producers.set('cam', p);
      } else if (camProducer && !newVideoTrack) {
        await closeProducerById(camProducer.id);
        camProducer.close();
        producers.delete('cam');
      }
    } catch (e) {
      console.error('updateLocalStream (mediasoup):', e);
      throw e;
    }
  }

  function close() {
    clearProduceRetryTimer();
    consumers.forEach((info) => info.consumer.close());
    consumers.clear();
    producers.forEach((p) => p.close());
    producers.clear();
    sendTransport?.close();
    recvTransport?.close();
    peerStreams.clear();
    peerScreenStreams.clear();
    screenProducers = [];
    if (!protoo.closed) protoo.close();
  }

  function sendMute(mutedState) {
    notifyEasymeet(protoo, { type: 'mute', muted: mutedState });
  }

  function sendVideo(videoEnabledState) {
    notifyEasymeet(protoo, { type: 'video', videoEnabled: videoEnabledState });
  }

  function sendBackgroundEffect(effect) {
    notifyEasymeet(protoo, { type: 'background_effect', effect: effect || 'none' });
  }

  function sendFileShare(fileId, filename, ts) {
    notifyEasymeet(protoo, { type: 'file_share', nick, filename, ts, fileId });
  }

  const wsShim = {
    get readyState() {
      return protoo.closed ? 3 : 1;
    },
    close: () => close(),
    send: () => {},
    OPEN: 1,
    CLOSED: 3,
  };

  return {
    sendChat,
    setScreenStream,
    clearScreenStream,
    broadcastScreenSharing,
    broadcastScreenSharingStopped,
    broadcastFileShare,
    broadcastMute,
    broadcastVideo,
    broadcastBackgroundEffect,
    updateLocalStream,
    close,

    conn: {
      get open() {
        return protoo.connected && !protoo.closed;
      },
      send: (msg) => {
        if (msg?.type) notifyEasymeet(protoo, msg);
      },
      close: () => close(),
      on: () => {},
    },
    sendMute,
    sendVideo,
    sendBackgroundEffect,
    sendFileShare,

    ws: wsShim,
    peerId,
    protoo,
    sendWs: (data) => {
      if (data?.type) notifyEasymeet(protoo, data);
    },
    sendFileToRoom: (file, onProgress, fromNick, fileId) =>
      sendFileToViewers(protoo, file, onProgress, roomId, password, fromNick, fileId),
  };
}
