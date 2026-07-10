/**
 * App reducer – pure: (state, event) -> nextState.
 * No I/O, deterministic.
 *
 * Note: `new MediaStream()` on room/joined|created is intentional — empty placeholder
 * until effects run getUserMedia (host API object, no network I/O).
 */

import { createInitialState } from "./initialState.js";
import { getSessionResetSlice, getJoinAttemptRollbackSlice } from "./sessionResetSlice.js";

function reduceNavigationScreen(state, payload) {
	const p = { ...(payload ?? {}) };
	const screen = p.screen;
	delete p.screen;
	return { ...state, screen: screen ?? state.screen, ...p };
}

function reduceRoomEntered(state, payload, isHost) {
	const p = payload ?? {};
	const nick = p.nickname ?? state.nickname;
	const voip = [{ peerId: p.peerId, nick }].filter((m) => m.peerId);
	return {
		...state,
		roomId: p.roomId ?? state.roomId,
		password: p.password ?? state.password,
		nickname: nick,
		messages: [],
		members: [nick].filter(Boolean),
		voipMembers: voip,
		roomPolls: [],
		myHandRaised: false,
		/** Start unmuted — otherwise ensureInitialCallMedia skips mic (mediasoup: no audio producer). User can mute. */
		isMuted: false,
		peerMuteState: new Map([[p.peerId, false]]),
		localStream: new MediaStream(),
		baseLocalStream: new MediaStream(),
		isHost,
		roomRole: p.role ?? "user",
		isVideoEnabled: false,
		hasVideoSupport: false,
		unreadChatCount: 0,
		freeLayoutChatOpen: false,
		freeLayoutParticipantsOpen: false,
		freeLayoutVideosOpen: false
	};
}

function reduceRoomCreated(state, payload) {
	return reduceRoomEntered(state, payload, true);
}

function reduceRoomJoined(state, payload) {
	return reduceRoomEntered(state, payload, false);
}

function reduceChatMessageReceived(state, payload) {
	if (!payload) return state;
	const messages = [...(state.messages ?? []), payload];
	return { ...state, messages };
}

function reduceChatHistoryRestored(state, payload) {
	const list = payload?.messages;
	if (!Array.isArray(list) || !list.length) return state;
	return { ...state, messages: list };
}

function reduceChatMembersUpdated(state, payload) {
	const list = payload?.list ?? [];
	return { ...state, members: list };
}

function reduceVoipMembersUpdated(state, payload) {
	const raw = payload;
	const list = Array.isArray(raw) ? raw : Array.isArray(raw?.members) ? raw.members : [];
	const ids = new Set(list.map((m) => m.peerId).filter(Boolean));

	const nextMute = new Map(state.peerMuteState ?? new Map());
	const nextVideo = new Map(state.peerVideoState ?? new Map());
	const nextBg = new Map(state.peerBackgroundEffect ?? new Map());

	for (const m of list) {
		if (!m.peerId) continue;
		if (m.muted !== undefined) nextMute.set(m.peerId, !!m.muted);
		if (m.videoEnabled !== undefined) nextVideo.set(m.peerId, !!m.videoEnabled);
		if (m.backgroundEffect !== undefined) nextBg.set(m.peerId, m.backgroundEffect ?? "none");
	}
	for (const k of [...nextMute.keys()]) {
		if (!ids.has(k)) nextMute.delete(k);
	}
	for (const k of [...nextVideo.keys()]) {
		if (!ids.has(k)) nextVideo.delete(k);
	}
	for (const k of [...nextBg.keys()]) {
		if (!ids.has(k)) nextBg.delete(k);
	}

	return {
		...state,
		voipMembers: list,
		peerMuteState: nextMute,
		peerVideoState: nextVideo,
		peerBackgroundEffect: nextBg
	};
}

function reduceRoomLeave(state, payload) {
	const { peerId } = payload ?? {};
	if (!peerId) return state;
	const voipMembers = (state.voipMembers ?? []).filter((m) => m.peerId !== peerId);
	return { ...state, voipMembers };
}

function reduceRoomMemberJoined(state, payload) {
	const { peerId, nick } = payload ?? {};
	if (!peerId) return state;
	const exists = (state.voipMembers ?? []).some((m) => m.peerId === peerId);
	if (exists) return state;
	return { ...state, voipMembers: [...(state.voipMembers ?? []), { peerId, nick: nick ?? "?", handRaised: false }] };
}

function reduceVoipMuteReceived(state, payload) {
	const { peerId, muted, isMuted } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.peerMuteState ?? new Map());
	next.set(peerId, isMuted ?? muted ?? false);
	return { ...state, peerMuteState: next };
}

function reduceVoipMuteToggled(state) {
	const next = new Map(state.peerMuteState ?? new Map());
	if (state.peer?.id) next.set(state.peer.id, !state.isMuted);
	return { ...state, isMuted: !state.isMuted, peerMuteState: next };
}

function reduceVoipScreenStreamStarted(state, payload) {
	const { peerId, nick, stream } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.screenStreams ?? new Map());
	const prevStream = next.get(peerId)?.stream ?? null;
	next.set(peerId, { stream: stream !== undefined ? stream : prevStream, nick: nick ?? "?" });
	return { ...state, screenStreams: next };
}

function reduceVoipScreenStreamStopped(state, payload) {
	const { peerId } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.screenStreams ?? new Map());
	next.delete(peerId);
	return { ...state, screenStreams: next };
}

function reduceVoipRemoteStreamAdded(state, payload) {
	const { peerId, stream } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.remoteStreams ?? new Map());
	next.set(peerId, stream);
	return { ...state, remoteStreams: next };
}

function reduceVoipRemoteStreamEnded(state, payload) {
	const { peerId } = payload ?? {};
	if (!peerId) return state;
	const streams = new Map(state.remoteStreams ?? new Map());
	streams.delete(peerId);
	const videos = new Map(state.peerVideoState ?? new Map());
	videos.delete(peerId);
	const effects = new Map(state.peerBackgroundEffect ?? new Map());
	effects.delete(peerId);
	return { ...state, remoteStreams: streams, peerVideoState: videos, peerBackgroundEffect: effects };
}

function reduceVoipVideoStateUpdated(state, payload) {
	const { peerId, videoEnabled, isVideoEnabled } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.peerVideoState ?? new Map());
	next.set(peerId, isVideoEnabled ?? videoEnabled ?? false);
	return { ...state, peerVideoState: next };
}

function reduceVoipBackgroundEffectUpdated(state, payload) {
	const { peerId, effect } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.peerBackgroundEffect ?? new Map());
	next.set(peerId, effect ?? "none");
	return { ...state, peerBackgroundEffect: next };
}

function reduceFileReceived(state, payload) {
	const { filename, fileId, fromNick, blob, mimeType } = payload ?? {};
	const blobs = new Map(state.receivedFileBlobs ?? new Map());
	if (fileId && blob) blobs.set(fileId, { blob, filename, mimeType });
	const files = [...(state.receivedFiles ?? []), { filename, at: Date.now() }];
	return {
		...state,
		receivedFiles: files,
		receivedFileBlobs: blobs,
		_receivingProgress: null,
		_receivingFileId: null,
		_receivingTotal: null,
		_receivingFromNick: null
	};
}

function reduceFileProgressCleared(state) {
	return {
		...state,
		_receivingProgress: null,
		_receivingFileId: null,
		_receivingTotal: null,
		_receivingFromNick: null
	};
}

function reducePeerVolumeChanged(state, payload) {
	const { peerId, percent } = payload ?? {};
	if (!peerId) return state;
	const next = new Map(state.peerVolume ?? new Map());
	next.set(peerId, Math.max(0, Math.min(200, percent)));
	return { ...state, peerVolume: next };
}

function reduceMediaStreamUpdated(state, payload) {
	const { localStream, baseLocalStream } = payload ?? {};
	return {
		...state,
		...(localStream !== undefined ? { localStream } : {}),
		...(baseLocalStream !== undefined ? { baseLocalStream } : {})
	};
}

function reduceMediaMuteSet(state, payload) {
	const { isMuted, localStream, baseLocalStream } = payload ?? {};
	const peerMuteState = new Map(state.peerMuteState ?? new Map());
	if (state.peer?.id) peerMuteState.set(state.peer.id, isMuted);
	return {
		...state,
		isMuted,
		peerMuteState,
		...(localStream !== undefined ? { localStream } : {}),
		...(baseLocalStream !== undefined ? { baseLocalStream } : {})
	};
}

function reduceMediaVideoSet(state, payload) {
	const { isVideoEnabled, hasVideoSupport, localStream, baseLocalStream, videoDeviceId } = payload ?? {};
	return {
		...state,
		...(isVideoEnabled !== undefined ? { isVideoEnabled } : {}),
		...(hasVideoSupport !== undefined ? { hasVideoSupport } : {}),
		...(localStream !== undefined ? { localStream } : {}),
		...(baseLocalStream !== undefined ? { baseLocalStream } : {}),
		...(videoDeviceId !== undefined ? { videoDeviceId } : {})
	};
}

function reduceMediaDeviceChanged(state, payload) {
	const { inputDeviceId, outputDeviceId, videoDeviceId } = payload ?? {};
	return {
		...state,
		...(inputDeviceId !== undefined ? { inputDeviceId } : {}),
		...(outputDeviceId !== undefined ? { outputDeviceId } : {}),
		...(videoDeviceId !== undefined ? { videoDeviceId } : {})
	};
}

function reduceMediaBackgroundEffectSet(state, payload) {
	const { effect } = payload ?? {};
	return { ...state, backgroundEffect: effect ?? "none" };
}

function reduceMediaScreenSharingStarted(state, payload) {
	const { hostStream, hasAudio, audioEnabled } = payload ?? {};
	const screenStreams = new Map(state.screenStreams ?? new Map());
	if (state.peer?.id) screenStreams.set(state.peer.id, { stream: hostStream, nick: state.nickname ?? "?" });
	return { ...state, hostStream, hasAudio: hasAudio ?? false, audioEnabled: audioEnabled ?? true, screenStreams };
}

function reduceMediaScreenSharingStopped(state) {
	const screenStreams = new Map(state.screenStreams ?? new Map());
	if (state.peer?.id) screenStreams.delete(state.peer.id);
	return {
		...state,
		hostStream: null,
		hasAudio: false,
		audioEnabled: true,
		screenStreams,
		viewerScreenCall: null
	};
}

function reduceUiUnreadCountCleared(state) {
	return { ...state, unreadChatCount: 0 };
}

function reduceUiSettingsPanelToggled(state, payload) {
	return { ...state, settingsPanelOpen: payload?.isOpen ?? !state.settingsPanelOpen };
}

function reduceRoomReaction(state, payload) {
	const { peerId, emoji } = payload ?? {};
	if (!peerId || !emoji) return state;
	return {
		...state,
		_reactionNonce: (state._reactionNonce ?? 0) + 1,
		_reactionLast: { peerId, emoji }
	};
}

function reduceRoomPollsSet(state, payload) {
	const polls = payload?.polls;
	if (!Array.isArray(polls)) return state;
	return { ...state, roomPolls: polls };
}

function reduceRoomPollUpsert(state, payload) {
	const poll = payload?.poll;
	if (!poll?.id) return state;
	const list = [...(state.roomPolls ?? [])];
	const i = list.findIndex((p) => p.id === poll.id);
	if (i >= 0) list[i] = poll;
	else list.push(poll);
	return { ...state, roomPolls: list };
}

function reduceRoomRoleUpdated(state, payload) {
	return { ...state, roomRole: payload?.role ?? state.roomRole ?? "user" };
}

function reduceRoomSettingsUpdated(state, payload) {
	const p = payload ?? null;
	return { ...state, roomSettings: p };
}

function reduceAdminServerStatusUpdated(state, payload) {
	return { ...state, isServerAdmin: !!payload?.isServerAdmin };
}

function reduceRoomHandRaised(state, payload) {
	const { peerId, raised } = payload ?? {};
	const myId = state.peer?.id;
	if (!peerId || peerId !== myId) return state;
	return { ...state, myHandRaised: !!raised };
}

function reducePeerConnectionEstablished(state, payload) {
	const { peer: peerObj, hostPeer, viewerConn, roomId } = payload ?? {};
	return {
		...state,
		...(peerObj !== undefined ? { peer: peerObj } : {}),
		...(hostPeer !== undefined ? { hostPeer } : {}),
		...(viewerConn !== undefined ? { viewerConn } : {}),
		...(roomId !== undefined ? { roomId } : {})
	};
}

function reduceFileProgress(state, payload) {
	const p = payload ?? {};
	const now = Date.now();
	let recv = state._receivingProgress;
	if (!recv) {
		recv = { lastBytes: 0, lastTime: now, speed: 0 };
		return {
			...state,
			_receivingProgress: { ...recv },
			_receivingTotal: p.total,
			_receivingFromNick: p.nick || "?"
		};
	}
	let nextTotal = state._receivingTotal;
	if (p.total && p.total !== state._receivingTotal) nextTotal = p.total;
	const elapsed = (now - recv.lastTime) / 1000;
	const br = p.bytesReceived ?? 0;
	const speedKbps = elapsed >= 0.15 ? (br - recv.lastBytes) / elapsed / 1024 : recv.speed;
	let nextRecv = recv;
	if (elapsed >= 0.15) {
		nextRecv = {
			...recv,
			lastBytes: br,
			lastTime: now,
			speed: speedKbps
		};
	}
	return {
		...state,
		_receivingProgress: nextRecv,
		_receivingTotal: nextTotal
	};
}

function reduceStorageDevicesRestored(state, payload) {
	const p = payload ?? {};
	const next = { ...state };
	if (p.inputDeviceId !== undefined) next.inputDeviceId = p.inputDeviceId;
	if (p.outputDeviceId !== undefined) next.outputDeviceId = p.outputDeviceId;
	if (p.videoDeviceId !== undefined) next.videoDeviceId = p.videoDeviceId;
	return next;
}

function reduceStorageVideoLayoutRestored(state, payload) {
	const mode = payload?.videoLayoutMode;
	if (mode !== "free" && mode !== "grid") return state;
	return { ...state, videoLayoutMode: mode };
}

function reduceStorageWindowPositionsRestored(state, payload) {
	const pos = payload?.windowPositions;
	if (!pos || typeof pos !== "object") return state;
	return { ...state, windowPositions: pos };
}

function reduceStorageAudioSettingsRestored(state, payload) {
	const a = payload?.audioSettings;
	if (!a || typeof a !== "object") return state;
	return { ...state, audioSettings: a };
}

function reduceStorageBackgroundEffectsSettingsRestored(state, payload) {
	const v = payload?.backgroundEffectsSettings;
	if (!v || typeof v !== "object") return state;
	return { ...state, backgroundEffectsSettings: v };
}

function reduceUiBackgroundEffectsSettingsSet(state, payload) {
	const v = payload?.backgroundEffectsSettings;
	if (!v || typeof v !== "object") return state;
	return { ...state, backgroundEffectsSettings: v };
}

function reducePeerVolumesMerged(state, payload) {
	const vols = payload?.volumes;
	if (!vols || typeof vols !== "object") return state;
	const next = new Map(state.peerVolume ?? new Map());
	Object.entries(vols).forEach(([k, v]) => next.set(k, v));
	return { ...state, peerVolume: next };
}

function reduceUnreadChatIncremented(state, payload) {
	const delta = payload?.delta ?? 1;
	return { ...state, unreadChatCount: (state.unreadChatCount ?? 0) + delta };
}

function reduceEffectsCallDeviceChangeHandler(state, payload) {
	return { ...state, _callDeviceChangeHandler: payload?.handler ?? null };
}

function reduceEffectsDeviceChangeHandler(state, payload) {
	return { ...state, _deviceChangeHandler: payload?.handler ?? null };
}

function reduceEffectsPreviewEffectStop(state, payload) {
	return { ...state, _previewEffectStop: payload?.stop ?? null };
}

function reduceSessionCleared(state) {
	return { ...state, ...getSessionResetSlice() };
}

function reduceCallSetupAborted(state) {
	return { ...state, ...getJoinAttemptRollbackSlice() };
}

const HANDLERS = {
	"navigation/screen": reduceNavigationScreen,
	"room/created": reduceRoomCreated,
	"room/joined": reduceRoomJoined,
	"room/join": (s) => s,
	"room/leave": reduceRoomLeave,
	"room/memberJoined": reduceRoomMemberJoined,
	"session/cleared": reduceSessionCleared,
	"room/joinAttemptAborted": reduceCallSetupAborted,
	"room/createAttemptAborted": reduceCallSetupAborted,
	"chat/messageReceived": reduceChatMessageReceived,
	"chat/historyRestored": reduceChatHistoryRestored,
	"chat/membersUpdated": reduceChatMembersUpdated,
	"voip/membersUpdated": reduceVoipMembersUpdated,
	"voip/muteReceived": reduceVoipMuteReceived,
	"voip/muteToggled": reduceVoipMuteToggled,
	"voip/screenStreamStarted": reduceVoipScreenStreamStarted,
	"voip/screenStreamStopped": reduceVoipScreenStreamStopped,
	"voip/remoteStreamAdded": reduceVoipRemoteStreamAdded,
	"voip/remoteStreamEnded": reduceVoipRemoteStreamEnded,
	"voip/videoStateUpdated": reduceVoipVideoStateUpdated,
	"voip/backgroundEffectUpdated": reduceVoipBackgroundEffectUpdated,
	"file/received": reduceFileReceived,
	"file/progress": reduceFileProgress,
	"file/progressCleared": reduceFileProgressCleared,
	"peer/volumeChanged": reducePeerVolumeChanged,
	"media/streamUpdated": reduceMediaStreamUpdated,
	"media/muteSet": reduceMediaMuteSet,
	"media/videoSet": reduceMediaVideoSet,
	"media/deviceChanged": reduceMediaDeviceChanged,
	"media/backgroundEffectSet": reduceMediaBackgroundEffectSet,
	"media/screenSharingStarted": reduceMediaScreenSharingStarted,
	"media/screenSharingStopped": reduceMediaScreenSharingStopped,
	"ui/unreadCountCleared": reduceUiUnreadCountCleared,
	"ui/settingsPanelToggled": reduceUiSettingsPanelToggled,
	"peer/connectionEstablished": reducePeerConnectionEstablished,
	"room/reaction": reduceRoomReaction,
	"room/pollsSet": reduceRoomPollsSet,
	"room/pollUpsert": reduceRoomPollUpsert,
	"room/roleUpdated": reduceRoomRoleUpdated,
	"room/settingsUpdated": reduceRoomSettingsUpdated,
	"room/handRaisedSelf": reduceRoomHandRaised,
	"admin/serverStatusUpdated": reduceAdminServerStatusUpdated,
	"storage/devicesRestored": reduceStorageDevicesRestored,
	"storage/videoLayoutRestored": reduceStorageVideoLayoutRestored,
	"storage/windowPositionsRestored": reduceStorageWindowPositionsRestored,
	"storage/audioSettingsRestored": reduceStorageAudioSettingsRestored,
	"storage/backgroundEffectsSettingsRestored": reduceStorageBackgroundEffectsSettingsRestored,
	"ui/backgroundEffectsSettingsSet": reduceUiBackgroundEffectsSettingsSet,
	"peer/volumesMerged": reducePeerVolumesMerged,
	"ui/unreadChatIncremented": reduceUnreadChatIncremented,
	"effects/callDeviceChangeHandler": reduceEffectsCallDeviceChangeHandler,
	"effects/deviceChangeHandler": reduceEffectsDeviceChangeHandler,
	"effects/previewEffectStop": reduceEffectsPreviewEffectStop,
	"cleanup/finished": () => createInitialState()
};

/**
 * @param {AppState} state
 * @param {AppEvent} event
 * @returns {AppState}
 */
export function appReducer(state, event) {
	if (!event?.type) return state;
	const handler = HANDLERS[event.type];
	if (!handler) return state;
	return handler(state, event.payload);
}
