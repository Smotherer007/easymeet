/**
 * Initialer App-State – Plain Data.
 */
import { WINDOW_POSITION_DEFAULTS } from "../../shared/windowPositionsDefaults.js";
import { DEFAULT_AUDIO_SETTINGS } from "../../effects/storage/audioSettingsStorage.js";

/** @typedef {Object} AppState */

/**
 * @returns {AppState}
 */
export function createInitialState() {
	return {
		screen: "landing",
		roomId: null,
		password: null,
		nickname: null,
		isHost: false,
		peer: null,
		hostPeer: null,
		viewerConn: null,
		localStream: null,
		baseLocalStream: null,
		backgroundEffect: "none",
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
		audioEnabled: true,
		hasAudio: false,
		isMuted: false,
		outputDeviceId: null,
		inputDeviceId: null,
		videoDeviceId: null,
		audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
		_receivingProgress: null,
		_receivingFileId: null,
		_receivingTotal: null,
		_receivingFromNick: null,
		_deviceChangeHandler: null,
		_callDeviceChangeHandler: null,
		_previewEffectStop: null,
		_previewStream: null,
		settingsPanelOpen: false,
		joinRoomCode: null,
		joinRoomHasPassword: true,
		videoLayoutMode: "grid",
		videoTilePositions: {},
		/** Free layout: floating chat / participants / videos (persists across room-view re-renders) */
		freeLayoutChatOpen: false,
		freeLayoutParticipantsOpen: false,
		freeLayoutVideosOpen: true,
		windowPositions: { ...WINDOW_POSITION_DEFAULTS }
	};
}
