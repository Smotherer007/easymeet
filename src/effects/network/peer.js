import Peer from 'peerjs';
import * as sdp from 'sdp-transform';
import * as cryptoUtil from '../../utils/crypto.js';
import { createHostDataRouter, createHostUpdateLocalStream, createHostCallHandlers } from './peerHostHandlers.js';
import { createViewerDataRouter, createUpdateLocalStreamForViewer } from './peerViewerHandlers.js';

const CHUNK_SIZE = 16384;
const CHUNK_DELAY_MS = 30;
const VIDEO_BITRATE_KBPS = 25000;
const VIDEO_MAX_BITRATE = 25_000_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sdpTransformFn(sdpStr) {
  try {
    const parsed = sdp.parse(sdpStr);
    if (parsed.media) {
      let changed = false;
      parsed.media.forEach((m) => {
        if (m.type === 'video') {
          m.bandwidth = [{ type: 'AS', limit: VIDEO_BITRATE_KBPS }];
          changed = true;
        }
      });
      if (changed) return sdp.write(parsed);
    }
  } catch (_) {}
  return sdpStr;
}

function setVideoBitrate(call) {
  const pc = call?.peerConnection ?? call?.connection?.peerConnection;
  if (!pc?.getSenders) return;
  const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
  senders.forEach(async (sender) => {
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
      params.encodings[0].scaleResolutionDownBy = 1;
      await sender.setParameters(params);
    } catch (_) {}
  });
}

export function createPeer() {
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    peer.on('open', (id) => resolve({ peer, id }));
    peer.on('error', (err) => reject(err));
  });
}

export async function getUserMedia(inputDeviceId = null, requestVideo = true, videoDeviceId = null) {
  const videoOnly = requestVideo === 'videoOnly';
  const constraints = {
    audio: videoOnly ? false : {
      ...(inputDeviceId && inputDeviceId.length ? { deviceId: { exact: inputDeviceId } } : {}),
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: false,
    },
    video: requestVideo && requestVideo !== false
      ? {
          ...(videoDeviceId && videoDeviceId.length ? { deviceId: { ideal: videoDeviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 480 },
        }
      : false,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
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
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: true,
  });
  return stream;
}

/**
 * Host-Peer: kombiniert Chat, Files, Screen, VoIP
 */
export function setupHostPeer(peer, hostNick, localStream, callbacks = {}) {
  const {
    dispatch,
    getPeerVideoState,
    getPeerBackgroundEffect,
    getPeerMuteState,
    roomId = '',
    password = '',
  } = callbacks;

  const hostFileHandler = dispatch
    ? createFileDataHandler(dispatch, roomId, password)
    : null;

  const connections = new Map();
  const voiceCalls = new Map();
  const screenCalls = new Map();
  let screenStream = null;
  const viewerScreenStreams = new Map();
  const recreatingPeers = new Set();
  const getStream = typeof localStream === 'function' ? localStream : () => localStream;

  function isDisplayMediaStream(stream) {
    const videoTrack = stream?.getVideoTracks?.()[0];
    if (!videoTrack) return false;
    const displaySurface = videoTrack.getSettings?.()?.displaySurface;
    return displaySurface === 'monitor' || displaySurface === 'window' || displaySurface === 'browser';
  }

  function makeVoiceCloseHandler(peerId) {
    return () => {
      voiceCalls.delete(peerId);
      if (!recreatingPeers.has(peerId)) dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId } });
      recreatingPeers.delete(peerId);
    };
  }

  function broadcast(msg, excludePeerId = null) {
    connections.forEach(({ conn }, peerId) => {
      if (peerId === excludePeerId) return;
      try {
        if (conn.open) conn.send(msg);
      } catch (_) {}
    });
  }

  function sendTo(conn, msg) {
    try {
      if (conn?.open) conn.send(msg);
    } catch (_) {}
  }

  function sendToPeers(peerIds, msg, excludePeerId = null) {
    let sent = 0;
    peerIds.forEach((pid) => {
      if (pid === excludePeerId) return;
      let entry = connections.get(pid);
      if (!entry) {
        for (const [, e] of connections.entries()) {
          if (e?.conn?.peer === pid) {
            entry = e;
            break;
          }
        }
      }
      if (entry?.conn?.open) {
        sendTo(entry.conn, msg);
        sent++;
      }
    });
    return sent;
  }

  function getMembersList() {
    return [{ peerId: peer.id, nick: hostNick }].concat(
      Array.from(connections.values()).map((c) => ({ peerId: c.conn.peer, nick: c.nick }))
    );
  }

  function getAllPeerIds() {
    return [peer.id, ...Array.from(connections.keys())];
  }

  function closeScreenCallsForSource(sourcePeerId) {
    screenCalls.forEach((sourceMap, viewerPeerId) => {
      const c = sourceMap.get(sourcePeerId);
      if (c) {
        c.close();
        sourceMap.delete(sourcePeerId);
      }
      if (sourceMap.size === 0) screenCalls.delete(viewerPeerId);
    });
    viewerScreenCalls.delete(sourcePeerId);
    viewerScreenStreams.delete(sourcePeerId);
  }

  function removeViewer(peerId) {
    if (!connections.has(peerId)) return;
    const entry = connections.get(peerId);
    connections.delete(peerId);
    const vc = voiceCalls.get(peerId);
    if (vc) {
      vc.close();
      voiceCalls.delete(peerId);
    }
    const viewerSc = viewerScreenCalls.get(peerId);
    if (viewerSc) {
      viewerSc.close();
    }
    const sourceMap = screenCalls.get(peerId);
    if (sourceMap) {
      sourceMap.forEach((c) => c.close());
      screenCalls.delete(peerId);
    }
    closeScreenCallsForSource(peerId);
    if (dispatch) {
      dispatch({ type: 'room/leave', payload: { peerId } });
      dispatch({ type: 'voip/membersUpdated', payload: { members: getMembersList() } });
      dispatch({ type: 'voip/remoteStreamEnded', payload: { peerId } });
      dispatch({ type: 'chat/messageReceived', payload: { type: 'leave', nick: entry?.nick ?? '?', peerId } });
    }
    broadcast({ type: 'leave', nick: entry?.nick ?? '?', peerId });
  }

  const viewerScreenCalls = new Map();
  const viewerScreenStreamQueue = [];
  const hostCtx = {
    connections,
    voiceCalls,
    screenCalls,
    dispatch,
    peer,
    hostNick,
    getStream,
    getPeerVideoState,
    getPeerBackgroundEffect,
    getPeerMuteState,
    broadcast,
    sendTo,
    getMembersList,
    getAllPeerIds,
    closeScreenCallsForSource,
    recreatingPeers,
    makeVoiceCloseHandler,
    hostFileHandler,
    get screenStream() { return screenStream; },
    viewerScreenStreams,
    sdpTransformFn,
    setVideoBitrate,
    viewerScreenCalls,
    viewerScreenStreamQueue,
  };
  const hostDataRouter = createHostDataRouter(hostCtx);
  const updateLocalStream = createHostUpdateLocalStream(hostCtx);
  const hostCallHandlers = createHostCallHandlers(hostCtx);
  peer.on('call', (call) => {
    const remotePeerId = call.peer;
    call.answer(getStream());
    let isScreenCall = false;
    call.on('stream', (remoteStream) => {
      isScreenCall = hostCallHandlers.onStream(call, remoteStream);
    });
    call.on('close', () => hostCallHandlers.onClose(remotePeerId, isScreenCall));
  });

  peer.on('connection', (conn) => {
    conn.on('data', (data) => hostDataRouter(conn, data, viewerScreenStreamQueue));
    conn.on('close', () => removeViewer(conn.peer));
  });

  return {
    getConnections: () => connections,
    getViewerCount: () => connections.size,
    getMembers: (hostNickName) =>
      [hostNickName ?? hostNick, ...Array.from(connections.values()).map((c) => c.nick).filter(Boolean)],
    sendChat(nick, text, ts, giphyUrlOrUrls) {
      const giphyUrls = Array.isArray(giphyUrlOrUrls) ? giphyUrlOrUrls : (giphyUrlOrUrls ? [giphyUrlOrUrls] : []);
      const msg = { type: 'chat', nick, text, ts, giphyUrls };
      broadcast(msg);
      callbacks.dispatch?.({ type: 'chat/messageReceived', payload: msg });
    },
    setScreenStream(stream) {
      screenStream = stream;
      connections.forEach(({ conn }) => {
        try {
          if (stream) {
            sendTo(conn, { type: 'screen_stream', peerId: peer.id, nick: hostNick });
          }
          if (!screenCalls.has(conn.peer)) screenCalls.set(conn.peer, new Map());
          const sourceMap = screenCalls.get(conn.peer);
          const old = sourceMap.get(peer.id);
          if (old) { old.close(); sourceMap.delete(peer.id); }
          if (stream) {
            const sc = peer.call(conn.peer, stream, { sdpTransform: sdpTransformFn });
            sc.on('close', () => {
              sourceMap.delete(peer.id);
              if (sourceMap.size === 0) screenCalls.delete(conn.peer);
            });
            [100, 400, 1000].forEach((ms) => setTimeout(() => setVideoBitrate(sc), ms));
            sourceMap.set(peer.id, sc);
          }
        } catch (_) {}
      });
    },
    clearScreenStream() {
      screenStream = null;
      closeScreenCallsForSource(peer.id);
    },
    broadcastScreenSharing(peerId, nick) {
      broadcast({ type: 'screen_sharing', peerId, nick });
    },
    broadcastScreenSharingStopped(peerId) {
      broadcast({ type: 'screen_sharing_stopped', peerId });
    },
    broadcastFileShare(nick, filename, ts, fileId) {
      const msg = { type: 'file_share', nick, filename, ts, fileId };
      broadcast(msg);
      callbacks.dispatch?.({ type: 'chat/messageReceived', payload: msg });
    },
    broadcastMute(peerId, muted) {
      broadcast({ type: 'mute', peerId, muted });
      callbacks.dispatch?.({ type: 'voip/muteReceived', payload: { peerId, isMuted: muted } });
    },
    broadcastVideo(peerId, videoEnabled) {
      broadcast({ type: 'video', peerId, videoEnabled });
      callbacks.dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId, isVideoEnabled: videoEnabled } });
    },
    broadcastBackgroundEffect(peerId, effect) {
      broadcast({ type: 'background_effect', peerId, effect: effect || 'none' });
      callbacks.dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId, effect: effect || 'none' } });
    },
    updateLocalStream,
    broadcastHostLeaving() {
      connections.forEach(({ conn }) => {
        try {
          if (conn.open) conn.send({ type: 'host_leaving' });
        } catch (_) {}
      });
      voiceCalls.forEach((c) => c.close());
      voiceCalls.clear();
      screenCalls.forEach((sourceMap) => sourceMap.forEach((c) => c.close()));
      screenCalls.clear();
      viewerScreenCalls.forEach((c) => c.close());
      viewerScreenCalls.clear();
      viewerScreenStreams.clear();
    },
    close() {
      connections.forEach(({ conn }) => conn.close());
      connections.clear();
      voiceCalls.forEach((c) => c.close());
      voiceCalls.clear();
      screenCalls.forEach((sourceMap) => sourceMap.forEach((c) => c.close()));
      screenCalls.clear();
      viewerScreenCalls.forEach((c) => c.close());
      viewerScreenCalls.clear();
      viewerScreenStreams.clear();
    },
  };
}

/** Sends a file to connections */
export async function sendFileToViewers(connections, file, onProgress, roomId = '', password = '', fromNick = '', fileId = '') {
  const filename = file.name || 'download';
  const mimeType = file.type || 'application/octet-stream';
  const metadata = {
    type: 'file_start',
    fileId,
    filename,
    size: file.size,
    mimeType,
    encrypted: !!(password && roomId),
    fromNick,
  };
  const openConns = connections.filter((c) => c?.open);
  const sendToAll = async (data) => {
    for (const conn of openConns) {
      try {
        if (conn?.open) conn.send(data);
        if (openConns.length > 1) await sleep(5);
      } catch (_) {}
    }
  };
  await sendToAll(metadata);
  const buffer = await file.arrayBuffer();
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);
  let key = null;
  if (password && roomId) key = await cryptoUtil.deriveKey(password, roomId);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
    let chunk = buffer.slice(start, end);
    if (key) chunk = await cryptoUtil.encrypt(chunk, key);
    await sendToAll(chunk);
    if (onProgress) onProgress({ bytesSent: end, total: buffer.byteLength });
    if (i < totalChunks - 1) await sleep(CHUNK_DELAY_MS);
  }
  await sendToAll({ type: 'file_end', filename });
}

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
        dispatch({ type: 'file/progress', payload: { filename: fileMeta.filename, bytesReceived, total: fileMeta.size, speedKbps: 0, fileId: currentFileId, nick: fileMeta.fromNick } });
      }
    }
    chunkProcessing = false;
  }

  return (data) => {
    if (data?.type === 'host_leaving') return;
    if (typeof data === 'object' && data !== null && !(data instanceof ArrayBuffer)) {
      if (data.type === 'clipboard') return;
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
        if (dispatch && fileMeta.size) dispatch({ type: 'file/progress', payload: { filename: fileMeta.filename, bytesReceived: 0, total: fileMeta.size, speedKbps: 0, fileId: currentFileId, nick: fileMeta.fromNick } });
        return;
      }
      if (data.type === 'file_end' && fileMeta) {
        const blob = new Blob(fileBuffer, { type: fileMeta.mimeType });
        fileBuffer = [];
        dispatch?.({ type: 'file/received', payload: { filename: fileMeta.filename, blob, mimeType: fileMeta.mimeType, fileId: currentFileId, fromNick: fileMeta.fromNick } });
        fileMeta = null;
        currentFileId = '';
        return;
      }
    }
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      chunkQueue.push(data);
      processChunkQueue();
    }
  };
}

/**
 * Viewer peer: connects to host, receives chat, files, screen, voice
 */
export function setupViewerPeer(
  peer,
  hostPeerId,
  nick,
  callbacks = {}
) {
  const {
    dispatch,
  } = callbacks;

  const conn = peer.connect(hostPeerId);
  const voiceCalls = new Map();
  const recreatingPeers = new Set();
  const membersListRef = { current: [] };
  const getStream = () => (typeof callbacks.getLocalStream === 'function' ? callbacks.getLocalStream() : callbacks.localStream);

  function isDisplayMediaStream(stream) {
    const videoTrack = stream?.getVideoTracks?.()[0];
    if (!videoTrack) return false;
    const displaySurface = videoTrack.getSettings?.()?.displaySurface;
    return displaySurface === 'monitor' || displaySurface === 'window' || displaySurface === 'browser';
  }

  function makeVoiceCloseHandler(remotePeerId) {
    return () => {
      voiceCalls.delete(remotePeerId);
      if (!recreatingPeers.has(remotePeerId)) dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId: remotePeerId } });
      recreatingPeers.delete(remotePeerId);
    };
  }

  function callPeer(remotePeerId) {
    if (remotePeerId === peer.id || !getStream()) return;
    const call = peer.call(remotePeerId, getStream());
    if (!call) return;
    const m = membersListRef.current.find((x) => x.peerId === remotePeerId);
    const remoteNick = m?.nick ?? '?';
    call.on('stream', (remoteStream) => dispatch?.({ type: 'voip/remoteStreamAdded', payload: { peerId: remotePeerId, nick: remoteNick, stream: remoteStream } }));
    call.on('close', makeVoiceCloseHandler(remotePeerId));
    voiceCalls.set(remotePeerId, call);
  }

  const screenStreamQueue = [];
  const screenCalls = new Map();
  peer.on('call', (call) => {
    const remotePeerId = call.peer;
    const streamToSend = getStream();
    call.answer(streamToSend ?? new MediaStream());
    let isScreenCall = false;
    call.on('stream', (stream) => {
      const meta = screenStreamQueue.shift();
      const hasPendingScreen = !!meta;
      const isScreenStream = hasPendingScreen || (stream.getVideoTracks?.().length > 0 && isDisplayMediaStream(stream));
      if (isScreenStream) {
        isScreenCall = true;
        screenCalls.set(remotePeerId, call);
        dispatch?.({ type: 'voip/screenStreamStarted', payload: { peerId: meta?.peerId ?? remotePeerId, nick: meta?.nick, stream } });
      } else {
        const m = membersListRef.current.find((x) => x.peerId === remotePeerId);
        dispatch?.({ type: 'voip/remoteStreamAdded', payload: { peerId: remotePeerId, nick: m?.nick ?? '?', stream } });
        voiceCalls.set(remotePeerId, call);
      }
    });
    call.on('close', () => {
      if (isScreenCall) {
        screenCalls.delete(remotePeerId);
        dispatch?.({ type: 'voip/screenStreamStopped', payload: { peerId: remotePeerId } });
      } else {
        makeVoiceCloseHandler(remotePeerId)();
      }
    });
  });

  const fileHandler = dispatch
    ? createFileDataHandler(
        dispatch,
        callbacks.roomId || '',
        callbacks.password || ''
      )
    : null;

  const viewerCtx = {
    dispatch,
    membersListRef,
    callPeer,
    voiceCalls,
    recreatingPeers,
    conn,
    callbacks,
  };
  const viewerDataRouter = createViewerDataRouter(viewerCtx);
  const updateLocalStream = createUpdateLocalStreamForViewer(viewerCtx);

  conn.on('data', (data) => {
    if (data?.type === 'host_leaving') return;
    if (fileHandler && (data?.type === 'file_start' || data?.type === 'file_end' || data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
      fileHandler(data);
      return;
    }
    viewerDataRouter(data, screenStreamQueue);
  });

  return new Promise((resolve, reject) => {
    conn.on('open', () => {
      const stream = getStream();
      const videoEnabled = stream?.getVideoTracks?.().length > 0 && stream.getVideoTracks().some((t) => t.enabled);
      const backgroundEffect = callbacks.getLocalBackgroundEffect?.() ?? 'none';
      const muted = callbacks.getMuted?.() ?? true;
      conn.send({ type: 'join', nick, videoEnabled: !!videoEnabled, backgroundEffect, muted });
      resolve({
        conn,
        sendChat(nickName, text, ts, giphyUrlOrUrls) {
          const giphyUrls = Array.isArray(giphyUrlOrUrls) ? giphyUrlOrUrls : (giphyUrlOrUrls ? [giphyUrlOrUrls] : []);
          if (conn?.open) conn.send({ type: 'chat', nick: nickName, text, ts, giphyUrls });
        },
        sendFileShare(fileId, filename, ts) {
          if (conn?.open) conn.send({ type: 'file_share', nick, filename, ts, fileId });
        },
        sendMute(muted) {
          if (conn?.open) conn.send({ type: 'mute', muted });
        },
        sendVideo(videoEnabled) {
          if (conn?.open) conn.send({ type: 'video', videoEnabled });
        },
        sendBackgroundEffect(effect) {
          if (conn?.open) conn.send({ type: 'background_effect', effect: effect || 'none' });
        },
        updateLocalStream,
        close: () => {
          conn.close();
          voiceCalls.forEach((c) => c.close());
          voiceCalls.clear();
          screenCalls.forEach((c) => c.close());
          screenCalls.clear();
        },
      });
    });
    conn.on('error', () => reject(new Error('Verbindung zum Host fehlgeschlagen')));
  });
}
