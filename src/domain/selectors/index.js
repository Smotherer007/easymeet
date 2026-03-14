/**
 * Selectors – UI reads state only through selectors.
 * Pure functions, no side effects.
 */

/**
 * @param {AppState} state
 * @returns {string}
 */
export function selectScreen(state) {
  return state.screen ?? 'landing';
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectRoomId(state) {
  return state.roomId ?? null;
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectNickname(state) {
  return state.nickname ?? null;
}

/**
 * @param {AppState} state
 * @returns {string}
 */
export function selectMyPeerId(state) {
  return state.peer?.id ?? '';
}

/**
 * @param {AppState} state
 * @returns {Array}
 */
export function selectMessages(state) {
  return state.messages ?? [];
}

/**
 * @param {AppState} state
 * @returns {Array}
 */
export function selectVoipMembers(state) {
  return state.voipMembers ?? [];
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectScreenStreams(state) {
  return state.screenStreams ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectPeerMuteState(state) {
  return state.peerMuteState ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectPeerVolume(state) {
  return state.peerVolume ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectIsMuted(state) {
  return state.isMuted ?? false;
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectReceivedFileBlobs(state) {
  return state.receivedFileBlobs ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectIsHost(state) {
  return state.isHost ?? false;
}

/**
 * @param {AppState} state
 * @returns {MediaStream|null}
 */
export function selectHostStream(state) {
  return state.hostStream ?? null;
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectPaused(state) {
  return state.paused ?? false;
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectAudioEnabled(state) {
  return state.audioEnabled ?? true;
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectHasAudio(state) {
  return state.hasAudio ?? false;
}

/**
 * @param {AppState} state
 * @param {string} peerId
 * @returns {MediaStream|null}
 */
export function selectStreamForPeerId(state, peerId) {
  if (peerId === state.peer?.id) {
    return state.paused && state.frozenStream ? state.frozenStream : state.hostStream;
  }
  return state.screenStreams?.get(peerId)?.stream ?? null;
}

/**
 * @param {AppState} state
 * @returns {Object}
 */
export function selectPeer(state) {
  return state.peer ?? null;
}

/**
 * @param {AppState} state
 * @returns {Object|null}
 */
export function selectHostPeer(state) {
  return state.hostPeer ?? null;
}

/**
 * @param {AppState} state
 * @returns {Object|null}
 */
export function selectViewerConn(state) {
  return state.viewerConn ?? null;
}

/**
 * @param {AppState} state
 * @returns {MediaStream|null}
 */
export function selectLocalStream(state) {
  return state.localStream ?? null;
}

/**
 * @param {AppState} state
 * @returns {MediaStream|null}
 */
export function selectBaseLocalStream(state) {
  return state.baseLocalStream ?? null;
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectIsVideoEnabled(state) {
  return state.isVideoEnabled ?? false;
}

/**
 * @param {AppState} state
 * @returns {string}
 */
export function selectBackgroundEffect(state) {
  return state.backgroundEffect ?? 'none';
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectPeerBackgroundEffect(state) {
  return state.peerBackgroundEffect ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {Map}
 */
export function selectPeerVideoState(state) {
  return state.peerVideoState ?? new Map();
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectSettingsPanelOpen(state) {
  return state.settingsPanelOpen ?? false;
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectVideoDeviceId(state) {
  return state.videoDeviceId ?? null;
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectInputDeviceId(state) {
  return state.inputDeviceId ?? null;
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectOutputDeviceId(state) {
  return state.outputDeviceId ?? null;
}

/**
 * @param {AppState} state
 * @returns {boolean}
 */
export function selectHasVideoSupport(state) {
  return state.hasVideoSupport ?? false;
}

/**
 * @param {AppState} state
 * @returns {Object}
 */
export function selectWindowPositions(state) {
  return state.windowPositions ?? {};
}

/**
 * @param {AppState} state
 * @returns {string}
 */
export function selectVideoLayoutMode(state) {
  return state.videoLayoutMode ?? 'grid';
}

/**
 * @param {AppState} state
 * @returns {Object}
 */
export function selectVideoTilePositions(state) {
  return state.videoTilePositions ?? {};
}

/**
 * @param {AppState} state
 * @returns {string|null}
 */
export function selectPassword(state) {
  return state.password ?? null;
}

/**
 * @param {AppState} state
 * @returns {number}
 */
export function selectUnreadChatCount(state) {
  return state.unreadChatCount ?? 0;
}

/**
 * @param {AppState} state
 * @param {string} peerId
 * @returns {string}
 */
export function selectNickForPeerId(state, peerId) {
  const fromScreen = state.screenStreams?.get(peerId)?.nick;
  if (fromScreen) return fromScreen;
  const member = (state.voipMembers ?? []).find((m) => m.peerId === peerId);
  return member?.nick ?? '?';
}

/**
 * @param {AppState} state
 * @param {string} fileId
 * @returns {{ blob: Blob; filename: string; mimeType?: string }|undefined}
 */
export function selectReceivedFileBlob(state, fileId) {
  return state.receivedFileBlobs?.get(fileId);
}

/**
 * @param {AppState} state
 * @param {string} peerId
 * @returns {number}
 */
export function selectPeerVolumeFor(state, peerId) {
  return state.peerVolume?.get(peerId) ?? 100;
}

/**
 * @param {AppState} state
 * @returns {Map<string, MediaStream>}
 */
export function selectRemoteStreams(state) {
  return state.remoteStreams ?? new Map();
}

/** @param {AppState} state @returns {Function|undefined} */
export function selectPreviewEffectStop(state) {
  return state._previewEffectStop;
}

/** @param {AppState} state @returns {MediaStream|undefined} */
export function selectPreviewStream(state) {
  return state._previewStream;
}

/** @param {AppState} state @returns {Function|undefined} */
export function selectDeviceChangeHandler(state) {
  return state._deviceChangeHandler;
}

/** @param {AppState} state @returns {Function|undefined} */
export function selectCallDeviceChangeHandler(state) {
  return state._callDeviceChangeHandler;
}
