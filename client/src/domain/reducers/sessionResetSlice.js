/**
 * Pure state slice: after leaving the call / tearing down the media session.
 * No I/O — plain data only for reducer or targeted patchState (rollback).
 */

/**
 * @returns {Record<string, unknown>}
 */
export function getSessionResetSlice() {
	return {
		localStream: null,
		hostStream: null,
		screenStreams: new Map(),
		remoteStreams: new Map(),
		viewerScreenCall: null,
		backgroundEffectStop: null,
		backgroundEffect: "none",
		baseLocalStream: null,
		settingsPanelOpen: false,
		peer: null,
		hostPeer: null,
		viewerConn: null,
		roomId: null,
		password: null,
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
		isHost: false,
		isMuted: false,
		isVideoEnabled: false,
		hasVideoSupport: false,
		freeLayoutChatOpen: false,
		freeLayoutParticipantsOpen: false,
		freeLayoutVideosOpen: false,
		_deviceChangeHandler: null,
		_callDeviceChangeHandler: null,
		_previewEffectStop: null,
		_previewStream: null
	};
}

/**
 * Fehlgeschlagener Join/Create nach room/joined bzw. room/created — ohne vollen Session-Reset der UI.
 * @returns {Record<string, unknown>}
 */
export function getJoinAttemptRollbackSlice() {
	return {
		peer: null,
		roomId: null,
		password: null,
		voipMembers: [],
		members: [],
		localStream: null,
		baseLocalStream: null,
		peerMuteState: new Map(),
		remoteStreams: new Map(),
		messages: [],
		unreadChatCount: 0,
		isHost: false
	};
}
