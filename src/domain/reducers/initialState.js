/**
 * Initialer App-State – Plain Data.
 */
import { WINDOW_POSITION_DEFAULTS } from '../../shared/windowPositionsDefaults.js';

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
    windowPositions: { ...WINDOW_POSITION_DEFAULTS },
  };
}
