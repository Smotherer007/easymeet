/**
 * Store-Subscription: Chat, VoIP und Datei-Events → DOM / Sounds.
 */

import { playMessageSound, playJoinSound, playScreenShareSound } from "../../sounds.js";
import { playLeaveTone } from "../../audio.js";
import { stopSpeakingIndicator } from "../../speaking-indicator.js";
import { appendMessage, updateVoipParticipants, updateChatBadge, updateFileShareMessage, updateReceivingProgress, hideReceivingProgress } from "../../ui/screens/index.js";
import { attachRemoteAudio, detachRemoteAudio, getStreamForVideoTile, getStreamForPeerId, getStreamForScreenShare } from "../../effects/media/tiles.js";
import { patchMeetingScreenSharePresentation } from "../../effects/ui/roomView.js";
import * as selectors from "../../domain/selectors/index.js";

let lastMemberCount = 0;

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function handleChatMessageMembers(dispatch, p) {
	if (p.type === "members" && Array.isArray(p.list)) {
		dispatch({ type: "chat/membersUpdated", payload: { list: p.list } });
		return true;
	}
	return false;
}

/**
 * @param {HTMLElement} appEl
 * @param {import('../../store/index.js').getState} getState
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function handleChatMessageNotification(appEl, getState, dispatch, state, p) {
	if ((p.type === "chat" || p.type === "file_share") && p.nick !== selectors.selectNickname(state)) {
		playMessageSound();
		const chatPanelEl = appEl.querySelector("#chat-panel");
		const chatPanelOpen = chatPanelEl?.classList?.contains("chat-panel--open") ?? false;
		const chatFloating = appEl.querySelector('.floating-window[data-window="chat"]');
		const chatVisible = chatPanelOpen || (chatFloating && !chatFloating.classList.contains("floating-window--hidden"));
		if (selectors.selectScreen(state) === "room-view" && !chatVisible) {
			dispatch({ type: "ui/unreadChatIncremented", payload: {} });
			updateChatBadge(appEl, selectors.selectUnreadChatCount(getState()));
		}
	}
}

/**
 * @param {HTMLElement} appEl
 * @param {import('../../store/index.js').getState} getState
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function handleChatMessageReceived(appEl, getState, dispatch, state, p) {
	if (handleChatMessageMembers(dispatch, p)) return;
	handleChatMessageNotification(appEl, getState, dispatch, state, p);
	const members = state.members ?? [];
	if (p.type === "join") {
		playJoinSound();
		if (p.nick && !members.includes(p.nick)) {
			dispatch({ type: "chat/membersUpdated", payload: { list: [...members, p.nick] } });
		}
	} else if (p.type === "leave") {
		dispatch({ type: "chat/membersUpdated", payload: { list: members.filter((n) => n !== p.nick) } });
	}
	if (selectors.selectScreen(state) === "room-view" && p.type !== "members") {
		appendMessage(appEl, p, {
			receivedFileBlobs: selectors.selectReceivedFileBlobs(state),
			myNick: selectors.selectNickname(state)
		});
	}
}

/**
 * @param {import('../../store/index.js').dispatch} dispatch
 */
function handleVoipMembersUpdated(dispatch, p) {
	const list = p.members || p || [];
	const currentCount = list.length;
	if (currentCount > lastMemberCount) playJoinSound();
	else if (currentCount < lastMemberCount) playLeaveTone();
	lastMemberCount = currentCount;
	dispatch({ type: "chat/membersUpdated", payload: { list: list.map((m) => m.nick).filter(Boolean) } });
}

/**
 * @param {HTMLElement} appEl
 */
function handleVoipRemoteStreamAdded(appEl, dispatch, state, p) {
	attachRemoteAudio(p.peerId, p.stream, appEl);
	if (selectors.selectScreen(state) === "room-view") {
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
		dispatch({
			type: "voip/membersUpdated",
			payload: [{ peerId: p.peerId, nick: p.nick || (members[0] ?? "?") }, ...voipMembers]
		});
	}
}

/**
 * @param {HTMLElement} appEl
 */
function handleFileProgress(appEl, state, p) {
	const recv = state._receivingProgress;
	const speedKbps = recv?.speed ?? 0;
	updateReceivingProgress(appEl, p.filename, p.bytesReceived, p.total, speedKbps, null, p.nick || state._receivingFromNick || "?");
}

/**
 * @param {HTMLElement} appEl
 */
function handleVoipOrRoomUpdate(appEl, state) {
	if (selectors.selectScreen(state) !== "room-view") return;
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

/**
 * @param {HTMLElement} appEl
 */
function dispatchVoipEvent(appEl, dispatch, state, evt, p) {
	if (evt === "voip/membersUpdated") handleVoipMembersUpdated(dispatch, p);
	if (evt === "voip/remoteStreamAdded") handleVoipRemoteStreamAdded(appEl, dispatch, state, p);
	if (evt === "voip/remoteStreamEnded") {
		detachRemoteAudio(p.peerId);
		stopSpeakingIndicator(p.peerId);
	}
	if (evt === "voip/muteReceived" || evt === "voip/videoStateUpdated") {
		const stream = selectors.selectRemoteStreams(state).get(p.peerId) || getStreamForPeerId(p.peerId);
		if (stream) attachRemoteAudio(p.peerId, stream, appEl);
	}
	if (evt === "voip/screenStreamStarted") {
		if (p.peerId !== selectors.selectMyPeerId(state)) playScreenShareSound();
		if (selectors.selectScreen(state) === "room-view") {
			patchMeetingScreenSharePresentation(appEl, { skipVoip: true });
		}
	}
	if (evt === "voip/screenStreamStopped" && selectors.selectScreen(state) === "room-view") {
		patchMeetingScreenSharePresentation(appEl, { skipVoip: true });
	}
}

/**
 * @param {HTMLElement} appEl
 */
function dispatchFileEvent(appEl, state, evt, p) {
	if (evt === "file/received") {
		hideReceivingProgress(appEl);
		if (p.fileId && selectors.selectScreen(state) === "room-view") {
			updateFileShareMessage(appEl, p.fileId, p.filename, p.fromNick);
		}
	}
	if (evt === "file/progress") handleFileProgress(appEl, state, p);
}

/**
 * @param {HTMLElement} appEl
 * @param {import('../../store/index.js').getState} getState
 * @param {import('../../store/index.js').dispatch} dispatch
 */
export function createSubscriptionHandler(appEl, getState, dispatch) {
	return (state, event) => {
		if (!event?.type) return;
		const evt = event.type;
		const p = event.payload;
		if (evt === "chat/messageReceived") handleChatMessageReceived(appEl, getState, dispatch, state, p);
		dispatchVoipEvent(appEl, dispatch, state, evt, p);
		dispatchFileEvent(appEl, state, evt, p);
		if (evt.startsWith("voip/") || evt === "room/joined" || evt === "room/created") {
			handleVoipOrRoomUpdate(appEl, state);
		}
	};
}
