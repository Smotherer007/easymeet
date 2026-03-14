/**
 * Initialer App-State – Plain Data.
 */

/** @typedef {Object} AppState */

/**
 * @returns {AppState}
 */
export function createInitialState() {
  return {
    screen: 'landing',
    roomId: null,
    password: null,
    nickname: null,
    isHost: false,
    peer: null,
    hostPeer: null,
    viewerConn: null,
    localStream: null,
    baseLocalStream: null,
    backgroundEffect: 'none',
    backgroundEffectStop: null,
    messages: [],
    unreadChatCount: 0,
    members: [],
    voipMembers: [],
    sharedFiles: [],
    receivedFiles: [],
    receivedFileBlobs: new Map(),
    peerMuteState: new Map(),
    peerVideoState: new Map(),
    peerBackgroundEffect: new Map(),
    peerVolume: new Map(),
    hostStream: null,
    screenStreams: new Map(),
    remoteStreams: new Map(),
    viewerScreenCall: null,
    frozenStream: null,
    frozenStreamStop: null,
    paused: false,
    audioEnabled: true,
    hasAudio: false,
    isMuted: false,
    outputDeviceId: null,
    inputDeviceId: null,
    videoDeviceId: null,
    _receivingProgress: null,
    _receivingFileId: null,
    _receivingTotal: null,
    _receivingFromNick: null,
    _deviceChangeHandler: null,
    settingsPanelOpen: false,
    joinRoomCode: null,
    joinRoomHasPassword: true,
    videoLayoutMode: 'grid',
    videoTilePositions: {},
    windowPositions: {
      videos: { x: 20, y: 80, w: 560, h: 420 },
      chat: { x: 520, y: 80, w: 380, h: 450 },
      participants: { x: 520, y: 380, w: 280, h: 300 },
      stream: { x: 100, y: 100, w: 800, h: 500 },
      settings: { x: 100, y: 80, w: 560, h: 520 },
      share: { x: 120, y: 100, w: 420, h: 520 },
    },
  };
}
