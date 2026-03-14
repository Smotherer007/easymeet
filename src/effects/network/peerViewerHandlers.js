/**
 * Handlers for viewer peer data events (rule: ≤20 lines per function)
 */

function handleViewerMembers(ctx, data) {
  const { dispatch } = ctx;
  if (!Array.isArray(data.list)) return;
  dispatch?.({ type: 'chat/messageReceived', payload: { type: 'members', list: data.list } });
}

function handleViewerPeers(ctx, data) {
  const { dispatch, callPeer } = ctx;
  const members = data.members || [];
  ctx.membersListRef.current = members;
  (data.members || []).forEach((m) => {
    if (m.videoEnabled !== undefined) dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: m.peerId, isVideoEnabled: m.videoEnabled } });
    if (m.backgroundEffect !== undefined) dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: m.peerId, effect: m.backgroundEffect } });
    if (m.muted !== undefined) dispatch?.({ type: 'voip/muteReceived', payload: { peerId: m.peerId, isMuted: m.muted } });
  });
  dispatch?.({ type: 'voip/membersUpdated', payload: { members } });
  (data.list || []).forEach((pid) => callPeer(pid));
}

function handleViewerNewPeer(ctx, data) {
  const { dispatch, membersListRef, callPeer } = ctx;
  if (data.videoEnabled !== undefined) dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: data.peerId, isVideoEnabled: data.videoEnabled } });
  if (data.backgroundEffect !== undefined) dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: data.peerId, effect: data.backgroundEffect } });
  if (data.muted !== undefined) dispatch?.({ type: 'voip/muteReceived', payload: { peerId: data.peerId, isMuted: data.muted } });
  const list = membersListRef.current;
  const exists = list.some((m) => m.peerId === data.peerId);
  if (!exists) {
    list.push({ peerId: data.peerId, nick: data.nick ?? '?' });
    dispatch?.({ type: 'room/memberJoined', payload: { peerId: data.peerId, nick: data.nick ?? '?' } });
  } else {
    membersListRef.current = list.map((m) => (m.peerId === data.peerId ? { ...m, nick: data.nick ?? '?' } : m));
  }
  dispatch?.({ type: 'voip/membersUpdated', payload: { members: membersListRef.current } });
  callPeer(data.peerId);
}

function handleViewerLeave(ctx, data) {
  const { dispatch, voiceCalls, membersListRef } = ctx;
  membersListRef.current = membersListRef.current.filter((m) => m.peerId !== data.peerId);
  dispatch?.({ type: 'voip/membersUpdated', payload: { members: membersListRef.current } });
  dispatch?.({ type: 'room/leave', payload: { peerId: data.peerId } });
  const c = voiceCalls.get(data.peerId);
  if (c) {
    c.close();
    voiceCalls.delete(data.peerId);
  }
  dispatch?.({ type: 'voip/remoteStreamEnded', payload: { peerId: data.peerId } });
  dispatch?.({ type: 'chat/messageReceived', payload: data });
}

function handleViewerChatOrJoin(ctx, data) {
  ctx.dispatch?.({ type: 'chat/messageReceived', payload: data });
}

function handleViewerMute(ctx, data) {
  ctx.dispatch?.({ type: 'voip/muteReceived', payload: { peerId: data.peerId, isMuted: data.muted } });
}

function handleViewerVideo(ctx, data) {
  ctx.dispatch?.({ type: 'voip/videoStateUpdated', payload: { peerId: data.peerId, isVideoEnabled: data.videoEnabled } });
}

function handleViewerBackgroundEffect(ctx, data) {
  ctx.dispatch?.({ type: 'voip/backgroundEffectUpdated', payload: { peerId: data.peerId, effect: data.effect } });
}

function handleViewerScreenSharing(ctx, data) {
  if (data.peerId) ctx.dispatch?.({ type: 'voip/screenStreamStarted', payload: { peerId: data.peerId, nick: data.nick } });
}

function handleViewerScreenStream(ctx, data, screenStreamQueue) {
  screenStreamQueue.push({ peerId: data.peerId, nick: data.nick ?? '?' });
}

function handleViewerScreenSharingStopped(ctx, data) {
  ctx.dispatch?.({ type: 'voip/screenStreamStopped', payload: { peerId: data.peerId } });
}

function handleViewerRecreating(ctx, data) {
  if (data.peerId) ctx.recreatingPeers.add(data.peerId);
}

function getSenderByKind(pc, kind) {
  const t = pc.getTransceivers?.().find((tr) => tr.kind === kind);
  return t?.sender ?? pc.getSenders?.().find((s) => s.track?.kind === kind);
}

function checkNeedsRecreate(voiceCalls, newAudioTrack, newVideoTrack) {
  let needsRecreate = false;
  voiceCalls.forEach((call) => {
    const pc = call.peerConnection ?? call.connection?.peerConnection;
    if (!pc || pc.signalingState === 'closed') return;
    const videoSender = getSenderByKind(pc, 'video');
    const audioSender = getSenderByKind(pc, 'audio');
    if (newVideoTrack && !videoSender) needsRecreate = true;
    if (newAudioTrack && !audioSender) needsRecreate = true;
  });
  return needsRecreate;
}

function doRecreateAllCalls(ctx) {
  const { voiceCalls, recreatingPeers, conn, callPeer } = ctx;
  const peerIds = Array.from(voiceCalls.keys());
  peerIds.forEach((pid) => {
    recreatingPeers.add(pid);
    const c = voiceCalls.get(pid);
    if (c) {
      c.close();
      voiceCalls.delete(pid);
    }
  });
  setTimeout(() => peerIds.forEach((pid) => callPeer(pid)), 50);
}

export function createViewerDataRouter(ctx) {
  return (data, screenStreamQueue) => {
    if (data?.type === 'host_leaving') return;
    if (typeof data !== 'object' || data === null) return;
    if (data.type === 'members' && Array.isArray(data.list)) return handleViewerMembers(ctx, data);
    if (data.type === 'peers') return handleViewerPeers(ctx, data);
    if (data.type === 'new_peer') return handleViewerNewPeer(ctx, data);
    if (data.type === 'leave') return handleViewerLeave(ctx, data);
    if (data.type === 'join' || data.type === 'chat' || data.type === 'file_share') return handleViewerChatOrJoin(ctx, data);
    if (data.type === 'mute') return handleViewerMute(ctx, data);
    if (data.type === 'video') return handleViewerVideo(ctx, data);
    if (data.type === 'background_effect') return handleViewerBackgroundEffect(ctx, data);
    if (data.type === 'screen_sharing' && data.peerId) return handleViewerScreenSharing(ctx, data);
    if (data.type === 'screen_stream' && data.peerId) return handleViewerScreenStream(ctx, data, screenStreamQueue);
    if (data.type === 'screen_sharing_stopped') return handleViewerScreenSharingStopped(ctx, data);
    if (data.type === 'recreating' && data.peerId) return handleViewerRecreating(ctx, data);
  };
}

export function createUpdateLocalStreamForViewer(ctx) {
  return function updateLocalStream(newStream) {
    const { voiceCalls, recreatingPeers, conn, callbacks, callPeer } = ctx;
    const newAudioTrack = newStream?.getAudioTracks?.()?.[0];
    const newVideoTrack = newStream?.getVideoTracks?.()?.[0];
    callbacks.localStream = newStream;
    callbacks.getLocalStream = () => newStream;

    if (checkNeedsRecreate(voiceCalls, newAudioTrack, newVideoTrack)) {
      if (conn?.open) conn.send({ type: 'recreating' });
      doRecreateAllCalls(ctx);
      return;
    }
    replaceTracksOnCalls(voiceCalls, newAudioTrack, newVideoTrack, () => {
      if (conn?.open) conn.send({ type: 'recreating' });
      doRecreateAllCalls(ctx);
    });
  };
}

function replaceTracksOnCalls(voiceCalls, newAudioTrack, newVideoTrack, onAudioRecreate) {
  voiceCalls.forEach((call) => {
    const pc = call.peerConnection ?? call.connection?.peerConnection;
    if (!pc || pc.signalingState === 'closed') return;
    if (newAudioTrack) {
      const audioSender = getSenderByKind(pc, 'audio');
      if (audioSender) audioSender.replaceTrack(newAudioTrack).catch(() => onAudioRecreate());
    } else {
      const audioSender = getSenderByKind(pc, 'audio');
      if (audioSender) audioSender.replaceTrack(null).catch(() => {});
    }
    if (newVideoTrack) {
      const videoSender = getSenderByKind(pc, 'video');
      if (videoSender) videoSender.replaceTrack(newVideoTrack).catch(() => {});
    } else {
      const videoSender = getSenderByKind(pc, 'video');
      if (videoSender) videoSender.replaceTrack(null).catch(() => {});
    }
  });
}
