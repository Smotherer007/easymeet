/**
 * Handlers for host peer data events (rule: ≤20 lines per function)
 */

function isDisplayMediaStream(stream) {
  const videoTrack = stream?.getVideoTracks?.()[0];
  if (!videoTrack) return false;
  const displaySurface = videoTrack.getSettings?.()?.displaySurface;
  return displaySurface === 'monitor' || displaySurface === 'window' || displaySurface === 'browser';
}

function handleHostIncomingScreenStream(ctx, call, remoteStream, remotePeerId) {
  const { connections, screenCalls, viewerScreenCalls, sendTo, peer, sdpTransformFn, setVideoBitrate, dispatch } = ctx;
  const entry = connections.get(remotePeerId);
  const nick = entry?.nick ?? '?';
  connections.forEach(({ conn }, peerId) => {
    if (peerId === remotePeerId) return;
    try {
      if (!screenCalls.has(peerId)) screenCalls.set(peerId, new Map());
      const sourceMap = screenCalls.get(peerId);
      const existing = sourceMap.get(remotePeerId);
      if (existing) { existing.close(); sourceMap.delete(remotePeerId); }
      sendTo(conn, { type: 'screen_stream', peerId: remotePeerId, nick });
      const viewerSc = peer.call(peerId, remoteStream, { sdpTransform: sdpTransformFn });
      viewerSc.on('close', () => {
        sourceMap.delete(remotePeerId);
        if (sourceMap.size === 0) screenCalls.delete(peerId);
      });
      [100, 400, 1000].forEach((ms) => setTimeout(() => setVideoBitrate(viewerSc), ms));
      sourceMap.set(remotePeerId, viewerSc);
    } catch (_) {}
  });
  viewerScreenCalls.set(remotePeerId, call);
}

export function createHostCallHandlers(ctx) {
  const { viewerScreenStreamQueue, viewerScreenStreams, voiceCalls, closeScreenCallsForSource, recreatingPeers, makeVoiceCloseHandler, dispatch, connections } = ctx;
  return {
    onStream(call, remoteStream) {
      const remotePeerId = call.peer;
      const meta = viewerScreenStreamQueue.shift();
      const hasPendingScreen = !!meta;
      const isScreenStream = hasPendingScreen || (remoteStream?.getVideoTracks?.().length > 0 && isDisplayMediaStream(remoteStream));
      const entry = connections.get(remotePeerId);
      const nick = entry?.nick ?? '?';
      if (isScreenStream) {
        viewerScreenStreams.set(remotePeerId, remoteStream);
        dispatch?.({ type: 'voip/screenStreamStarted', payload: { peerId: remotePeerId, nick, stream: remoteStream } });
        try {
          handleHostIncomingScreenStream(ctx, call, remoteStream, remotePeerId);
        } catch (_) {}
      } else {
        dispatch?.({ type: 'voip/remoteStreamAdded', payload: { peerId: remotePeerId, nick, stream: remoteStream } });
        voiceCalls.set(remotePeerId, call);
      }
      return isScreenStream;
    },
    onClose(remotePeerId, isScreenCall) {
      if (isScreenCall) {
        closeScreenCallsForSource(remotePeerId);
        dispatch?.({ type: 'voip/screenStreamStopped', payload: { peerId: remotePeerId } });
      } else {
        voiceCalls.delete(remotePeerId);
        if (!recreatingPeers.has(remotePeerId)) dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId: remotePeerId } });
        recreatingPeers.delete(remotePeerId);
      }
    },
  };
}

function handleHostJoin(ctx, conn, data) {
  const { connections, dispatch, broadcast, sendTo, hostNick } = ctx;

  connections.set(conn.peer, { conn, nick: data.nick });
  if (data.videoEnabled !== undefined) dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: conn.peer, isVideoEnabled: data.videoEnabled } });
  if (data.backgroundEffect !== undefined) dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: conn.peer, effect: data.backgroundEffect } });
  if (data.muted !== undefined) dispatch?.({ type: 'voip/muteReceived', payload: { peerId: conn.peer, isMuted: data.muted } });

  if (dispatch) {
    dispatch({ type: 'chat/messageReceived', payload: { type: 'join', nick: data.nick, peerId: conn.peer } });
    dispatch({ type: 'room/join', payload: { peerId: conn.peer, nick: data.nick, viewerCount: connections.size } });
  }
  broadcast({ type: 'join', nick: data.nick, peerId: conn.peer });
  const membersList = [hostNick, ...Array.from(connections.values()).map((c) => c.nick).filter(Boolean)];
  sendTo(conn, { type: 'members', list: membersList });
  handleHostJoinSendPeers(ctx, conn, data);
}

function handleHostJoinSendPeers(ctx, conn, data) {
  const { peer, getStream, getMembersList, getAllPeerIds, getPeerVideoState, getPeerBackgroundEffect, getPeerMuteState } = ctx;
  const { sendTo, dispatch, broadcast, voiceCalls } = ctx;

  const membersWithVideo = getMembersList().map((m) => ({
    ...m,
    videoEnabled: m.peerId === peer.id ? (getStream()?.getVideoTracks?.().some((t) => t.enabled) ?? false) : getPeerVideoState?.(m.peerId),
    backgroundEffect: getPeerBackgroundEffect?.(m.peerId) ?? 'none',
    muted: getPeerMuteState?.(m.peerId) ?? false,
  }));
  sendTo(conn, { type: 'peers', list: getAllPeerIds(), members: membersWithVideo });
  if (dispatch) {
    dispatch({ type: 'voip/membersUpdated', payload: { members: getMembersList() } });
    dispatch({ type: 'room/memberJoined', payload: { peerId: conn.peer, nick: data.nick } });
  }
  broadcast({ type: 'new_peer', peerId: conn.peer, nick: data.nick, videoEnabled: data.videoEnabled, backgroundEffect: data.backgroundEffect ?? 'none', muted: data.muted ?? false }, conn.peer);
  handleHostJoinVoiceCall(ctx, conn, data);
}

function handleHostJoinVoiceCall(ctx, conn, data) {
  const { peer, getStream, voiceCalls, makeVoiceCloseHandler, dispatch } = ctx;

  const vc = peer.call(conn.peer, getStream());
  if (vc) {
    vc.on('stream', (remoteStream) => dispatch?.({ type: 'voip/remoteStreamAdded', payload: { peerId: conn.peer, nick: data.nick, stream: remoteStream } }));
    vc.on('close', makeVoiceCloseHandler(conn.peer));
    voiceCalls.set(conn.peer, vc);
  }
}

function handleHostJoinScreenStreams(ctx, conn) {
  const { peer, hostNick, getStream, screenStream, viewerScreenStreams, screenCalls, sendTo, sdpTransformFn, setVideoBitrate } = ctx;

  if (screenStream) {
    try {
      sendTo(conn, { type: 'screen_stream', peerId: peer.id, nick: hostNick });
      if (!screenCalls.has(conn.peer)) screenCalls.set(conn.peer, new Map());
      const sourceMap = screenCalls.get(conn.peer);
      const sc = peer.call(conn.peer, screenStream, { sdpTransform: sdpTransformFn });
      sc.on('close', () => {
        sourceMap.delete(peer.id);
        if (sourceMap.size === 0) screenCalls.delete(conn.peer);
      });
      [100, 400, 1000].forEach((ms) => setTimeout(() => setVideoBitrate(sc), ms));
      sourceMap.set(peer.id, sc);
    } catch (_) {}
  }
  viewerScreenStreams.forEach((stream, sourcePeerId) => handleHostJoinScreenStreamOne(ctx, conn, sourcePeerId, stream));
}

function handleHostJoinScreenStreamOne(ctx, conn, sourcePeerId, stream) {
  const { peer, connections, screenCalls, sendTo, sdpTransformFn, setVideoBitrate } = ctx;
  try {
    const srcEntry = connections.get(sourcePeerId);
    const srcNick = srcEntry?.nick ?? '?';
    sendTo(conn, { type: 'screen_stream', peerId: sourcePeerId, nick: srcNick });
    if (!screenCalls.has(conn.peer)) screenCalls.set(conn.peer, new Map());
    const sourceMap = screenCalls.get(conn.peer);
    const sc = peer.call(conn.peer, stream, { sdpTransform: sdpTransformFn });
    sc.on('close', () => {
      sourceMap.delete(sourcePeerId);
      if (sourceMap.size === 0) screenCalls.delete(conn.peer);
    });
    [100, 400, 1000].forEach((ms) => setTimeout(() => setVideoBitrate(sc), ms));
    sourceMap.set(sourcePeerId, sc);
  } catch (_) {}
}

function handleHostChat(ctx, conn, data) {
  const { connections, broadcast, dispatch } = ctx;
  const entry = connections.get(conn.peer);
  const nick = entry?.nick ?? '?';
  const msg = { type: 'chat', nick, text: data.text, ts: data.ts, giphyUrl: data.giphyUrl, giphyUrls: data.giphyUrls };
  broadcast(msg);
  dispatch?.({ type: 'chat/messageReceived', payload: msg });
}

function handleHostFileShare(ctx, conn, data) {
  const { connections, broadcast, dispatch } = ctx;
  const entry = connections.get(conn.peer);
  const nick = entry?.nick ?? '?';
  const msg = { type: 'file_share', nick, filename: data.filename, ts: data.ts, fileId: data.fileId };
  broadcast(msg);
  dispatch?.({ type: 'chat/messageReceived', payload: msg });
}

function handleHostMute(ctx, conn, data) {
  const { broadcast, dispatch } = ctx;
  broadcast({ type: 'mute', peerId: conn.peer, muted: data.muted });
  dispatch?.({ type: 'voip/muteReceived', payload: { peerId: conn.peer, isMuted: data.muted } });
}

function handleHostVideo(ctx, conn, data) {
  const { broadcast, dispatch } = ctx;
  broadcast({ type: 'video', peerId: conn.peer, videoEnabled: data.videoEnabled });
  dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: conn.peer, isVideoEnabled: data.videoEnabled } });
}

function handleHostBackgroundEffect(ctx, conn, data) {
  const { broadcast, dispatch } = ctx;
  broadcast({ type: 'background_effect', peerId: conn.peer, effect: data.effect });
  dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: conn.peer, effect: data.effect } });
}

function handleHostRecreating(ctx, conn) {
  const { recreatingPeers, broadcast } = ctx;
  recreatingPeers.add(conn.peer);
  broadcast({ type: 'recreating', peerId: conn.peer }, conn.peer);
}

function handleHostScreenStream(ctx, data, viewerScreenStreamQueue) {
  viewerScreenStreamQueue.push({ peerId: data.peerId, nick: data.nick ?? '?' });
}

function handleHostFileStart(ctx, conn, data) {
  const { hostFileHandler, broadcast } = ctx;
  if (hostFileHandler) hostFileHandler(data);
  broadcast(data, conn.peer);
}

function handleHostFileEnd(ctx, conn, data) {
  const { hostFileHandler, broadcast } = ctx;
  if (hostFileHandler) hostFileHandler(data);
  broadcast(data, conn.peer);
}

function getSenderByKindHost(pc, kind) {
  const t = pc.getTransceivers?.().find((tr) => tr.kind === kind);
  return t?.sender ?? pc.getSenders?.().find((s) => s.track?.kind === kind);
}

function checkHostNeedsRecreate(voiceCalls, newAudioTrack, newVideoTrack) {
  let needsRecreate = false;
  voiceCalls.forEach((call) => {
    const pc = call.peerConnection ?? call.connection?.peerConnection;
    if (!pc || pc.signalingState === 'closed') return;
    const videoSender = getSenderByKindHost(pc, 'video');
    const audioSender = getSenderByKindHost(pc, 'audio');
    if (newVideoTrack && !videoSender) needsRecreate = true;
    if (newAudioTrack && !audioSender) needsRecreate = true;
  });
  return needsRecreate;
}

function recreateHostVoiceCalls(ctx) {
  const { connections, voiceCalls, recreatingPeers, peer, getStream, makeVoiceCloseHandler, dispatch } = ctx;
  connections.forEach(({ conn, nick }, peerId) => {
    const vc = voiceCalls.get(peerId);
    if (vc) {
      recreatingPeers.add(peerId);
      vc.close();
      voiceCalls.delete(peerId);
    }
    const newCall = peer.call(peerId, getStream());
    if (newCall) {
      newCall.on('stream', (remoteStream) => dispatch?.({ type: 'voip/remoteStreamAdded', payload: { peerId, nick, stream: remoteStream } }));
      newCall.on('close', makeVoiceCloseHandler(peerId));
      voiceCalls.set(peerId, newCall);
    }
  });
}

function replaceHostTracks(voiceCalls, newAudioTrack, newVideoTrack, doRecreate) {
  voiceCalls.forEach((call) => {
    const pc = call.peerConnection ?? call.connection?.peerConnection;
    if (!pc || pc.signalingState === 'closed') return;
    if (newAudioTrack) {
      const audioSender = getSenderByKindHost(pc, 'audio');
      if (audioSender) audioSender.replaceTrack(newAudioTrack).catch(() => doRecreate());
    } else {
      const audioSender = getSenderByKindHost(pc, 'audio');
      if (audioSender) audioSender.replaceTrack(null).catch(() => {});
    }
    if (newVideoTrack) {
      const videoSender = getSenderByKindHost(pc, 'video');
      if (videoSender) videoSender.replaceTrack(newVideoTrack).catch(() => {});
    } else {
      const videoSender = getSenderByKindHost(pc, 'video');
      if (videoSender) videoSender.replaceTrack(null).catch(() => {});
    }
  });
}

export function createHostUpdateLocalStream(ctx) {
  return function updateLocalStream(newStream) {
    const { connections, voiceCalls, recreatingPeers, peer, getStream, makeVoiceCloseHandler, dispatch } = ctx;
    const newAudioTrack = newStream?.getAudioTracks?.()[0];
    const newVideoTrack = newStream?.getVideoTracks?.()[0];
    if (checkHostNeedsRecreate(voiceCalls, newAudioTrack, newVideoTrack)) {
      recreateHostVoiceCalls(ctx);
      return;
    }
    const doRecreate = () => {
      setTimeout(() => recreateHostVoiceCalls(ctx), 0);
    };
    replaceHostTracks(voiceCalls, newAudioTrack, newVideoTrack, doRecreate);
  };
}

export function createHostDataRouter(ctx) {
  return (conn, data, viewerScreenStreamQueue) => {
    if (data?.type === 'host_leaving') return;
    if (typeof data === 'object' && data !== null && !(data instanceof ArrayBuffer)) {
      if (data.type === 'join' && data.nick) {
        handleHostJoin(ctx, conn, data);
        handleHostJoinScreenStreams(ctx, conn);
        return;
      }
      if (data.type === 'chat') return handleHostChat(ctx, conn, data);
      if (data.type === 'file_share') return handleHostFileShare(ctx, conn, data);
      if (data.type === 'mute') return handleHostMute(ctx, conn, data);
      if (data.type === 'video') return handleHostVideo(ctx, conn, data);
      if (data.type === 'background_effect') return handleHostBackgroundEffect(ctx, conn, data);
      if (data.type === 'recreating') return handleHostRecreating(ctx, conn);
      if (data.type === 'screen_stream' && data.peerId) return handleHostScreenStream(ctx, data, viewerScreenStreamQueue);
      if (data.type === 'file_start') return handleHostFileStart(ctx, conn, data);
      if (data.type === 'file_end') return handleHostFileEnd(ctx, conn, data);
    }
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      if (ctx.hostFileHandler) ctx.hostFileHandler(data);
      ctx.broadcast(data, conn.peer);
    }
  };
}
