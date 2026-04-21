/**
 * Create/join room (API + mediasoup setup).
 */

import { t } from "../../i18n.js";
import { err } from "../../shared/result.js";
import { fetchCreateRoom, fetchJoinRoom } from "../../effects/network/api.js";
import * as peer from "../../effects/network/mediasoupClient.js";
import { setJoinError } from "../../ui/screens/index.js";
import { writeNickname } from "../../effects/storage/deviceStorage.js";
import * as selectors from "../../domain/selectors/index.js";

/**
 * @param {HTMLElement} appEl
 */
export function setCreateRoomError(appEl, resultOrError) {
	const errorEl = appEl.querySelector("#create-error");
	const createBtn = appEl.querySelector("#create-room-btn");
	const msg = resultOrError?.error?.message ?? resultOrError?.message ?? t("error");
	if (errorEl) errorEl.textContent = msg;
	if (createBtn) {
		createBtn.disabled = false;
		createBtn.textContent = t("createRoom");
	}
}

/**
 * @param {import('../../store/index.js').getState} getState
 */
export function getStreamForViewers(getState) {
	const s = getState();
	if (!s.hostStream) return null;
	const videoTrack = s.hostStream.getVideoTracks()[0];
	const audioTracks = s.hostStream.getAudioTracks();
	const hasAudio = audioTracks.length > 0 && s.audioEnabled;
	return new MediaStream([videoTrack, ...(hasAudio ? audioTracks : [])]);
}

async function doCreateRoomApiAndSetup(appEl, ctx, nick, pwd, code) {
	const { dispatch, getState, navigate } = ctx;
	const createResult = await fetchCreateRoom(pwd, code);
	if (!createResult.success) return createResult;
	const { roomId } = createResult.data;
	const joinResult = await fetchJoinRoom(roomId, pwd);
	if (!joinResult.success) return joinResult;
	const { roomId: joinedRoomId, peerId: id, wsToken, role } = joinResult.data;
	const p = { id, _ms: true, destroy() {} };
	dispatch({ type: "peer/connectionEstablished", payload: { peer: p } });
	dispatch({ type: "room/created", payload: { roomId: joinedRoomId, password: pwd, nickname: nick, peerId: id, role } });
	if (nick) writeNickname(nick);
	let participant;
	try {
		participant = await peer.setupRoomParticipant(p, nick, () => selectors.selectLocalStream(getState()), {
			dispatch,
			roomId: joinedRoomId,
			password: pwd,
			wsToken,
			getLocalStream: () => selectors.selectLocalStream(getState()),
			getLocalBackgroundEffect: () => selectors.selectBackgroundEffect(getState()) || "none",
			getMuted: () => selectors.selectIsMuted(getState())
		});
	} catch (e) {
		dispatch({ type: "room/createAttemptAborted" });
		return err("PEER", e?.message ?? "Verbindung fehlgeschlagen", e);
	}
	dispatch({ type: "peer/connectionEstablished", payload: { hostPeer: participant, viewerConn: participant } });
	navigate(appEl, "create-room-success");
	return { success: true, data: undefined };
}

export async function handleCreateRoom(appEl, ctx, nickname, password, roomCode = "") {
	const createBtn = appEl.querySelector("#create-room-btn");
	const nick = (nickname ?? "").trim();
	const pwd = (password ?? "").toString().trim();
	const code = (roomCode ?? "").trim();
	if (createBtn) {
		createBtn.disabled = true;
		createBtn.textContent = t("creating");
	}
	const result = await doCreateRoomApiAndSetup(appEl, ctx, nick, pwd, code);
	if (!result.success) setCreateRoomError(appEl, result);
}

async function doJoinRoomApiAndSetup(appEl, ctx, roomId, password, nickname) {
	const { dispatch, getState, navigate } = ctx;
	const pwd = (password ?? "").toString();
	const joinResult = await fetchJoinRoom(roomId, pwd);
	if (!joinResult.success) {
		dispatch({ type: "room/joinAttemptAborted" });
		return joinResult;
	}
	const { roomId: actualRoomId, peerId: id, wsToken, role } = joinResult.data;
	const p = { id, _ms: true, destroy() {} };
	dispatch({
		type: "room/joined",
		payload: { roomId: actualRoomId, password: pwd, nickname: (nickname ?? "").trim(), peerId: id, role }
	});
	dispatch({ type: "peer/connectionEstablished", payload: { peer: p } });
	const nick = selectors.selectNickname(getState());
	if (nick) writeNickname(nick);
	dispatch({ type: "peer/connectionEstablished", payload: { roomId: actualRoomId } });
	let participant;
	try {
		participant = await peer.setupRoomParticipant(p, nick, null, {
			dispatch,
			roomId: actualRoomId,
			password: pwd,
			wsToken,
			getLocalStream: () => selectors.selectLocalStream(getState()),
			getLocalBackgroundEffect: () => selectors.selectBackgroundEffect(getState()) || "none",
			getMuted: () => selectors.selectIsMuted(getState())
		});
	} catch (e) {
		dispatch({ type: "room/joinAttemptAborted" });
		return err("PEER", e?.message ?? "Verbindung fehlgeschlagen", e);
	}
	dispatch({ type: "peer/connectionEstablished", payload: { hostPeer: participant, viewerConn: participant } });
	navigate(appEl, "room-view");
	return { success: true, data: undefined };
}

export async function handleJoinRoom(appEl, ctx, roomId, password, nickname) {
	const joinBtn = appEl.querySelector("#join-btn");
	joinBtn.disabled = true;
	joinBtn.textContent = t("connecting");
	const result = await doJoinRoomApiAndSetup(appEl, ctx, roomId, password, nickname);
	if (!result.success) {
		setJoinError(appEl, result.error?.message ?? t("joinFailed"));
		joinBtn.disabled = false;
		joinBtn.textContent = t("join");
	}
}
