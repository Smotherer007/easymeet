/**
 * App Bootstrap – Composition Root.
 * Orchestrates navigation, event subscriptions, and effect handlers.
 */

import { t, getLang, setLang, onLangChange } from '../i18n.js';
import { err } from '../shared/result.js';
import {
  fetchCreateRoom,
  fetchJoinRoom,
  fetchRoomStatus,
} from '../effects/network/api.js';
import * as peer from '../effects/network/mediasoupClient.js';
import { playMessageSound, playJoinSound } from '../sounds.js';
import { playJoinTone, playLeaveTone, playStreamStartTone } from '../audio.js';
import { stopSpeakingIndicator, cleanupAllSpeakingIndicators } from '../speaking-indicator.js';
import {
  renderLanding,
  attachLandingListeners,
  renderCreateRoomForm,
  renderCreateRoomSuccess,
  attachCreateRoomListeners,
  showQrCode,
  renderJoinRoom,
  attachJoinRoomListeners,
  setJoinError,
  renderRoomView,
  appendMessage,
  updateVoipParticipants,
  updateChatBadge,
  updateFileShareMessage,
  updateReceivingProgress,
  hideReceivingProgress,
} from '../ui/screens/index.js';
import {
  createBlurredStream,
  createVirtualBackgroundStream,
  isSupported as isBackgroundEffectsSupported,
  preloadBackgroundEffectsModel,
  preloadBackgroundImages,
  BACKGROUND_IMAGES,
} from '../effects/backgroundEffects.js';
import { VIDEO_LAYOUT_STORAGE, WINDOW_POSITIONS_STORAGE } from '../shared/constants.js';
import { mergeAndClampAllWindowPositions } from '../ui/utils/viewportWindowClamp.js';
import { getState, patchState, dispatch, subscribe } from '../store/index.js';
import * as selectors from '../domain/selectors/index.js';
import {
  readDeviceIds,
  readNickname,
  readPeerVolumes,
  writeDeviceId,
  writeNickname,
  writePeerVolumes,
} from '../effects/storage/deviceStorage.js';
import { getCustomBackgrounds } from '../effects/storage/customBackgroundStorage.js';
import { reacquireAudioStreamIfNeeded } from '../effects/media/devices.js';
import { refreshDeviceSelects } from '../effects/ui/devices.js';
import {
  attachRemoteAudio,
  detachRemoteAudio,
  getStreamForVideoTile,
  getStreamForScreenShare,
  getStreamForPeerId,
} from '../effects/media/tiles.js';
import { attachRoomViewAndHandlers as attachRoomViewFromModule } from '../effects/ui/roomView.js';

export function bootstrap(appEl) {
  initFromStorage();
  setupBeforeUnload();
  setupSubscribe(appEl);
  renderLangSwitcher(appEl);
  onLangChange(() => navigate(appEl, selectors.selectScreen(getState())));
  preloadBackgroundEffectsModel();
  preloadBackgroundImages();
  initFromUrl(appEl);
}

function loadDeviceIdsFromStorage() {
  const devResult = readDeviceIds();
  if (devResult.success && devResult.data && (devResult.data.input || devResult.data.output || devResult.data.video)) {
    patchState({ inputDeviceId: devResult.data.input, outputDeviceId: devResult.data.output, videoDeviceId: devResult.data.video });
  }
}

function loadLayoutFromStorage() {
  try {
    const layout = localStorage.getItem(VIDEO_LAYOUT_STORAGE);
    if (layout === 'free' || layout === 'grid') patchState({ videoLayoutMode: layout });
    const stored = localStorage.getItem(WINDOW_POSITIONS_STORAGE);
    if (stored) {
      try {
        const raw = JSON.parse(stored);
        if (raw && typeof raw === 'object') {
          const pos = mergeAndClampAllWindowPositions(raw);
          patchState({ windowPositions: pos });
          try {
            localStorage.setItem(WINDOW_POSITIONS_STORAGE, JSON.stringify(pos));
          } catch (_) {}
        }
      } catch (_) {}
    }
  } catch (_) {}
}

function initFromStorage() {
  loadDeviceIdsFromStorage();
  const volumes = readPeerVolumes();
  if (Object.keys(volumes).length > 0) patchState({ peerVolume: new Map(Object.entries(volumes)) });
  loadLayoutFromStorage();
}

function render(appEl, html) {
  const s = getState();
  appEl.innerHTML = html;
  appEl.className = selectors.selectScreen(s) === 'room-view' ? 'fullscreen' : '';
  renderLangSwitcher(appEl);
}

function renderLangSwitcher(appEl) {
  const el = document.getElementById('lang-switcher');
  if (!el) return;
  const s = getState();
  const screen = selectors.selectScreen(s);
  el.classList.toggle('lang-switcher--bottom', screen === 'room-view');
  el.classList.toggle('lang-switcher--hidden', screen === 'room-view');
  if (screen === 'room-view') return;
  const lang = getLang();
  el.innerHTML = `
    <button type="button" class="lang-switcher__btn ${lang === 'de' ? 'lang-switcher__btn--active' : ''}" data-lang="de">DE</button>
    <button type="button" class="lang-switcher__btn ${lang === 'en' ? 'lang-switcher__btn--active' : ''}" data-lang="en">EN</button>
  `;
  el.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

function getJoinUrl(roomId) {
  const base = window.location.origin + window.location.pathname;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}join=${encodeURIComponent(roomId || '')}`;
}

function renderLandingScreen(appEl) {
  render(appEl, renderLanding());
  attachLandingListeners(appEl, {
    onCreateRoom: () => navigate(appEl, 'create-room'),
    onJoinRoom: () => navigate(appEl, 'join-room'),
    onPickActiveRoom: (roomId, hasPassword) => {
      navigate(appEl, 'join-room', { joinRoomCode: roomId, joinRoomHasPassword: hasPassword });
    },
  });
}

function renderCreateRoomScreen(appEl) {
  render(appEl, renderCreateRoomForm());
  attachCreateRoomListeners(appEl, {
    /* Session/Peer-State zurücksetzen — sonst bleibt z. B. ein offenes Protoo nach abgebrochenem Flow */
    onBack: () => cleanupAndNavigate(appEl, 'landing'),
    onCreate: (nick, pwd, code) => handleCreateRoom(appEl, nick, pwd, code),
    getJoinUrl,
    initialNickname: readNickname() || '',
    initialRoomCode: '',
  });
}

function renderCreateRoomSuccessScreen(appEl, s) {
  render(appEl, renderCreateRoomSuccess(selectors.selectRoomId(s), getJoinUrl));
  attachCreateRoomListeners(appEl, {
    onBack: () => cleanupAndNavigate(appEl, 'landing'),
    onEnterRoom: () => navigate(appEl, 'room-view'),
    getJoinUrl,
    roomId: selectors.selectRoomId(s),
  });
  showQrCode(appEl, selectors.selectRoomId(s), getJoinUrl);
}

function renderJoinRoomScreen(appEl, s) {
  render(appEl, renderJoinRoom(s.joinRoomCode ?? '', s.joinRoomHasPassword ?? true));
  attachJoinRoomListeners(appEl, {
    onBack: () => cleanupAndNavigate(appEl, 'landing'),
    onJoin: (roomId, pwd, nick) => handleJoinRoom(appEl, roomId, pwd, nick),
    initialNickname: readNickname() || '',
  });
}

function setupRoomViewDeviceHandlers(appEl, s) {
  const audioTrack = selectors.selectLocalStream(s)?.getAudioTracks?.()[0];
  if (audioTrack && audioTrack.readyState !== 'ended') setupAudioTrackEndedHandler(appEl, audioTrack);
  const prevHandler = selectors.selectCallDeviceChangeHandler(getState());
  navigator.mediaDevices?.removeEventListener?.('devicechange', prevHandler);
  const newHandler = () => reacquireAudioStreamIfNeeded(appEl, attachRemoteAudio, (t) => setupAudioTrackEndedHandler(appEl, t));
  patchState({ _callDeviceChangeHandler: newHandler });
  navigator.mediaDevices?.addEventListener?.('devicechange', newHandler);
}

function getRoomViewDeps(appEl) {
  return {
    cleanupAndNavigate: (scr) => cleanupAndNavigate(appEl, scr),
    handleStopScreen: () => handleStopScreen(appEl),
    getJoinUrl,
    setupAudioTrackEndedHandler: (track) => setupAudioTrackEndedHandler(appEl, track),
    getStreamForViewers,
    createFrozenStream,
    applyEffectToPreview: (stream, eff, vid) => applyEffectToPreview(appEl, stream, eff, vid),
    navigate: (scr, d) => navigate(appEl, scr, d),
    setPeerVolume,
  };
}

function renderRoomViewContent(appEl, s) {
  loadPeerVolumes();
  const hasBackgroundBlur = isBackgroundEffectsSupported();
  const hasScreenShareSupport = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const customResult = getCustomBackgrounds();
  const backgroundImages = [...(customResult.success ? customResult.data : []), ...BACKGROUND_IMAGES];
  render(appEl, renderRoomView({
    ...s,
    myPeerId: selectors.selectMyPeerId(s),
    getJoinUrl,
    getStreamForPeerId,
    getStreamForScreenShare,
    hasBackgroundBlur,
    hasScreenShareSupport,
    unreadChatCount: selectors.selectUnreadChatCount(s),
    backgroundImages,
  }));
  attachRoomViewFromModule(appEl, getRoomViewDeps(appEl));
}

function setupRoomViewPostRender(appEl, s) {
  const myPeerId = selectors.selectMyPeerId(s);
  const localStream = selectors.selectLocalStream(s);
  if (localStream && myPeerId) attachRemoteAudio(myPeerId, localStream, appEl);
  selectors.selectRemoteStreams(s).forEach((stream, peerId) => {
    attachRemoteAudio(peerId, stream, appEl);
  });
  (selectors.selectVoipMembers(s) || []).forEach((m) => {
    const stream = getStreamForVideoTile(m.peerId);
    if (stream) attachRemoteAudio(m.peerId, stream, appEl);
  });
  if (selectors.selectSettingsPanelOpen(s)) refreshDeviceSelects(appEl);
  setupRoomViewDeviceHandlers(appEl, s);
}

function renderRoomViewScreen(appEl, s) {
  renderRoomViewContent(appEl, s);
  setupRoomViewPostRender(appEl, s);
}

function navigate(appEl, screen, data = {}) {
  patchState({ screen, ...data });
  const s = getState();
  switch (screen) {
    case 'landing': renderLandingScreen(appEl); break;
    case 'create-room': renderCreateRoomScreen(appEl); break;
    case 'create-room-success': renderCreateRoomSuccessScreen(appEl, s); break;
    case 'join-room': renderJoinRoomScreen(appEl, s); break;
    case 'room-view': renderRoomViewScreen(appEl, s); break;
    default: navigate(appEl, 'landing');
  }
}

function setupAudioTrackEndedHandler(appEl, audioTrack) {
  if (!audioTrack || audioTrack.readyState === 'ended') return;
  const wrapped = () => {
    audioTrack.removeEventListener?.('ended', wrapped);
    reacquireAudioStreamIfNeeded(appEl, attachRemoteAudio, (t) => setupAudioTrackEndedHandler(appEl, t));
  };
  audioTrack.addEventListener?.('ended', wrapped);
}

function getStreamForViewers() {
  const s = getState();
  if (!s.hostStream) return null;
  const videoTrack = s.hostStream.getVideoTracks()[0];
  const audioTracks = s.hostStream.getAudioTracks();
  const hasAudio = audioTracks.length > 0 && s.audioEnabled;
  return new MediaStream([videoTrack, ...(hasAudio ? audioTracks : [])]);
}

function createFrozenStream(video) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const buffer = document.createElement('canvas');
  buffer.width = w;
  buffer.height = h;
  const bufCtx = buffer.getContext('2d');
  bufCtx.drawImage(video, 0, 0, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(1);
  const interval = setInterval(() => ctx.drawImage(buffer, 0, 0, w, h), 500);
  return { stream, stop: () => clearInterval(interval) };
}

async function applyBlurEffect(sourceStream, previewVideo, showLoading, hideLoading) {
  showLoading();
  try {
    const { stream, stop } = await createBlurredStream(sourceStream, { blurAmount: 15 });
    previewVideo.srcObject = stream;
    patchState({ _previewEffectStop: stop });
  } catch {
    previewVideo.srcObject = sourceStream;
  } finally {
    hideLoading();
  }
}

async function applyVirtualBackgroundEffect(sourceStream, effect, previewVideo, showLoading, hideLoading) {
  const customResult = getCustomBackgrounds();
  const allBackgrounds = [...BACKGROUND_IMAGES, ...(customResult.success ? customResult.data : [])];
  const bg = allBackgrounds.find((b) => b.id === effect);
  if (!bg?.url) { previewVideo.srcObject = sourceStream; return; }
  showLoading();
  try {
    const { stream, stop } = await createVirtualBackgroundStream(sourceStream, bg.url);
    previewVideo.srcObject = stream;
    patchState({ _previewEffectStop: stop });
  } catch {
    previewVideo.srcObject = sourceStream;
  } finally {
    hideLoading();
  }
}

async function applyEffectToPreview(appEl, sourceStream, effect, previewVideo) {
  if (!previewVideo || !sourceStream?.getVideoTracks?.().length) return;
  const loadingEl = appEl.querySelector('#effect-preview-loading');
  const showLoading = () => loadingEl?.removeAttribute('hidden');
  const hideLoading = () => loadingEl?.setAttribute('hidden', '');
  try { selectors.selectPreviewEffectStop(getState())?.(); } catch (_) {}
  patchState({ _previewEffectStop: null });
  if (effect === 'blur' && isBackgroundEffectsSupported()) {
    await applyBlurEffect(sourceStream, previewVideo, showLoading, hideLoading);
  } else if (effect && effect !== 'none' && isBackgroundEffectsSupported()) {
    await applyVirtualBackgroundEffect(sourceStream, effect, previewVideo, showLoading, hideLoading);
  } else {
    previewVideo.srcObject = sourceStream;
  }
}

function setCreateRoomError(appEl, resultOrError) {
  const errorEl = appEl.querySelector('#create-error');
  const createBtn = appEl.querySelector('#create-room-btn');
  const msg = resultOrError?.error?.message ?? resultOrError?.message ?? t('error');
  if (errorEl) errorEl.textContent = msg;
  if (createBtn) { createBtn.disabled = false; createBtn.textContent = t('createRoom'); }
}

async function doCreateRoomApiAndSetup(appEl, nick, pwd, code) {
  const createResult = await fetchCreateRoom(pwd, code);
  if (!createResult.success) return createResult;
  const { roomId } = createResult.data;
  let p, id;
  try {
    const peerResult = await peer.createPeer();
    p = peerResult.peer;
    id = peerResult.id;
  } catch (e) {
    return err('PEER', e?.message ?? 'Peer-Verbindung fehlgeschlagen', e);
  }
  patchState({ peer: p });
  dispatch({ type: 'room/created', payload: { roomId, password: pwd, nickname: nick, peerId: id } });
  if (nick) writeNickname(nick);
  let participant;
  try {
    participant = await peer.setupRoomParticipant(p, nick, () => selectors.selectLocalStream(getState()), {
      dispatch,
      roomId,
      password: pwd,
      getLocalStream: () => selectors.selectLocalStream(getState()),
      getLocalBackgroundEffect: () => selectors.selectBackgroundEffect(getState()) || 'none',
      getMuted: () => selectors.selectIsMuted(getState()),
    });
  } catch (e) {
    rollbackFailedCreateState();
    return err('PEER', e?.message ?? 'Verbindung fehlgeschlagen', e);
  }
  patchState({ hostPeer: participant, viewerConn: participant });
  navigate(appEl, 'create-room-success');
  return { success: true, data: undefined };
}

async function handleCreateRoom(appEl, nickname, password, roomCode = '') {
  const createBtn = appEl.querySelector('#create-room-btn');
  const nick = (nickname ?? '').trim();
  const pwd = (password ?? '').toString().trim();
  const code = (roomCode ?? '').trim();
  if (createBtn) { createBtn.disabled = true; createBtn.textContent = t('creating'); }
  const result = await doCreateRoomApiAndSetup(appEl, nick, pwd, code);
  if (!result.success) setCreateRoomError(appEl, result);
}

function rollbackFailedJoinState() {
  dispatch({ type: 'room/joinAttemptAborted' });
}

function rollbackFailedCreateState() {
  dispatch({ type: 'room/createAttemptAborted' });
}

async function doJoinRoomApiAndSetup(appEl, roomId, password, nickname) {
  let p, id;
  try {
    const resolved = await peer.createPeer();
    p = resolved.peer;
    id = resolved.id;
  } catch (e) {
    return err('PEER', e?.message ?? 'Peer-Verbindung fehlgeschlagen', e);
  }
  dispatch({ type: 'room/joined', payload: { roomId, password, nickname: (nickname ?? '').trim(), peerId: id } });
  patchState({ peer: p });
  const nick = selectors.selectNickname(getState());
  if (nick) writeNickname(nick);
  const joinResult = await fetchJoinRoom(roomId, selectors.selectPassword(getState()), id);
  if (!joinResult.success) {
    rollbackFailedJoinState();
    return joinResult;
  }
  const actualRoomId = joinResult.data.roomId || roomId;
  patchState({ roomId: actualRoomId });
  let participant;
  try {
    participant = await peer.setupRoomParticipant(p, nick, null, {
      dispatch,
      roomId: actualRoomId,
      password: selectors.selectPassword(getState()),
      getLocalStream: () => selectors.selectLocalStream(getState()),
      getLocalBackgroundEffect: () => selectors.selectBackgroundEffect(getState()) || 'none',
      getMuted: () => selectors.selectIsMuted(getState()),
    });
  } catch (e) {
    rollbackFailedJoinState();
    return err('PEER', e?.message ?? 'Verbindung fehlgeschlagen', e);
  }
  patchState({ hostPeer: participant, viewerConn: participant });
  navigate(appEl, 'room-view');
  return { success: true, data: undefined };
}

async function handleJoinRoom(appEl, roomId, password, nickname) {
  const joinBtn = appEl.querySelector('#join-btn');
  joinBtn.disabled = true;
  joinBtn.textContent = t('connecting');
  const result = await doJoinRoomApiAndSetup(appEl, roomId, password, nickname);
  if (!result.success) {
    setJoinError(appEl, result.error?.message ?? t('joinFailed'));
    joinBtn.disabled = false;
    joinBtn.textContent = t('join');
  }
}

function loadPeerVolumes() {
  const volumes = readPeerVolumes();
  const state = getState();
  const next = new Map(selectors.selectPeerVolume(state));
  Object.entries(volumes).forEach(([k, v]) => next.set(k, v));
  patchState({ peerVolume: next });
}

function savePeerVolumes() {
  writePeerVolumes(Object.fromEntries(selectors.selectPeerVolume(getState())));
}

function setPeerVolume(peerId, percent) {
  const vol = Math.max(0, Math.min(200, percent)) / 100;
  const state = getState();
  const next = new Map(selectors.selectPeerVolume(state));
  next.set(peerId, percent);
  patchState({ peerVolume: next });
  savePeerVolumes();
  const container = document.getElementById('video-gallery') || document.getElementById('remote-audio-container');
  const tile = container?.querySelector(`.video-tile[data-peer-id="${peerId}"]`);
  const mediaEl = tile?.querySelector('video, audio');
  if (mediaEl) mediaEl.volume = Math.min(1, vol);
}

function handleStopScreen(appEl) {
  const s = getState();
  s.frozenStreamStop?.();
  selectors.selectHostStream(s)?.getTracks().forEach((t) => t.stop());
  const screenStreams = new Map(selectors.selectScreenStreams(s));
  const myPeerId = selectors.selectMyPeerId(s);
  screenStreams.delete(myPeerId);
  patchState({ frozenStream: null, frozenStreamStop: null, hostStream: null, paused: false, audioEnabled: true, hasAudio: false, screenStreams });
  selectors.selectHostPeer(s)?.clearScreenStream?.();
  selectors.selectHostPeer(s)?.broadcastScreenSharingStopped?.(myPeerId);
  const viewerScreenCall = s.viewerScreenCall;
  if (viewerScreenCall) {
    viewerScreenCall.close?.();
    patchState({ viewerScreenCall: null });
  }
  navigate(appEl, 'room-view');
}

/**
 * mediasoup: hostPeer und viewerConn zeigen auf dasselbe Participant-Objekt — nur einmal schließen.
 * Synchron ausführen (kein setTimeout), damit kein zweiter Join mit „hängender“ Session kollidiert.
 */
function closeActiveMediasoupParticipant() {
  const s = getState();
  const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
  if (!participant) return;
  try {
    participant.close?.();
  } catch (e) {
    console.warn('[easymeet] Participant schließen:', e?.message || e);
  }
  patchState({ hostPeer: null, viewerConn: null });
}

function cleanupAndNavigate(appEl, screen) {
  closeActiveMediasoupParticipant();
  finishCleanup(appEl, screen);
}

function stopAllStreamsAndConnections(s) {
  selectors.selectLocalStream(s)?.getTracks?.().forEach((t) => t.stop());
  selectors.selectHostStream(s)?.getTracks?.().forEach((t) => t.stop());
  s.viewerScreenCall?.close?.();
  s.frozenStreamStop?.();
  try { s.backgroundEffectStop?.(); } catch (_) {}
  selectors.selectPeer(s)?.destroy();
}

function removeDeviceChangeHandlers(s) {
  const deviceHandler = s._deviceChangeHandler;
  const callDeviceHandler = s._callDeviceChangeHandler;
  if (deviceHandler) {
    navigator.mediaDevices?.removeEventListener?.('devicechange', deviceHandler);
    patchState({ _deviceChangeHandler: null });
  }
  if (callDeviceHandler) {
    navigator.mediaDevices?.removeEventListener?.('devicechange', callDeviceHandler);
    patchState({ _callDeviceChangeHandler: null });
  }
}

function finishCleanup(appEl, screen) {
  const s = getState();
  stopAllStreamsAndConnections(s);
  dispatch({ type: 'session/cleared' });
  const audioContainer = document.getElementById('remote-audio-container');
  if (audioContainer) audioContainer.innerHTML = '';
  removeDeviceChangeHandlers(s);
  cleanupAllSpeakingIndicators();
  navigate(appEl, screen);
}

async function initFromUrl(appEl) {
  const params = new URLSearchParams(window.location.search);
  const join = params.get('join') || params.get('code');
  if (join) {
    const identifier = join.trim();
    if (identifier) {
      const statusResult = await fetchRoomStatus(identifier);
      const { exists, hasPassword } = statusResult.success ? statusResult.data : { exists: false, hasPassword: true };
      navigate(appEl, 'join-room', { joinRoomCode: identifier, joinRoomHasPassword: hasPassword });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
  }
  navigate(appEl, 'landing');
}

function setupBeforeUnload() {
  window.addEventListener('beforeunload', () => {
    const s = getState();
    const participant = selectors.selectHostPeer(s) || selectors.selectViewerConn(s);
    try {
      participant?.close?.();
    } catch (_) {}
    try { s.backgroundEffectStop?.(); } catch (_) {}
    selectors.selectLocalStream(s)?.getTracks?.().forEach((t) => t.stop());
    selectors.selectPeer(s)?.destroy?.();
  });
}

let lastMemberCount = 0;

function handleChatMessageMembers(p) {
  if (p.type === 'members' && Array.isArray(p.list)) {
    dispatch({ type: 'chat/membersUpdated', payload: { list: p.list } });
    return true;
  }
  return false;
}

function handleChatMessageNotification(appEl, state, p) {
  if ((p.type === 'chat' || p.type === 'file_share') && p.nick !== selectors.selectNickname(state)) {
    playMessageSound();
    const chatPanelOpen = appEl.querySelector('#chat-panel')?.classList.contains('chat-panel--open');
    const chatFloating = appEl.querySelector('.floating-window[data-window="chat"]');
    const chatVisible = chatPanelOpen || (chatFloating && !chatFloating.classList.contains('floating-window--hidden'));
    if (selectors.selectScreen(state) === 'room-view' && !chatVisible) {
      const unreadChatCount = selectors.selectUnreadChatCount(state) + 1;
      patchState({ unreadChatCount });
      updateChatBadge(appEl, unreadChatCount);
    }
  }
}

function handleChatMessageReceived(appEl, state, p) {
  if (handleChatMessageMembers(p)) return;
  handleChatMessageNotification(appEl, state, p);
  const members = state.members ?? [];
  if (p.type === 'join') {
    playJoinSound();
    if (p.nick && !members.includes(p.nick)) dispatch({ type: 'chat/membersUpdated', payload: { list: [...members, p.nick] } });
  } else if (p.type === 'leave') {
    dispatch({ type: 'chat/membersUpdated', payload: { list: members.filter((n) => n !== p.nick) } });
  }
  if (selectors.selectScreen(state) === 'room-view' && p.type !== 'members') {
    appendMessage(appEl, p, { receivedFileBlobs: selectors.selectReceivedFileBlobs(state), myNick: selectors.selectNickname(state) });
  }
}

function handleVoipMembersUpdated(p) {
  const list = p.members || p || [];
  const currentCount = list.length;
  if (currentCount > lastMemberCount) playJoinTone();
  else if (currentCount < lastMemberCount) playLeaveTone();
  lastMemberCount = currentCount;
  dispatch({ type: 'chat/membersUpdated', payload: { list: list.map((m) => m.nick).filter(Boolean) } });
}

function handleVoipRemoteStreamAdded(appEl, state, p) {
  attachRemoteAudio(p.peerId, p.stream, appEl);
  /* Consumers können kommen bevor #video-gallery existiert — alle Streams erneut an die Galerie hängen */
  if (selectors.selectScreen(state) === 'room-view') {
    const myPeerId = selectors.selectMyPeerId(state);
    const localStream = selectors.selectLocalStream(state);
    if (localStream && myPeerId) attachRemoteAudio(myPeerId, localStream, appEl);
    selectors.selectRemoteStreams(state).forEach((stream, peerId) => {
      attachRemoteAudio(peerId, stream, appEl);
    });
  }
  const voipMembers = selectors.selectVoipMembers(state);
  if (!voipMembers.some((m) => m.peerId === p.peerId)) {
    const members = state.members ?? [];
    dispatch({ type: 'voip/membersUpdated', payload: [{ peerId: p.peerId, nick: p.nick || (members[0] ?? '?') }, ...voipMembers] });
  }
}

function handleFileProgress(appEl, state, p) {
  let recv = state._receivingProgress;
  const now = Date.now();
  if (!recv) {
    recv = { lastBytes: 0, lastTime: now, speed: 0 };
    patchState({ _receivingProgress: recv, _receivingTotal: p.total, _receivingFromNick: p.nick || '?' });
    updateReceivingProgress(appEl, p.filename, 0, p.total, 0, null, p.nick || '?');
  } else {
    if (p.total && p.total !== state._receivingTotal) patchState({ _receivingTotal: p.total });
    const elapsed = (now - recv.lastTime) / 1000;
    const speedKbps = elapsed >= 0.15 ? (p.bytesReceived - recv.lastBytes) / elapsed / 1024 : recv.speed;
    if (elapsed >= 0.15) {
      recv.lastBytes = p.bytesReceived;
      recv.lastTime = now;
      recv.speed = speedKbps;
    }
    updateReceivingProgress(appEl, p.filename, p.bytesReceived, p.total, speedKbps, null, p.nick || '?');
  }
}

function handleVoipOrRoomUpdate(appEl, state) {
  if (selectors.selectScreen(state) !== 'room-view') return;
  updateVoipParticipants(
    appEl,
    selectors.selectVoipMembers(state),
    selectors.selectMyPeerId(state),
    selectors.selectIsMuted(state),
    selectors.selectScreenStreams(state),
    getStreamForPeerId,
    getStreamForScreenShare,
    selectors.selectPeerMuteState(state),
    selectors.selectPeerVolume(state),
    selectors.selectBackgroundEffect(state),
    selectors.selectPeerVideoState(state),
    selectors.selectIsVideoEnabled(state),
    selectors.selectPeerBackgroundEffect(state)
  );
}

function dispatchVoipEvent(appEl, state, evt, p) {
  if (evt === 'voip/membersUpdated') handleVoipMembersUpdated(p);
  if (evt === 'voip/remoteStreamAdded') handleVoipRemoteStreamAdded(appEl, state, p);
  if (evt === 'voip/remoteStreamEnded') { detachRemoteAudio(p.peerId); stopSpeakingIndicator(p.peerId); }
  if (evt === 'voip/muteReceived' || evt === 'voip/videoStateUpdated') {
    const stream = selectors.selectRemoteStreams(state).get(p.peerId) || getStreamForPeerId(p.peerId);
    if (stream) attachRemoteAudio(p.peerId, stream, appEl);
  }
  if (evt === 'voip/screenStreamStarted') {
    if (p.peerId !== selectors.selectMyPeerId(state)) playStreamStartTone();
    if (selectors.selectScreen(state) === 'room-view') navigate(appEl, 'room-view');
  }
  if (evt === 'voip/screenStreamStopped' && selectors.selectScreen(state) === 'room-view') navigate(appEl, 'room-view');
}

function dispatchFileEvent(appEl, state, evt, p) {
  if (evt === 'file/received') {
    hideReceivingProgress(appEl);
    if (p.fileId && selectors.selectScreen(state) === 'room-view') updateFileShareMessage(appEl, p.fileId, p.filename, p.fromNick);
  }
  if (evt === 'file/progress') handleFileProgress(appEl, state, p);
}

function createSubscriptionHandler(appEl) {
  return (state, event) => {
    if (!event?.type) return;
    const evt = event.type;
    const p = event.payload;
    if (evt === 'chat/messageReceived') handleChatMessageReceived(appEl, state, p);
    dispatchVoipEvent(appEl, state, evt, p);
    dispatchFileEvent(appEl, state, evt, p);
    if (evt.startsWith('voip/') || evt === 'room/joined' || evt === 'room/created') handleVoipOrRoomUpdate(appEl, state);
  };
}

function setupSubscribe(appEl) {
  subscribe(createSubscriptionHandler(appEl));
}
