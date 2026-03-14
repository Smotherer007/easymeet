/**
 * Effect: Room-View UI orchestration.
 * Bundles all handlers for the room view into small, focused functions.
 */

import { getState, patchState } from '../../store/index.js';
import * as selectors from '../../domain/selectors/index.js';
import { t } from '../../i18n.js';
import * as peer from '../network/peer.js';
import { hasTenorKey, searchGifs } from '../../tenor.js';
import { extractDropData, processDropData, zipFileList } from '../../utils/folder-zip.js';
import { addCustomBackground, removeCustomBackground } from '../storage/customBackgroundStorage.js';
import { writeDeviceId } from '../storage/deviceStorage.js';
import { DEVICE_STORAGE, VIDEO_LAYOUT_STORAGE, WINDOW_POSITIONS_STORAGE } from '../../shared/constants.js';
import { escapeHtml } from '../../shared/escape.js';
import {
  attachRoomViewListeners,
  updateVoipParticipants,
  updateMuteButton,
  updateVideoButton,
  updateEffectTilesSelection,
  updateChatBadge,
  updateFileShareMessage,
} from '../../ui/screens/index.js';
import {
  attachRemoteAudio,
  updateVideoGalleryColumns,
  getStreamForVideoTile,
  getStreamForScreenShare,
  getStreamForPeerId,
  applyOutputDeviceToAllAudios,
} from '../media/tiles.js';
import { applyEffectToCallStream } from '../media/devices.js';
import { refreshDeviceSelects } from './devices.js';
import { startSpeakingIndicator, stopSpeakingIndicator } from '../../speaking-indicator.js';

function setupDropzone(el, onFileSelect) {
  if (!el) return;
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    const { files, dirs } = extractDropData(e.dataTransfer?.items);
    const processed = await processDropData({ files, dirs });
    if (processed?.length) onFileSelect(processed);
  });
}

function setupFullscreenButton(app) {
  const btn = app.querySelector('#stream-fullscreen-btn');
  if (!btn) return;
  btn.onclick = () => {
    const wrap = app.querySelector('.stream-modal__video-wrap');
    if (wrap) (!document.fullscreenElement ? wrap.requestFullscreen?.() : document.exitFullscreen?.());
  };
}

function setupPipButton(app) {
  const btn = app.querySelector('#stream-pip-btn');
  if (!btn) return;
  btn.onclick = async () => {
    const vid = app.querySelector('#stream-modal-video');
    if (vid) {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await vid.requestPictureInPicture();
      } catch (_) {}
    }
  };
}

function syncStreamThumbs(app) {
  app.querySelectorAll('.voip-view__stream-thumb').forEach((thumb) => {
    const participant = thumb.closest('.voip-view__participant');
    const peerId = participant?.dataset?.peerId;
    thumb.srcObject = peerId ? getStreamForScreenShare(peerId) : null;
  });
}

function syncModalVideo(app) {
  const modal = app.querySelector('#stream-modal');
  const modalVideo = app.querySelector('#stream-modal-video');
  if (modalVideo && modal && !modal.hasAttribute('hidden')) {
    const peerId = modal.dataset?.streamPeerId;
    modalVideo.srcObject = peerId ? getStreamForScreenShare(peerId) : null;
  }
}

async function handleCustomBackgroundUpload(app, file, navigate) {
  const result = await addCustomBackground(file);
  if (!result.success) {
    alert(result.error.message || t('customBackgroundUploadFailed'));
    return;
  }
  patchState({ settingsPanelOpen: true });
  navigate('room-view');
}

function handleRemoveCustomBackground(app, id, navigate) {
  const current = selectors.selectBackgroundEffect(getState());
  if (current === id) {
    patchState({ backgroundEffect: 'none' });
    applyEffectToCallStream('none', app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
  }
  const result = removeCustomBackground(id);
  if (!result.success) {
    console.warn('Custom background entfernen fehlgeschlagen:', result.error?.message);
  }
  navigate('room-view');
}

function handleDownloadFile(fileId) {
  const entry = selectors.selectReceivedFileBlob(getState(), fileId);
  if (entry?.blob) {
    const url = URL.createObjectURL(entry.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.filename || 'download';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function handleWindowMove(windowId, pos) {
  const wp = selectors.selectWindowPositions(getState());
  const positions = { ...wp, [windowId]: { ...(wp[windowId] || {}), ...pos } };
  patchState({ windowPositions: positions });
  try { localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(positions)); } catch (_) {}
}

function handleWindowResize(windowId, positions) {
  patchState({ windowPositions: positions });
  try { localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(positions)); } catch (_) {}
}

function handleToggleVideoLayout(app, navigate) {
  const next = selectors.selectVideoLayoutMode(getState()) === 'grid' ? 'free' : 'grid';
  patchState({ videoLayoutMode: next });
  try { localStorage.setItem(VIDEO_LAYOUT_STORAGE, next); } catch (_) {}
  navigate('room-view');
  selectors.selectVoipMembers(getState()).forEach((m) => {
    const stream = getStreamForVideoTile(m.peerId);
    if (stream) attachRemoteAudio(m.peerId, stream);
  });
}

function handleOpenStreamModal(app, peerId) {
  const stream = getStreamForScreenShare(peerId);
  const modal = app.querySelector('#stream-modal');
  const vid = app.querySelector('#stream-modal-video');
  const titleEl = app.querySelector('#stream-modal-title');
  if (modal && vid && stream) {
    vid.srcObject = stream;
    vid.muted = peerId === selectors.selectMyPeerId(getState());
    modal.dataset.streamPeerId = peerId ?? '';
    if (titleEl) titleEl.textContent = `${selectors.selectNickForPeerId(getState(), peerId)} – ${t('screenStream')}`;
    modal.removeAttribute('hidden');
  }
}

async function handleShareOpen(app, getJoinUrl) {
  const canvas = app.querySelector('#share-qr-canvas');
  const roomId = selectors.selectRoomId(getState());
  if (canvas && roomId) {
    const QRCode = (await import('qrcode')).default;
    try { await QRCode.toCanvas(canvas, getJoinUrl(roomId), { width: 200, margin: 2 }); } catch (_) {}
  }
}

function sendChatMessage(handlers) {
  const txt = handlers.getInputValue?.() ?? '';
  const gifs = handlers._pendingGifs ?? [];
  if (!txt.trim() && !gifs.length) return;
  const ts = Date.now();
  const nick = selectors.selectNickname(getState()) ?? '?';
  const giphyUrls = gifs.map((g) => g.url);
  const hostPeer = selectors.selectHostPeer(getState());
  const viewerConn = selectors.selectViewerConn(getState());
  if (hostPeer) hostPeer.sendChat(nick, txt, ts, giphyUrls);
  else if (viewerConn?.sendChat) viewerConn.sendChat(nick, txt, ts, giphyUrls);
  handlers.clearInput?.();
  handlers._pendingGifs = [];
  handlers.setGiphyPreview?.([]);
}

function runInitialRoomSetup(app) {
  const state = getState();
  const localStream = selectors.selectLocalStream(state);
  const myPeerId = selectors.selectMyPeerId(state);
  if (localStream && myPeerId) {
    attachRemoteAudio(myPeerId, localStream);
    startSpeakingIndicator(myPeerId, localStream, app);
  }
  selectors.selectRemoteStreams(state).forEach((stream, peerId) => {
    attachRemoteAudio(peerId, stream);
    startSpeakingIndicator(peerId, stream, app);
  });
  updateVideoGalleryColumns();
  syncStreamThumbs(app);
  syncModalVideo(app);
  setupFullscreenButton(app);
  setupPipButton(app);
}

function buildRoomViewConfigNav(app, deps) {
  const { cleanupAndNavigate, getJoinUrl, navigate } = deps;
  return {
    onLeave: () => cleanupAndNavigate('landing'),
    onChatPanelOpen: () => { patchState({ unreadChatCount: 0 }); updateChatBadge(app, 0); },
    onCustomBackgroundUpload: async (file) => handleCustomBackgroundUpload(app, file, navigate),
    onRemoveCustomBackground: (id) => handleRemoveCustomBackground(app, id, navigate),
    onDownloadFile: handleDownloadFile,
    onWindowMove: handleWindowMove,
    onWindowResize: handleWindowResize,
    getWindowPositions: () => selectors.selectWindowPositions(getState()),
    onToggleVideoLayout: () => handleToggleVideoLayout(app, navigate),
    onOpenStreamModal: (peerId) => handleOpenStreamModal(app, peerId),
    onShareOpen: () => handleShareOpen(app, getJoinUrl),
  };
}

function buildRoomViewConfigChat(getHandlers) {
  const h = () => getHandlers();
  return {
    onSend: () => sendChatMessage(h()),
    onGiphyOpen: () => { if (!hasTenorKey()) h().setGiphyHint?.(t('giphyNoKey')); },
    onGiphySearch: hasTenorKey() ? async (q) => { h().setGiphyResults?.(await searchGifs(q)); } : undefined,
    onGiphySelect: (url, previewUrl) => { const g = h()._pendingGifs ?? []; g.push({ url, previewUrl: previewUrl || url }); h()._pendingGifs = g; h().setGiphyPreview?.(g); },
    onRemoveGif: (index) => { const g = (h()._pendingGifs ?? []).filter((_, i) => i !== index); h()._pendingGifs = g; h().setGiphyPreview?.(g); },
  };
}

function buildRoomViewConfigPart2(app, deps) {
  const { handleStopScreen, setupAudioTrackEndedHandler, getStreamForViewers, createFrozenStream, applyEffectToPreview, navigate, setPeerVolume } = deps;
  return {
    onToggleMute: () => handleToggleMute(app, setupAudioTrackEndedHandler, navigate),
    onToggleVideo: () => handleToggleVideo(app, applyEffectToPreview, applyEffectToCallStream, navigate),
    onSettingsOpen: (isOpen) => handleSettingsOpen(app, isOpen, applyEffectToPreview, refreshDeviceSelects, navigate),
    onInputDeviceChange: (deviceId) => handleInputDeviceChange(app, deviceId, setupAudioTrackEndedHandler, refreshDeviceSelects, navigate),
    onVideoDeviceChange: (deviceId) => handleVideoDeviceChange(app, deviceId, refreshDeviceSelects, navigate),
    onPeerVolumeChange: (peerId, percent) => setPeerVolume(peerId, percent),
    onBackgroundEffectChange: (effect) => handleBackgroundEffectChange(app, effect, applyEffectToCallStream, applyEffectToPreview, navigate),
    onOutputDeviceChange: (deviceId) => handleOutputDeviceChange(deviceId),
    onFileSelect: (files) => handleFileSelect(app, files, navigate),
    onStartScreen: () => handleStartScreen(app, getStreamForViewers, handleStopScreen, navigate),
    onStopScreen: () => handleStopScreen(),
    onPauseScreen: () => handlePauseScreen(app, getStreamForViewers, createFrozenStream, navigate),
    onAudioScreenToggle: () => handleAudioScreenToggle(app, getStreamForViewers, navigate),
  };
}

export function attachRoomViewAndHandlers(app, deps) {
  let handlers;
  const config = { ...buildRoomViewConfigNav(app, deps), ...buildRoomViewConfigChat(() => handlers), ...buildRoomViewConfigPart2(app, deps) };
  handlers = attachRoomViewListeners(app, config);
  setupDropzone(app.querySelector('#dropzone'), handlers.onFileSelect);
  setupDropzone(app.querySelector('#chat-dropzone'), handlers.onFileSelect);
  runInitialRoomSetup(app);
}

function doMuteLocalStream(s) {
  selectors.selectLocalStream(s)?.getAudioTracks?.().forEach((t) => t.stop());
  selectors.selectBaseLocalStream(s)?.getAudioTracks?.().forEach((t) => { if (t.readyState !== 'ended') t.stop(); });
  const videoTrack = selectors.selectLocalStream(s)?.getVideoTracks?.()[0];
  const newStream = new MediaStream(videoTrack ? [videoTrack] : []);
  patchState({ localStream: newStream, baseLocalStream: newStream });
}

function reenableExistingAudio(s) {
  const tracks = selectors.selectLocalStream(s)?.getAudioTracks?.() ?? [];
  const hasActive = tracks.length > 0 && tracks[0]?.readyState !== 'ended';
  if (hasActive) {
    selectors.selectLocalStream(s).getAudioTracks().forEach((tr) => { tr.enabled = true; });
    return true;
  }
  return false;
}

async function acquireNewAudioStream(s, setupAudioTrackEndedHandler) {
  const newStream = await peer.getUserMedia(selectors.selectInputDeviceId(s) || undefined, false, undefined);
  const newAudioTrack = newStream.getAudioTracks?.()[0];
  if (!newAudioTrack) return false;
  newStream.getVideoTracks?.().forEach((t) => t.stop());
  const videoTrack = selectors.selectLocalStream(s)?.getVideoTracks?.()[0];
  const tracks = videoTrack ? [newAudioTrack, videoTrack] : [newAudioTrack];
  const localStream = new MediaStream(tracks);
  const inputDeviceId = newAudioTrack.getSettings?.()?.deviceId || selectors.selectInputDeviceId(s);
  patchState({ localStream, baseLocalStream: localStream, inputDeviceId });
  if (inputDeviceId) writeDeviceId(DEVICE_STORAGE.input, inputDeviceId);
  setupAudioTrackEndedHandler(newAudioTrack);
  return true;
}

async function doUnmuteLocalStream(s, setupAudioTrackEndedHandler) {
  if (reenableExistingAudio(s)) return true;
  try {
    if (await acquireNewAudioStream(s, setupAudioTrackEndedHandler)) return true;
    return false;
  } catch (err) {
    console.error('Mikrofon-Zugriff fehlgeschlagen:', err);
    alert(t('microphonePermissionDenied'));
    patchState({ isMuted: true });
    return false;
  }
}

function syncMuteToPeers(app) {
  const state = getState();
  const localStream = selectors.selectLocalStream(state);
  const myPeerId = selectors.selectMyPeerId(state);
  selectors.selectHostPeer(state)?.updateLocalStream?.(localStream);
  selectors.selectViewerConn(state)?.updateLocalStream?.(localStream);
  if (selectors.selectHostPeer(state)) selectors.selectHostPeer(state).broadcastMute?.(myPeerId, selectors.selectIsMuted(state));
  else selectors.selectViewerConn(state)?.sendMute?.(selectors.selectIsMuted(state));
  const nextMute = new Map(selectors.selectPeerMuteState(state));
  nextMute.set(myPeerId, selectors.selectIsMuted(state));
  patchState({ peerMuteState: nextMute });
  if (myPeerId) attachRemoteAudio(myPeerId, localStream);
  updateVoipParticipants(app, selectors.selectVoipMembers(state), myPeerId, selectors.selectIsMuted(state), selectors.selectScreenStreams(state), getStreamForPeerId, getStreamForScreenShare, selectors.selectPeerMuteState(state), selectors.selectPeerVolume(state), selectors.selectBackgroundEffect(state), selectors.selectPeerVideoState(state), selectors.selectIsVideoEnabled(state), selectors.selectPeerBackgroundEffect(state));
  updateMuteButton(app, selectors.selectIsMuted(state));
}

async function handleToggleMute(app, setupAudioTrackEndedHandler, navigate) {
  const s = getState();
  const willBeMuted = !selectors.selectIsMuted(s);
  patchState({ isMuted: willBeMuted });
  if (willBeMuted) doMuteLocalStream(s);
  else if (!(await doUnmuteLocalStream(s, setupAudioTrackEndedHandler))) return;
  syncMuteToPeers(app);
}

function turnOffVideoStream(s) {
  if (s.backgroundEffectStop) { try { s.backgroundEffectStop(); } catch (_) {} patchState({ backgroundEffectStop: null }); }
  selectors.selectLocalStream(s)?.getVideoTracks?.().forEach((t) => t.stop());
  selectors.selectBaseLocalStream(s)?.getVideoTracks?.().forEach((t) => { if (t.readyState !== 'ended') t.stop(); });
  const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
  const newStream = audioTrack ? new MediaStream([audioTrack]) : new MediaStream();
  if (audioTrack) newStream.getAudioTracks().forEach((t) => { t.enabled = !selectors.selectIsMuted(s); });
  patchState({ localStream: newStream, baseLocalStream: newStream });
}

async function setupPreviewWhenVideoOff(app, s, applyEffectToPreview) {
  const previewVideo = app.querySelector('#effect-preview-video');
  const settingsModal = app.querySelector('#settings-modal');
  if (!previewVideo || !settingsModal || settingsModal.hasAttribute('hidden') || !selectors.selectHasVideoSupport(s)) return;
  try {
    try { selectors.selectPreviewEffectStop(getState())?.(); } catch (_) {}
    patchState({ _previewEffectStop: null });
    const prevStream = selectors.selectPreviewStream(getState());
    if (prevStream) prevStream.getTracks().forEach((t) => t.stop());
    const previewStream = await peer.getUserMedia(undefined, 'videoOnly', selectors.selectVideoDeviceId(s) || undefined);
    patchState({ _previewStream: previewStream });
    await applyEffectToPreview(previewStream, selectors.selectBackgroundEffect(s) || 'none', previewVideo);
  } catch (err) {
    console.warn('Preview-Stream fehlgeschlagen:', err);
    previewVideo.srcObject = null;
  }
}

function reenableExistingVideo(s) {
  const tracks = selectors.selectLocalStream(s)?.getVideoTracks?.() ?? [];
  const hasActive = tracks.length > 0 && tracks[0]?.readyState !== 'ended';
  if (hasActive) {
    selectors.selectLocalStream(s).getVideoTracks().forEach((tr) => { tr.enabled = true; });
    patchState({ isVideoEnabled: true });
    return true;
  }
  return false;
}

async function acquireNewVideoStream(s) {
  const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
  const requestBoth = !!audioTrack;
  let newStream;
  try { newStream = await peer.getUserMedia(selectors.selectInputDeviceId(s) || undefined, requestBoth ? true : 'videoOnly', selectors.selectVideoDeviceId(s) || undefined); }
  catch { newStream = await peer.getUserMedia(null, requestBoth ? true : 'videoOnly', null); }
  const videoTrack = newStream.getVideoTracks?.()[0];
  if (!videoTrack) return false;
  const tracks = audioTrack ? [audioTrack, videoTrack] : [videoTrack];
  const localStream = new MediaStream(tracks);
  localStream.getAudioTracks().forEach((t) => { t.enabled = !selectors.selectIsMuted(s); });
  newStream.getAudioTracks().forEach((t) => t.stop());
  const videoDeviceId = videoTrack.getSettings?.()?.deviceId || selectors.selectVideoDeviceId(s);
  patchState({ localStream, baseLocalStream: localStream, hasVideoSupport: true, videoDeviceId, isVideoEnabled: true });
  if (videoDeviceId) writeDeviceId(DEVICE_STORAGE.video, videoDeviceId);
  return true;
}

async function turnOnVideoStream(s) {
  if (reenableExistingVideo(s)) return true;
  try {
    return await acquireNewVideoStream(s);
  } catch (err) {
    console.error('Kamera-Zugriff fehlgeschlagen:', err);
    alert(t('cameraPermissionDenied'));
    return false;
  }
}

function cleanupPreviewWhenVideoOn(app) {
  const state = getState();
  const previewVideo = app.querySelector('#effect-preview-video');
  const settingsModal = app.querySelector('#settings-modal');
  if (!previewVideo || !settingsModal || settingsModal.hasAttribute('hidden') || !selectors.selectIsVideoEnabled(state) || !selectors.selectLocalStream(state)?.getVideoTracks?.().length) return;
  const prevStream = selectors.selectPreviewStream(getState());
  if (prevStream) { prevStream.getTracks().forEach((t) => t.stop()); patchState({ _previewStream: null }); }
  try { selectors.selectPreviewEffectStop(getState())?.(); } catch (_) {}
  patchState({ _previewEffectStop: null });
}

function syncVideoToPeers(app) {
  const state = getState();
  const localStream = selectors.selectLocalStream(state);
  const myPeerId = selectors.selectMyPeerId(state);
  selectors.selectHostPeer(state)?.updateLocalStream?.(localStream);
  selectors.selectViewerConn(state)?.updateLocalStream?.(localStream);
  updateVideoButton(app, selectors.selectIsVideoEnabled(state));
  if (myPeerId) {
    attachRemoteAudio(myPeerId, localStream);
    if (selectors.selectHostPeer(state)) selectors.selectHostPeer(state).broadcastVideo?.(myPeerId, selectors.selectIsVideoEnabled(state));
    else selectors.selectViewerConn(state)?.sendVideo?.(selectors.selectIsVideoEnabled(state));
    if (selectors.selectScreen(state) === 'room-view') {
      updateVoipParticipants(app, selectors.selectVoipMembers(state), myPeerId, selectors.selectIsMuted(state), selectors.selectScreenStreams(state), getStreamForPeerId, getStreamForScreenShare, selectors.selectPeerMuteState(state), selectors.selectPeerVolume(state), selectors.selectBackgroundEffect(state), selectors.selectPeerVideoState(state), selectors.selectIsVideoEnabled(state), selectors.selectPeerBackgroundEffect(state));
    }
  }
}

async function applyEffectAfterVideoToggle(app, applyEffectToCallStream, navigate) {
  const eff = selectors.selectBackgroundEffect(getState());
  if (eff && eff !== 'none' && selectors.selectLocalStream(getState())?.getVideoTracks?.().length) {
    await applyEffectToCallStream(eff, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
  }
}

function syncPreviewVideoIfSettingsOpen(app) {
  const preview = app.querySelector('#effect-preview-video');
  const modal = app.querySelector('#settings-modal');
  if (preview && modal && !modal.hasAttribute('hidden') && selectors.selectIsVideoEnabled(getState())) {
    preview.srcObject = selectors.selectLocalStream(getState());
  }
}

async function handleToggleVideo(app, applyEffectToPreview, applyEffectToCallStream, navigate) {
  const s = getState();
  if (selectors.selectIsVideoEnabled(s)) {
    patchState({ isVideoEnabled: false });
    turnOffVideoStream(s);
    await setupPreviewWhenVideoOff(app, s, applyEffectToPreview);
  } else if (!(await turnOnVideoStream(s))) return;
  cleanupPreviewWhenVideoOn(app);
  syncVideoToPeers(app);
  await applyEffectAfterVideoToggle(app, applyEffectToCallStream, navigate);
  syncPreviewVideoIfSettingsOpen(app);
}

function setupDeviceChangeListener(app, refreshDeviceSelects) {
  const settingsModal = app.querySelector('#settings-modal');
  const onDeviceChange = () => { if (settingsModal && !settingsModal.hasAttribute('hidden')) refreshDeviceSelects(app); };
  const prevHandler = selectors.selectDeviceChangeHandler(getState());
  navigator.mediaDevices?.removeEventListener?.('devicechange', prevHandler);
  patchState({ _deviceChangeHandler: onDeviceChange });
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
}

function stopPreviewStreams() {
  try { selectors.selectPreviewEffectStop(getState())?.(); } catch (_) {}
  patchState({ _previewEffectStop: null });
  const prevStream = selectors.selectPreviewStream(getState());
  if (prevStream) { prevStream.getTracks().forEach((t) => t.stop()); patchState({ _previewStream: null }); }
}

function cleanupPreviewVideo(previewVideo) {
  stopPreviewStreams();
  previewVideo.srcObject = null;
}

function showLocalStreamInPreview(previewVideo, st) {
  if (selectors.selectIsVideoEnabled(st) && selectors.selectLocalStream(st)?.getVideoTracks?.().length) {
    previewVideo.srcObject = selectors.selectLocalStream(st);
    previewVideo.play?.().catch(() => {});
    return true;
  }
  return false;
}

async function showEffectPreviewInSettings(app, applyEffectToPreview, previewVideo) {
  stopPreviewStreams();
  const previewStream = await peer.getUserMedia(undefined, 'videoOnly', selectors.selectVideoDeviceId(getState()) || undefined);
  patchState({ _previewStream: previewStream });
  await applyEffectToPreview(previewStream, selectors.selectBackgroundEffect(getState()) || 'none', previewVideo);
  previewVideo.play?.().catch(() => {});
}

async function setupPreviewVideoWhenOpen(app, applyEffectToPreview) {
  await new Promise((r) => requestAnimationFrame(r));
  const st = getState();
  const settingsModal = app.querySelector('#settings-modal');
  if (!selectors.selectSettingsPanelOpen(st) || !settingsModal || settingsModal.hasAttribute('hidden')) return;
  const previewVideo = app.querySelector('#effect-preview-video');
  if (!previewVideo) return;
  if (!showLocalStreamInPreview(previewVideo, st)) {
    try { await showEffectPreviewInSettings(app, applyEffectToPreview, previewVideo); }
    catch (err) { console.warn('Preview-Stream fehlgeschlagen:', err); previewVideo.srcObject = null; }
  }
}

async function handleSettingsOpen(app, isOpen, applyEffectToPreview, refreshDeviceSelects, navigate) {
  patchState({ settingsPanelOpen: isOpen });
  await refreshDeviceSelects(app);
  setupDeviceChangeListener(app, refreshDeviceSelects);
  const previewVideo = app.querySelector('#effect-preview-video');
  if (previewVideo) {
    if (!isOpen) cleanupPreviewVideo(previewVideo);
    else await setupPreviewVideoWhenOpen(app, applyEffectToPreview);
  }
}

function stopEffectAndAcquireStream(s, deviceId) {
  try { s.backgroundEffectStop?.(); } catch (_) {}
  patchState({ backgroundEffectStop: null });
  return peer.getUserMedia(deviceId || undefined, selectors.selectHasVideoSupport(s) ?? false, selectors.selectVideoDeviceId(s) || undefined);
}

function buildLocalStreamFromTracks(audioTrack, videoTrack, s) {
  const tracks = [audioTrack];
  if (videoTrack) {
    videoTrack.enabled = selectors.selectIsVideoEnabled(getState()) ?? false;
    tracks.push(videoTrack);
  }
  const localStream = new MediaStream(tracks);
  localStream.getAudioTracks().forEach((t) => { t.enabled = !selectors.selectIsMuted(getState()); });
  return localStream;
}

function syncPreviewVideoToLocalStream(app, localStream) {
  const preview = app.querySelector('#effect-preview-video');
  const modal = app.querySelector('#settings-modal');
  if (preview && modal && !modal.hasAttribute('hidden') && selectors.selectIsVideoEnabled(getState()) && localStream?.getVideoTracks?.().length) {
    preview.srcObject = null;
    preview.srcObject = localStream;
    preview.play?.().catch(() => {});
  }
}

function syncPeersAndSpeakingAfterInputChange(app, localStream, inputDeviceId, videoDeviceId, setupAudioTrackEndedHandler) {
  if (inputDeviceId) writeDeviceId(DEVICE_STORAGE.input, inputDeviceId);
  else localStorage.removeItem(DEVICE_STORAGE.input);
  if (videoDeviceId) writeDeviceId(DEVICE_STORAGE.video, videoDeviceId);
  setupAudioTrackEndedHandler(localStream.getAudioTracks()[0]);
  selectors.selectHostPeer(getState())?.updateLocalStream?.(localStream);
  selectors.selectViewerConn(getState())?.updateLocalStream?.(localStream);
  const myPeerId = selectors.selectMyPeerId(getState());
  if (myPeerId) {
    attachRemoteAudio(myPeerId, localStream);
    if (selectors.selectScreen(getState()) === 'room-view') {
      stopSpeakingIndicator(myPeerId);
      startSpeakingIndicator(myPeerId, localStream, app);
    }
  }
  if (selectors.selectScreen(getState()) === 'room-view') updateVideoButton(app, selectors.selectIsVideoEnabled(getState()));
}

async function applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate) {
  if (previousEffect && previousEffect !== 'none') {
    await applyEffectToCallStream(previousEffect, app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
  } else {
    patchState({ backgroundEffect: 'none' });
    updateEffectTilesSelection(app, 'none');
  }
}

function swapInputDeviceAndSync(app, s, deviceId, newStream, setupAudioTrackEndedHandler) {
  const audioTrack = newStream.getAudioTracks?.()[0];
  const videoTrack = newStream.getVideoTracks?.()[0];
  if (!audioTrack) { newStream.getTracks().forEach((t) => t.stop()); return null; }
  const oldStream = selectors.selectLocalStream(getState());
  const localStream = buildLocalStreamFromTracks(audioTrack, videoTrack, s);
  patchState({ localStream, baseLocalStream: localStream });
  const inputDeviceId = (deviceId || audioTrack.getSettings?.()?.deviceId) || null;
  const videoDeviceId = videoTrack ? (videoTrack.getSettings?.()?.deviceId || selectors.selectVideoDeviceId(getState())) : null;
  patchState({ inputDeviceId, videoDeviceId });
  oldStream.getTracks().forEach((t) => t.stop());
  syncPreviewVideoToLocalStream(app, localStream);
  syncPeersAndSpeakingAfterInputChange(app, localStream, inputDeviceId, videoDeviceId, setupAudioTrackEndedHandler);
  return localStream;
}

async function handleInputDeviceChange(app, deviceId, setupAudioTrackEndedHandler, refreshDeviceSelects, navigate) {
  const s = getState();
  if (!selectors.selectLocalStream(s)) return;
  try {
    const previousEffect = selectors.selectBackgroundEffect(s);
    const newStream = await stopEffectAndAcquireStream(s, deviceId);
    if (!swapInputDeviceAndSync(app, s, deviceId, newStream, setupAudioTrackEndedHandler)) return;
    refreshDeviceSelects(app);
    await applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate);
  } catch (err) {
    console.error('Mikrofon-Wechsel fehlgeschlagen:', err);
  }
}

function persistVideoDeviceId(deviceId) {
  patchState({ videoDeviceId: deviceId || null });
  if (deviceId) writeDeviceId(DEVICE_STORAGE.video, deviceId);
  else localStorage.removeItem(DEVICE_STORAGE.video);
}

function buildLocalStreamWithNewVideo(s, newVideoTrack, audioTrack) {
  newVideoTrack.enabled = selectors.selectIsVideoEnabled(s) ?? false;
  const tracks = audioTrack ? [audioTrack, newVideoTrack] : [newVideoTrack];
  const localStream = new MediaStream(tracks);
  localStream?.getAudioTracks?.().forEach((t) => { t.enabled = !selectors.selectIsMuted(s); });
  return localStream;
}

function syncPeersAndPreviewAfterVideoChange(app, localStream, deviceId) {
  const vdId = selectors.selectVideoDeviceId(getState());
  if (vdId) writeDeviceId(DEVICE_STORAGE.video, vdId);
  else localStorage.removeItem(DEVICE_STORAGE.video);
  selectors.selectHostPeer(getState())?.updateLocalStream?.(localStream);
  selectors.selectViewerConn(getState())?.updateLocalStream?.(localStream);
  const myPeerId = selectors.selectMyPeerId(getState());
  if (myPeerId) attachRemoteAudio(myPeerId, localStream);
  const preview = app.querySelector('#effect-preview-video');
  const modal = app.querySelector('#settings-modal');
  if (preview && modal && !modal.hasAttribute('hidden') && localStream) preview.srcObject = localStream;
  if (selectors.selectScreen(getState()) === 'room-view') updateVideoButton(app, selectors.selectIsVideoEnabled(getState()));
}

function swapVideoDeviceAndSync(app, s, deviceId, newStream) {
  const newVideoTrack = newStream.getVideoTracks?.()[0];
  if (!newVideoTrack) return false;
  const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
  const localStream = buildLocalStreamWithNewVideo(s, newVideoTrack, audioTrack);
  patchState({ localStream, baseLocalStream: localStream, videoDeviceId: newVideoTrack.getSettings?.()?.deviceId || deviceId || null });
  selectors.selectLocalStream(s).getVideoTracks().forEach((t) => t.stop());
  newStream.getAudioTracks().forEach((t) => t.stop());
  syncPeersAndPreviewAfterVideoChange(app, localStream, deviceId);
  return true;
}

async function handleVideoDeviceChange(app, deviceId, refreshDeviceSelects, navigate) {
  persistVideoDeviceId(deviceId);
  const s = getState();
  if (!selectors.selectLocalStream(s) || !selectors.selectHasVideoSupport(s)) return;
  try {
    const previousEffect = selectors.selectBackgroundEffect(s);
    try { s.backgroundEffectStop?.(); } catch (_) {}
    patchState({ backgroundEffectStop: null });
    const newStream = await peer.getUserMedia(selectors.selectInputDeviceId(s) || undefined, true, deviceId || undefined);
    if (!swapVideoDeviceAndSync(app, s, deviceId, newStream)) return;
    await applyPreviousEffectAfterDeviceChange(app, previousEffect, navigate);
  } catch (err) {
    console.error('Kamera-Wechsel fehlgeschlagen:', err);
  }
}

async function applyEffectToPreviewOnly(app, s, effect, applyEffectToPreview) {
  const previewVideo = app.querySelector('#effect-preview-video');
  const settingsModal = app.querySelector('#settings-modal');
  if (previewVideo && settingsModal && !settingsModal.hasAttribute('hidden')) {
    await applyEffectToPreview(s._previewStream, effect || 'none', previewVideo);
  }
  updateEffectTilesSelection(app, effect || 'none');
}

async function handleBackgroundEffectChange(app, effect, applyEffectToCallStream, applyEffectToPreview, navigate) {
  const s = getState();
  const videoTrack = selectors.selectBaseLocalStream(s)?.getVideoTracks?.()[0];
  const cameraActiveForCall = selectors.selectIsVideoEnabled(s) && videoTrack?.enabled;
  patchState({ backgroundEffect: effect || 'none' });
  if (!cameraActiveForCall && s._previewStream) {
    await applyEffectToPreviewOnly(app, s, effect, applyEffectToPreview);
    return;
  }
  if (!videoTrack) {
    updateEffectTilesSelection(app, effect || 'none');
    return;
  }
  await applyEffectToCallStream(effect || 'none', app, attachRemoteAudio, updateVoipParticipants, updateEffectTilesSelection, getStreamForPeerId, getStreamForScreenShare, navigate);
}

function handleOutputDeviceChange(deviceId) {
  const outputDeviceId = deviceId || null;
  patchState({ outputDeviceId });
  if (outputDeviceId) writeDeviceId(DEVICE_STORAGE.output, outputDeviceId);
  else writeDeviceId(DEVICE_STORAGE.output, null);
  applyOutputDeviceToAllAudios(outputDeviceId);
}

async function prepareFileList(files, progressArea, showProgress) {
  let fileList = Array.from(files);
  if (files[0]?.webkitRelativePath) {
    showProgress(`<p class="file-progress__filename">${t('preparingZip')}</p><div class="file-progress__spinner"></div>`);
    const zipFile = await zipFileList(files);
    if (zipFile) fileList = [zipFile];
  }
  return fileList;
}

function getFileConnections(hostPeer, viewerConn) {
  const connMap = hostPeer?.getConnections?.();
  const allConns = connMap ? Array.from(connMap.entries()) : [];
  if (!allConns.length && !viewerConn?.conn) return [];
  if (hostPeer && allConns.length) {
    const now = hostPeer.getConnections();
    return Array.from(now.values()).map((e) => e.conn).filter((c) => c?.open);
  }
  return viewerConn?.conn?.open ? [viewerConn.conn] : [];
}

function createProgressUpdater(progressArea, fileName) {
  const transferProgress = { bytes: 0, total: 0 };
  return (progress) => {
    if (progress) {
      transferProgress.bytes = progress.bytesSent ?? progress.bytes;
      transferProgress.total = progress.total;
    }
    if (progressArea) {
      progressArea.hidden = false;
      const pct = transferProgress.total > 0 ? Math.min(100, (transferProgress.bytes / transferProgress.total) * 100) : 0;
      progressArea.innerHTML = `<p class="file-progress__filename">${escapeHtml(fileName)}</p><div class="file-progress__bar-wrap"><div class="file-progress__bar" style="width:${pct}%"></div></div><p class="file-progress__stats">${t('sendingFile')}…</p>`;
    }
  };
}

async function sendSingleFile(app, file, connections, hostPeer, viewerConn, nick, progressArea) {
  const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ts = Date.now();
  if (hostPeer) hostPeer.broadcastFileShare?.(nick, file.name, ts, fileId);
  else viewerConn?.sendFileShare?.(fileId, file.name, ts);
  const updateProgress = createProgressUpdater(progressArea, file.name);
  updateProgress();
  if (connections.length) {
    try {
      await peer.sendFileToViewers(connections, file, updateProgress, selectors.selectRoomId(getState()) ?? '', selectors.selectPassword(getState()) ?? '', nick, fileId);
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
      const blobs = new Map(selectors.selectReceivedFileBlobs(getState()));
      blobs.set(fileId, { blob, filename: file.name, mimeType: file.type || 'application/octet-stream' });
      patchState({ receivedFileBlobs: blobs });
      if (selectors.selectScreen(getState()) === 'room-view') updateFileShareMessage(app, fileId, file.name, nick);
    } catch (_) {}
  }
  if (progressArea) progressArea.hidden = true;
}

async function handleFileSelect(app, files, navigate) {
  if (!files?.length) return;
  const progressArea = app.querySelector('#file-progress-area');
  const showProgress = (html) => { if (progressArea) { progressArea.hidden = false; progressArea.innerHTML = html; } };
  const fileList = await prepareFileList(files, progressArea, showProgress);
  const hostPeer = selectors.selectHostPeer(getState());
  const viewerConn = selectors.selectViewerConn(getState());
  const connMap = hostPeer?.getConnections?.();
  const allConns = connMap ? Array.from(connMap.entries()) : [];
  if (!allConns.length && !viewerConn?.conn) return;
  const nick = selectors.selectNickname(getState()) ?? '?';
  for (const file of fileList) {
    const connections = getFileConnections(hostPeer, viewerConn);
    await sendSingleFile(app, file, connections, hostPeer, viewerConn, nick, progressArea);
  }
}

function setupHostScreenShare(s, stream, getStreamForViewers, myPeerId, nick) {
  const screenStreams = new Map(selectors.selectScreenStreams(s));
  screenStreams.set(myPeerId ?? '', { stream, nick });
  patchState({ screenStreams });
  selectors.selectHostPeer(s).setScreenStream(getStreamForViewers());
  selectors.selectHostPeer(s).broadcastScreenSharing?.(myPeerId ?? '', nick);
}

function setupViewerScreenShare(s, stream, handleStopScreen, myPeerId, nick) {
  const screenStreams = new Map(selectors.selectScreenStreams(s));
  screenStreams.set(myPeerId ?? '', { stream, nick });
  patchState({ screenStreams });
  const hostPeerId = selectors.selectViewerConn(s)?.conn?.peer;
  const peerObj = selectors.selectPeer(s);
  if (hostPeerId && peerObj) {
    selectors.selectViewerConn(s)?.conn?.send?.({ type: 'screen_stream', peerId: peerObj.id, nick });
    const viewerScreenCall = peerObj.call(hostPeerId, stream);
    patchState({ viewerScreenCall });
    if (viewerScreenCall) viewerScreenCall.on('close', () => handleStopScreen());
  }
}

async function handleStartScreen(app, getStreamForViewers, handleStopScreen, navigate) {
  try {
    const stream = await peer.getScreenStream();
    const hasAudio = stream.getAudioTracks().length > 0;
    patchState({ hostStream: stream, hasAudio, audioEnabled: hasAudio });
    stream.getVideoTracks()[0]?.addEventListener('ended', () => handleStopScreen());
    const s = getState();
    const myPeerId = selectors.selectMyPeerId(s);
    const nick = selectors.selectNickname(s) ?? '?';
    if (selectors.selectIsHost(s)) setupHostScreenShare(s, stream, getStreamForViewers, myPeerId, nick);
    else setupViewerScreenShare(s, stream, handleStopScreen, myPeerId, nick);
    const preview = app.querySelector('#host-preview');
    if (preview) preview.srcObject = stream;
    navigate('room-view');
  } catch (err) {
    alert(err.message || t('screenShareFailed'));
  }
}

function handlePauseScreen(app, getStreamForViewers, createFrozenStream, navigate) {
  const preview = app.querySelector('#host-preview');
  const s = getState();
  if (!selectors.selectHostStream(s) || !preview || preview.readyState < 2) return;
  if (selectors.selectPaused(s)) {
    s.frozenStreamStop?.();
    patchState({ frozenStream: null, frozenStreamStop: null, paused: false });
    selectors.selectHostPeer(s).setScreenStream(getStreamForViewers());
    preview.srcObject = selectors.selectHostStream(s);
  } else {
    const { stream, stop } = createFrozenStream(preview);
    patchState({ frozenStream: stream, frozenStreamStop: stop, paused: true });
    selectors.selectHostPeer(s).setScreenStream(stream);
    preview.srcObject = stream;
  }
  navigate('room-view');
}

function handleAudioScreenToggle(app, getStreamForViewers, navigate) {
  const s = getState();
  if (!selectors.selectHasAudio(s) || selectors.selectPaused(s)) return;
  patchState({ audioEnabled: !selectors.selectAudioEnabled(s) });
  selectors.selectHostPeer(s).setScreenStream(getStreamForViewers());
  navigate('room-view');
}
