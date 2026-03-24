import { t } from "../../i18n.js";
import { speakingThresholdToSensitivityPercent } from "../../effects/storage/audioSettingsStorage.js";
import { renderShareContent } from "./create-room.js";
import {
	escapeHtml,
	escapeAttr,
	formatTime,
	renderMessagesHtml,
	renderFileShareBody,
	renderVoipParticipantsHtmlFloating,
	getWindowPositions,
	renderMeetingControlBarFloating,
	renderFloatingWindowVideos,
	renderFloatingWindowChat,
	renderFloatingWindowParticipants,
	renderStreamModalFloating,
	renderVoipParticipantsHtmlGrid,
	renderScreenShareBannersHtml,
	renderRoomViewHeader,
	renderShareModalContent,
	renderGridMeetingSection,
	renderStreamModalGrid,
	renderSettingsModalContent,
	renderFileModalContent,
	renderMeetingScreenShareSlotInner,
	renderStreamModalHostActionsInner,
	renderLeaveRoomModal,
	renderPollsDock,
	renderPollOptionRowHtml,
	syncPollCreateOptionUi,
	POLL_CREATE_MAX_OPTIONS
} from "./room-view-renderers.js";
import {
	iconLogOut,
	iconShare2,
	iconChevronDown,
	iconChevronUp,
	iconSmile,
	iconImage,
	iconSend,
	iconX,
	iconUpload,
	iconMic,
	iconMicOff,
	iconSettings,
	iconMonitor,
	iconMonitorOff,
	iconVolume2,
	iconVolumeX,
	iconVideoOff,
	iconVideo,
	iconDownload,
	iconLoader2,
	iconMenu,
	iconLogoWordmark,
	iconUsers,
	iconMessageSquare,
	iconMoreHorizontal,
	iconPhoneOff,
	iconLayoutGrid,
	iconGrip
} from "../../icons.js";
import { EMOJI_DATA, searchEmojis } from "../../emoji-data.js";
import { renderChatContent } from "../../link-embed.js";
import { replaceEmojiShortcodes } from "../../utils/emojiShortcodes.js";
import { WINDOW_POSITION_DEFAULTS } from "../../shared/windowPositionsDefaults.js";
import { mergeAndClampWindowRect, clampWindowRectById, clampDraggablePosition } from "../utils/viewportWindowClamp.js";
import { applyDraggableRect } from "../utils/draggableRect.js";

function renderFloatingWindows(state) {
	const {
		windowPositions = {},
		voipMembers = [],
		messages = [],
		isMuted = false,
		isVideoEnabled = false,
		hostStream = null,
		audioEnabled = true,
		roomId = "",
		unreadChatCount = 0,
		isHost = false,
		freeLayoutChatOpen = false,
		freeLayoutParticipantsOpen = false,
		freeLayoutVideosOpen = true
	} = state;
	const defaults = { ...WINDOW_POSITION_DEFAULTS };
	const pos = getWindowPositions(defaults, windowPositions);
	const muteMap = state.peerMuteState instanceof Map ? state.peerMuteState : new Map();
	const volumeMap = state.peerVolume instanceof Map ? state.peerVolume : new Map();
	const floatingState = { ...state, muteMap, volumeMap, myPeerId: state.peer?.id ?? "" };
	const messagesHtml = renderMessagesHtml(messages, (id) => state.receivedFileBlobs?.get?.(id), state.nickname);
	const voipParticipantsHtml = renderVoipParticipantsHtmlFloating(voipMembers, floatingState);
	const controlBar = renderMeetingControlBarFloating({
		...state,
		hasScreenShareSupport: state.hasScreenShareSupport ?? true,
		videoLayoutMode: "free",
		myHandRaised: state.myHandRaised ?? false
	});
	const pVideos = pos("videos");
	const pChat = pos("chat");
	const pParticipants = pos("participants");
	const pStream = pos("stream");
	return (
		renderFloatingWindowVideos(pVideos, !!freeLayoutVideosOpen) +
		`<div class="meeting-control-bar meeting-control-bar--floating" id="meeting-control-bar">${controlBar}</div>` +
		renderFloatingWindowChat(pChat, messagesHtml, !!freeLayoutChatOpen) +
		renderFloatingWindowParticipants(pParticipants, voipParticipantsHtml, voipMembers.length, !!freeLayoutParticipantsOpen) +
		renderStreamModalFloating(pStream, { isHost, hostStream, audioEnabled })
	);
}

export function renderRoomView(state) {
	const {
		messages = [],
		members = [],
		voipMembers = [],
		roomId = "",
		getJoinUrl = null,
		isHost = false,
		sharedFiles = [],
		receivedFiles = [],
		receivedFileBlobs = new Map(),
		hostStream = null,
		screenStreams = new Map(),
		audioEnabled = true,
		isMuted = false,
		isVideoEnabled = false,
		hasVideoSupport = true,
		backgroundEffect = "none",
		hasBackgroundBlur = false,
		backgroundImages = [],
		settingsPanelOpen = false,
		myPeerId = "",
		nickname = "",
		peerMuteState = new Map(),
		peerVolume = new Map(),
		peerVideoState = new Map(),
		peerBackgroundEffect = new Map(),
		getStreamForPeerId = null,
		getStreamForScreenShare = null,
		hasScreenShareSupport = true,
		unreadChatCount = 0,
		videoLayoutMode = "grid",
		windowPositions = {}
	} = state;

	const streamRect = mergeAndClampWindowRect("stream", WINDOW_POSITION_DEFAULTS.stream, windowPositions.stream);
	const settingsRect = mergeAndClampWindowRect("settings", WINDOW_POSITION_DEFAULTS.settings, windowPositions.settings);
	const shareRect = mergeAndClampWindowRect("share", WINDOW_POSITION_DEFAULTS.share, windowPositions.share);
	const pollsRect = mergeAndClampWindowRect("polls", WINDOW_POSITION_DEFAULTS.polls, windowPositions.polls);

	const joinUrl = roomId && getJoinUrl ? getJoinUrl(roomId) : "";
	const formattedRoomId = roomId ? roomId.replace(/(.{3})/g, "$1-").replace(/-$/, "") : "";

	const messagesHtml = renderMessagesHtml(messages, (id) => receivedFileBlobs?.get?.(id), nickname);
	const voipCtx = {
		muteMap: peerMuteState instanceof Map ? peerMuteState : new Map(),
		volumeMap: peerVolume instanceof Map ? peerVolume : new Map(),
		videoMap: peerVideoState instanceof Map ? peerVideoState : new Map(),
		bgEffectMap: peerBackgroundEffect instanceof Map ? peerBackgroundEffect : new Map(),
		myPeerId,
		isMuted,
		isVideoEnabled,
		backgroundEffect,
		getStreamForPeerId,
		isStreaming: (pid) => screenStreams?.has?.(pid)
	};
	const voipParticipantsHtml = renderVoipParticipantsHtmlGrid(voipMembers, voipCtx);
	const meetingTitle = roomId ? formattedRoomId : t("title");
	const screenShareBannerHtml = renderScreenShareBannersHtml(screenStreams, myPeerId);
	const gridState = { ...state, voipMembers };
	const gridContent = videoLayoutMode !== "free" ? renderGridMeetingSection(gridState, messagesHtml, voipParticipantsHtml) : "";
	const shareModalHtml = renderShareModalContent(roomId, formattedRoomId, joinUrl || "", renderShareContent, shareRect);
	const settingsState = { ...state, settingsPositionRect: settingsRect, settingsPanelOpen: settingsPanelOpen ?? false };
	return `
    <div class="screen room-view room-view--meeting-layout">
      ${renderRoomViewHeader(meetingTitle)}
      ${screenShareBannerHtml}
      ${shareModalHtml}
      <div class="room-view__panels">
        <div class="room-view__panel room-view__panel--active" data-panel="chat">
          <div class="chat-view__body chat-view__body--meeting ${videoLayoutMode === "free" ? "chat-view__body--floating" : ""}">
            ${videoLayoutMode === "free" ? renderFloatingWindows(state) : ""}
            ${gridContent}
          </div>
          ${renderStreamModalGrid(streamRect, state)}
        </div>
      </div>
      ${renderSettingsModalContent(settingsState)}
      ${renderFileModalContent()}
      ${renderPollsDock(pollsRect)}
      ${renderLeaveRoomModal()}
    </div>
  `;
}

function formatBytes(bytes) {
	if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
	if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
	return bytes + " B";
}

function updateReceivingProgressEl(nameEl, barEl, statsEl, filename, bytesReceived, total, speedKbps) {
	if (!nameEl || !barEl) return;
	nameEl.textContent = `${t("receivingFile")} ${filename || "?"}`;
	const pct = total > 0 ? Math.min(100, (bytesReceived / total) * 100) : 0;
	barEl.style.setProperty("--bar-width-pct", `${pct}%`);
	if (statsEl) statsEl.textContent = `${formatBytes(bytesReceived)} / ${formatBytes(total)}${speedKbps != null ? ` · ${speedKbps.toFixed(1)} ${t("transferSpeed")}` : ""}`;
}

export function updateReceivingProgress(container, filename, bytesReceived, total, speedKbps, fileId, fromNick) {
	const modalArea = container?.querySelector("#file-receiving-in-modal");
	if (modalArea) {
		modalArea.hidden = false;
		updateReceivingProgressEl(
			modalArea.querySelector("#file-receiving-filename-modal"),
			modalArea.querySelector("#file-receiving-bar-modal"),
			modalArea.querySelector("#file-receiving-stats-modal"),
			filename,
			bytesReceived,
			total,
			speedKbps
		);
	}
	if (fileId) {
		const pct = total > 0 ? Math.min(100, (bytesReceived / total) * 100) : 0;
		updateFileTransferMessage(container, fileId, {
			direction: "receiving",
			filename,
			fromNick,
			pct: bytesReceived < total ? pct : null,
			bytes: bytesReceived,
			total,
			speedKbps
		});
	}
}

export function hideReceivingProgress(container) {
	const modalArea = container?.querySelector("#file-receiving-in-modal");
	if (modalArea) modalArea.hidden = true;
}

function renderFileTransferBody(opts) {
	const { direction, filename, pct, bytes, total, speedKbps, peerStatuses, voipMembers = [], done, fileId } = opts;
	const isSending = direction === "sending";
	const label = done ? (isSending ? t("sentFile") : t("received")) : isSending ? t("sendingFile") : t("receivingFile");
	const parts = [];
	parts.push(`<p class="chat__transfer-label">${label} ${escapeHtml(filename || "?")}</p>`);
	if (done && !isSending && fileId) {
		parts.push(
			`<button type="button" class="btn btn--primary btn--sm chat__download-btn" data-action="download-file" data-file-id="${escapeAttr(fileId)}">${t("download")}</button>`
		);
	}
	if (isSending && peerStatuses && Object.keys(peerStatuses).length) {
		const rows = Object.entries(peerStatuses)
			.map(([pid, s]) => {
				const m = voipMembers?.find((x) => x.peerId === pid);
				const n = m?.nick ?? pid?.slice(0, 8) ?? "?";
				let right = "";
				if (s === "accepted" && pct != null && pct < 100 && !done) {
					right = `<div class="chat__transfer-row-bar"><div class="chat__transfer-bar-wrap"><div class="chat__transfer-bar" style="--bar-width-pct:${pct}%"></div></div><span class="chat__transfer-status">${formatBytes(bytes)} / ${formatBytes(total)}${speedKbps != null ? ` · ${speedKbps.toFixed(1)} ${t("transferSpeed")}` : ""}</span></div>`;
				} else if (s === "received" || (s === "accepted" && (done || (pct != null && pct >= 100)))) {
					right = `<span class="chat__transfer-status">${t("received")}</span>`;
				} else if (s === "rejected") {
					right = `<span class="chat__transfer-status">${t("rejected")}</span>`;
				} else {
					right = `<span class="chat__transfer-status">${t("pending")}</span>`;
				}
				return `<div class="chat__transfer-row"><span>${escapeHtml(n)}</span><div class="chat__transfer-row-right">${right}</div></div>`;
			})
			.join("");
		parts.push(`<div class="chat__transfer-peers">${rows}</div>`);
	} else if (!isSending && pct != null && !done) {
		const barPct = Math.min(100, Math.max(1, pct));
		parts.push(`<div class="chat__transfer-bar-wrap"><div class="chat__transfer-bar" style="--bar-width-pct:${barPct}%"></div></div>`);
		const stats = `${formatBytes(bytes)} / ${formatBytes(total)}${speedKbps != null ? ` · ${speedKbps.toFixed(1)} ${t("transferSpeed")}` : ""}`;
		parts.push(`<p class="chat__transfer-stats">${stats}</p>`);
	}
	return parts.join("");
}

export function updateFileTransferMessage(container, fileId, opts) {
	const body = container?.querySelector(`.chat__msg--transfer[data-file-id="${fileId}"] .chat__transfer-body`);
	if (!body) return;
	body.innerHTML = renderFileTransferBody(opts);
}

export function updateFileShareMessage(container, fileId, filename, fromNick) {
	const msg = container?.querySelector(`.chat__msg--file-share[data-file-id="${fileId}"]`);
	if (!msg) return;
	const body = msg.querySelector(".chat__file-share-body");
	if (!body) return;
	body.innerHTML = renderFileShareBody(fileId, fromNick, filename, true);
}

export function appendMessage(container, msg, opts = {}) {
	const list = container.querySelector("#chat-messages");
	if (!list) return;
	const empty = list.querySelector(".chat__empty");
	if (empty) empty.remove();
	const div = document.createElement("div");
	const receivedFileBlobs = opts.receivedFileBlobs;
	if (msg.type === "join") {
		div.className = "chat__msg chat__system-msg";
		div.innerHTML = `<div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(msg.nick)} ${t("participantJoined")}</span><span class="chat__msg-time">${formatTime(msg.ts || Date.now())}</span></div>`;
	} else if (msg.type === "leave") {
		div.className = "chat__msg chat__system-msg";
		div.innerHTML = `<div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(msg.nick)} ${t("participantLeft")}</span><span class="chat__msg-time">${formatTime(msg.ts || Date.now())}</span></div>`;
	} else if (msg.type === "chat") {
		div.className = "chat__msg";
		const parts = [];
		if (msg.text?.trim()) {
			const expanded = replaceEmojiShortcodes(msg.text);
			parts.push(renderChatContent(expanded, escapeHtml, t("openInNewTab")));
		}
		const urls = msg.giphyUrls?.length ? msg.giphyUrls : msg.giphyUrl ? [msg.giphyUrl] : [];
		urls.forEach((u) => parts.push(`<span class="chat__gif-wrap"><img src="${escapeAttr(u)}" alt="GIF" class="chat__gif" loading="lazy" /></span>`));
		const content = parts.length ? parts.join("") : "";
		if (!content) return;
		const isSelf = msg.nick === (opts.myNick ?? "");
		const selfClass = isSelf ? " chat__msg--self" : "";
		div.innerHTML = `<div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(msg.nick ?? "?")}</span><span class="chat__msg-time">${formatTime(msg.ts)}</span></div><div class="chat__msg-body">${content}</div>`;
		div.className = `chat__msg${selfClass}`;
	} else if (msg.type === "file_share") {
		const fileId = msg.fileId || "";
		const hasBlob = receivedFileBlobs?.get?.(fileId);
		const bodyHtml = renderFileShareBody(fileId, msg.nick, msg.filename, hasBlob);
		const isSelf = msg.nick === (opts.myNick ?? "");
		const selfClass = isSelf ? " chat__msg--self" : "";
		div.className = `chat__msg chat__msg--file-share${selfClass}`;
		div.dataset.fileId = fileId;
		div.innerHTML = `<div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(msg.nick ?? "?")}</span><span class="chat__msg-time">${formatTime(msg.ts)}</span></div><div class="chat__msg-body chat__file-share-body">${bodyHtml}</div>`;
	} else if (msg.type === "clipboard_share") {
		return;
	}
	const threshold = 80;
	const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
	list.appendChild(div);
	if (atBottom) list.scrollTop = list.scrollHeight;
	updateScrollToBottomButton(container);
}

function updateScrollToBottomButton(container) {
	const list = container?.querySelector("#chat-messages");
	const btn = container?.querySelector("#chat-scroll-to-bottom");
	if (!list || !btn) return;
	const threshold = 80;
	const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= threshold;
	const canScroll = list.scrollHeight > list.clientHeight;
	btn.hidden = atBottom || !canScroll;
}

export function updateVoipParticipants(
	container,
	members,
	myPeerId,
	isMuted,
	screenStreams = null,
	getStreamForPeerId = null,
	getStreamForScreenShare = null,
	peerMuteState = null,
	peerVolume = null,
	backgroundEffect = "none",
	peerVideoState = null,
	isVideoEnabled = false,
	peerBackgroundEffect = null
) {
	const list = container.querySelector("#participant-list");
	const title = container.querySelector(".chat__sidebar-title");
	const countSpan = container.querySelector("#participant-count");
	if (!list) return;
	if (countSpan) countSpan.textContent = members.length;
	else if (title) title.textContent = `${t("participants")} (${members.length})`;
	const existing = list.querySelector(".voip-view__empty");
	if (existing) existing.remove();
	const streams = screenStreams instanceof Map ? screenStreams : new Map();
	const muteMap = peerMuteState instanceof Map ? peerMuteState : new Map();
	const volumeMap = peerVolume instanceof Map ? peerVolume : new Map();
	const videoMap = peerVideoState instanceof Map ? peerVideoState : new Map();
	const bgEffectMap = peerBackgroundEffect instanceof Map ? peerBackgroundEffect : new Map();
	list.innerHTML = members
		.map((m) => {
			const nick = m.nick ?? "?";
			const peerId = m.peerId ?? "";
			const isSelf = peerId === myPeerId;
			const memberMuted = isSelf ? isMuted : (muteMap.get(peerId) ?? false);
			const memberHasVideo = isSelf
				? isVideoEnabled
				: videoMap.has(peerId)
					? videoMap.get(peerId)
					: (() => {
							const s = getStreamForPeerId?.(peerId);
							/* Wie video-tiles: Track reicht; enabled kann beim Consumer kurz false sein */
							return (s?.getVideoTracks?.().length ?? 0) > 0;
						})();
			const vol = volumeMap.get(peerId) ?? 100;
			const streaming = streams.has(peerId);
			const showThumb = streaming;
			const volumeControl =
				!isSelf && !memberMuted
					? `<div class="voip-view__volume-wrap" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("volume"))}"><button type="button" class="voip-view__participant-status voip-view__volume-trigger" data-action="volume-toggle" aria-label="${escapeAttr(t("volume"))}" title="${escapeAttr(t("volume"))}">${iconMic()}</button><div class="voip-view__volume-tooltip"><input type="range" class="voip-view__volume-slider" min="0" max="200" value="${vol}" data-peer-id="${escapeAttr(peerId)}" /></div></div>`
					: `<div class="voip-view__participant-status" title="${escapeAttr(memberMuted ? t("muted") : t("unmuted"))}">${memberMuted ? iconMicOff() : iconMic()}</div>`;
			const hasBgEffect = isSelf ? (backgroundEffect || "none") !== "none" : (bgEffectMap.get(peerId) || "none") !== "none";
			const streamHtml = showThumb
				? `<div class="voip-view__participant-stream" data-action="open-stream-modal" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("clickToExpand"))}"><video class="voip-view__stream-thumb" autoplay playsinline muted disablepictureinpicture></video></div>`
				: "";
			const handMark = m.handRaised
				? `<span class="voip-view__hand" title="${escapeAttr(t("handRaisedMarker"))}">✋</span>`
				: "";
			return `<div class="voip-view__participant" data-peer-id="${escapeAttr(peerId)}" data-self="${isSelf}" data-has-background-effect="${hasBgEffect}"><div class="voip-view__participant-info"><div class="voip-view__participant-name">${escapeHtml(nick)}${handMark}</div><div class="voip-view__participant-status-row">${volumeControl}</div></div>${streamHtml}</div>`;
		})
		.join("");
	if (getStreamForScreenShare) {
		list.querySelectorAll(".voip-view__stream-thumb").forEach((thumb) => {
			thumb.disablePictureInPicture = true;
			const participant = thumb.closest(".voip-view__participant");
			const peerId = participant?.dataset?.peerId;
			const stream = peerId ? getStreamForScreenShare(peerId) : null;
			if (stream) {
				thumb.srcObject = stream;
				thumb.play().catch(() => {});
			} else {
				thumb.srcObject = null;
			}
		});
	}
}

export function updateMeetingScreenShareSlots(container, { hasScreenShareSupport, hostStream }) {
	const inner = renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream });
	container.querySelectorAll(".meeting-control-bar__screen-slot").forEach((el) => {
		el.innerHTML = inner;
	});
}

export function updateStreamModalHostActionSlots(container, { isHost, hostStream, audioEnabled }) {
	const html = renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled });
	container.querySelectorAll(".stream-modal__host-actions-slot").forEach((el) => {
		el.innerHTML = html;
	});
}

export function updateScreenShareBannersSection(container, screenStreams, myPeerId) {
	const root = container.querySelector(".room-view.room-view--meeting-layout") || container;
	const existing = root.querySelector(".room-view__screen-share-banners");
	const newHtml = renderScreenShareBannersHtml(screenStreams, myPeerId);
	if (newHtml) {
		if (existing) existing.outerHTML = newHtml;
		else {
			const header = root.querySelector(".room-view__header");
			if (header) header.insertAdjacentHTML("afterend", newHtml);
		}
	} else if (existing) {
		existing.remove();
	}
}

export function updateMuteButton(container, isMuted) {
	const suffix = isMuted ? "muted" : "unmuted";
	container.querySelectorAll('[data-action="toggle-mute"]').forEach((btn) => {
		const meeting = btn.classList.contains("meeting-control-btn");
		btn.className = meeting ? `meeting-control-btn chat__mute-btn--${suffix}` : `chat__sidebar-btn btn btn--ghost btn--sm chat__mute-btn--${suffix}`;
		btn.innerHTML = isMuted ? iconMicOff() : iconMic();
		btn.title = isMuted ? t("unmute") : t("mute");
	});
}

export function updateVideoButton(container, isVideoEnabled) {
	const suffix = isVideoEnabled ? "on" : "off";
	container.querySelectorAll('[data-action="toggle-video"]').forEach((btn) => {
		const meeting = btn.classList.contains("meeting-control-btn");
		btn.className = meeting ? `meeting-control-btn video-btn--${suffix}` : `chat__sidebar-btn btn btn--ghost btn--sm video-btn--${suffix}`;
		btn.innerHTML = isVideoEnabled ? iconVideo() : iconVideoOff();
		btn.title = isVideoEnabled ? t("cameraOn") : t("cameraOff");
	});
	const wrap = container.querySelector("#effect-tiles-wrap");
	if (wrap) wrap.dataset.cameraActive = isVideoEnabled ? "true" : "false";
}

export function updateEffectTilesSelection(container, effect) {
	const tiles = container.querySelectorAll(".effect-tile[data-effect]");
	tiles.forEach((t) => {
		t.classList.toggle("effect-tile--selected", (t.dataset.effect || "none") === (effect || "none"));
	});
}

export function updateChatBadge(container, count) {
	const badge = container?.querySelector("#chat-badge");
	if (!badge) return;
	if (count > 0) {
		badge.textContent = count > 99 ? "99+" : String(count);
		badge.removeAttribute("hidden");
	} else {
		badge.setAttribute("hidden", "");
	}
}

const CHAT_SIDEBAR_WIDTH_KEY = "easymeet_chatSidebarWidth";
const CHAT_SIDEBAR_MIN = 140;
const CHAT_SIDEBAR_MAX_PERCENT = 0.5;

function attachChatResize(container) {
	const handle = container.querySelector("#chat-resize-handle");
	const sidebar = container.querySelector("#chat-sidebar");
	const body = container.querySelector(".chat-view__body");
	if (!handle || !sidebar || !body) return;

	const stored = localStorage.getItem(CHAT_SIDEBAR_WIDTH_KEY);
	if (stored) {
		const w = parseInt(stored, 10);
		if (w >= CHAT_SIDEBAR_MIN) sidebar.style.setProperty("--chat-sidebar-width", `${w}px`);
	}

	let startX = 0;
	let startWidth = 0;

	function onMove(e) {
		const bodyRect = body.getBoundingClientRect();
		const maxW = bodyRect.width * CHAT_SIDEBAR_MAX_PERCENT;
		const delta = e.clientX - startX;
		let w = Math.round(startWidth + delta);
		w = Math.max(CHAT_SIDEBAR_MIN, Math.min(maxW, w));
		sidebar.style.setProperty("--chat-sidebar-width", `${w}px`);
	}

	function onUp() {
		handle.classList.remove("chat__resize-handle--active");
		document.removeEventListener("mousemove", onMove);
		document.removeEventListener("mouseup", onUp);
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		const w = sidebar.getBoundingClientRect().width;
		localStorage.setItem(CHAT_SIDEBAR_WIDTH_KEY, String(Math.round(w)));
	}

	handle.addEventListener("mousedown", (e) => {
		if (e.button !== 0) return;
		e.preventDefault();
		startX = e.clientX;
		startWidth = sidebar.getBoundingClientRect().width;
		handle.classList.add("chat__resize-handle--active");
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	});
}

const FLOATING_WINDOW_MIN = { videos: { w: 320, h: 280 }, chat: { w: 280, h: 300 }, participants: { w: 200, h: 180 } };
const FLOATING_WINDOW_MAX = { w: 1920, h: 1080 };

const STREAM_MODAL_MIN = { w: 320, h: 240 };
const SETTINGS_MODAL_MIN = { w: 360, h: 400 };
const SHARE_MODAL_MIN = { w: 360, h: 400 };
const POLLS_MODAL_MIN = { w: 300, h: 260 };

function setupSettingsModalResize(container, callbacks = {}) {
	const content = container.querySelector(".settings-modal__content");
	const handle = content?.querySelector("[data-resize-handle]");
	if (!content || !handle || !callbacks.onWindowResize) return;
	let startX = 0,
		startY = 0,
		startW = 0,
		startH = 0;
	const onMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = content.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startW = rect.width;
		startH = rect.height;
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};
	const onMouseMove = (e) => {
		const dw = e.clientX - startX;
		const dh = e.clientY - startY;
		const newW = Math.round(Math.max(SETTINGS_MODAL_MIN.w, Math.min(FLOATING_WINDOW_MAX.w, startW + dw)));
		const newH = Math.round(Math.max(SETTINGS_MODAL_MIN.h, Math.min(FLOATING_WINDOW_MAX.h, startH + dh)));
		const r = content.getBoundingClientRect();
		const c = clampWindowRectById("settings", { x: r.left, y: r.top, w: newW, h: newH });
		applyDraggableRect(content, c);
		startX = e.clientX;
		startY = e.clientY;
		startW = c.w;
		startH = c.h;
		const positions = { ...(callbacks.getWindowPositions?.() || {}), settings: { x: c.x, y: c.y, w: c.w, h: c.h } };
		callbacks.onWindowResize?.("settings", positions);
	};
	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};
	handle.addEventListener("mousedown", onMouseDown);
}

function setupStreamModalResize(container, callbacks = {}) {
	const content = container.querySelector(".stream-modal__content");
	const handle = content?.querySelector("[data-resize-handle]");
	if (!content || !handle || !callbacks.onWindowResize) return;
	let startX = 0,
		startY = 0,
		startW = 0,
		startH = 0;
	const onMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = content.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startW = rect.width;
		startH = rect.height;
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};
	const onMouseMove = (e) => {
		const dw = e.clientX - startX;
		const dh = e.clientY - startY;
		const newW = Math.round(Math.max(STREAM_MODAL_MIN.w, Math.min(FLOATING_WINDOW_MAX.w, startW + dw)));
		const newH = Math.round(Math.max(STREAM_MODAL_MIN.h, Math.min(FLOATING_WINDOW_MAX.h, startH + dh)));
		const r = content.getBoundingClientRect();
		const c = clampWindowRectById("stream", { x: r.left, y: r.top, w: newW, h: newH });
		applyDraggableRect(content, c);
		startX = e.clientX;
		startY = e.clientY;
		startW = c.w;
		startH = c.h;
		const positions = { ...(callbacks.getWindowPositions?.() || {}), stream: { x: c.x, y: c.y, w: c.w, h: c.h } };
		callbacks.onWindowResize?.("stream", positions);
	};
	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};
	handle.addEventListener("mousedown", onMouseDown);
}

function setupShareModalResize(container, callbacks = {}) {
	const content = container.querySelector(".share-modal__content");
	const handle = content?.querySelector("[data-resize-handle]");
	if (!content || !handle || !callbacks.onWindowResize) return;
	let startX = 0,
		startY = 0,
		startW = 0,
		startH = 0;
	const onMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = content.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startW = rect.width;
		startH = rect.height;
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};
	const onMouseMove = (e) => {
		const dw = e.clientX - startX;
		const dh = e.clientY - startY;
		const newW = Math.round(Math.max(SHARE_MODAL_MIN.w, Math.min(FLOATING_WINDOW_MAX.w, startW + dw)));
		const newH = Math.round(Math.max(SHARE_MODAL_MIN.h, Math.min(FLOATING_WINDOW_MAX.h, startH + dh)));
		const r = content.getBoundingClientRect();
		const c = clampWindowRectById("share", { x: r.left, y: r.top, w: newW, h: newH });
		applyDraggableRect(content, c);
		startX = e.clientX;
		startY = e.clientY;
		startW = c.w;
		startH = c.h;
		const positions = { ...(callbacks.getWindowPositions?.() || {}), share: { x: c.x, y: c.y, w: c.w, h: c.h } };
		callbacks.onWindowResize?.("share", positions);
	};
	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};
	handle.addEventListener("mousedown", onMouseDown);
}

function setupPollsModalResize(container, callbacks = {}) {
	const content = container.querySelector(".polls-modal__content");
	const handle = content?.querySelector("[data-resize-handle]");
	if (!content || !handle || !callbacks.onWindowResize) return;
	let startX = 0,
		startY = 0,
		startW = 0,
		startH = 0;
	const onMouseDown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = content.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startW = rect.width;
		startH = rect.height;
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	};
	const onMouseMove = (e) => {
		const dw = e.clientX - startX;
		const dh = e.clientY - startY;
		const newW = Math.round(Math.max(POLLS_MODAL_MIN.w, Math.min(FLOATING_WINDOW_MAX.w, startW + dw)));
		const newH = Math.round(Math.max(POLLS_MODAL_MIN.h, Math.min(FLOATING_WINDOW_MAX.h, startH + dh)));
		const r = content.getBoundingClientRect();
		const c = clampWindowRectById("polls", { x: r.left, y: r.top, w: newW, h: newH });
		applyDraggableRect(content, c);
		startX = e.clientX;
		startY = e.clientY;
		startW = c.w;
		startH = c.h;
		const positions = { ...(callbacks.getWindowPositions?.() || {}), polls: { x: c.x, y: c.y, w: c.w, h: c.h } };
		callbacks.onWindowResize?.("polls", positions);
	};
	const onMouseUp = () => {
		document.removeEventListener("mousemove", onMouseMove);
		document.removeEventListener("mouseup", onMouseUp);
	};
	handle.addEventListener("mousedown", onMouseDown);
}

function setupFloatingWindowResize(container, callbacks = {}) {
	container.querySelectorAll(".floating-window[data-window]").forEach((win) => {
		const handle = win.querySelector("[data-resize-handle]");
		if (!handle || !callbacks.onWindowResize) return;
		const windowId = win.dataset.window;
		const mins = FLOATING_WINDOW_MIN[windowId] || { w: 200, h: 150 };
		let startX = 0,
			startY = 0,
			startW = 0,
			startH = 0;
		const onMouseDown = (e) => {
			e.preventDefault();
			e.stopPropagation();
			const rect = win.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;
			startW = rect.width;
			startH = rect.height;
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};
		const onMouseMove = (e) => {
			const dw = e.clientX - startX;
			const dh = e.clientY - startY;
			const newW = Math.round(Math.max(mins.w, Math.min(FLOATING_WINDOW_MAX.w, startW + dw)));
			const newH = Math.round(Math.max(mins.h, Math.min(FLOATING_WINDOW_MAX.h, startH + dh)));
			const r = win.getBoundingClientRect();
			const c = clampWindowRectById(windowId, { x: r.left, y: r.top, w: newW, h: newH });
			applyDraggableRect(win, c);
			startX = e.clientX;
			startY = e.clientY;
			startW = c.w;
			startH = c.h;
			const prev = callbacks.getWindowPositions?.()?.[windowId] || {};
			const positions = { ...(callbacks.getWindowPositions?.() || {}), [windowId]: { ...prev, x: c.x, y: c.y, w: c.w, h: c.h } };
			callbacks.onWindowResize?.(windowId, positions);
		};
		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};
		handle.addEventListener("mousedown", onMouseDown);
	});
}

function setupDraggableModals(container, callbacks = {}) {
	container.querySelectorAll("[data-draggable]").forEach((content) => {
		const handle = content.querySelector("[data-drag-handle]");
		if (!handle) return;
		const windowId = content.dataset.window;
		let startX = 0,
			startY = 0,
			startLeft = 0,
			startTop = 0;
		const onMouseDown = (e) => {
			if (e.target.closest("button")) return;
			e.preventDefault();
			const overlay =
				content.closest(".floating-window") ||
				content.closest(".stream-modal") ||
				content.closest(".settings-modal") ||
				content.closest(".share-modal") ||
				content.closest(".polls-modal");
			if (overlay) {
				container
					.querySelectorAll(".floating-window, .stream-modal, .settings-modal, .share-modal, .polls-modal")
					.forEach((el) => el.classList.remove("overlay--front"));
				overlay.classList.add("overlay--front");
			}
			const rect = content.getBoundingClientRect();
			startX = e.clientX;
			startY = e.clientY;
			startLeft = rect.left;
			startTop = rect.top;
			applyDraggableRect(content, { x: rect.left, y: rect.top, w: rect.width, h: rect.height });
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		};
		const onMouseMove = (e) => {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const { left, top } = clampDraggablePosition(startLeft + dx, startTop + dy, content.offsetWidth, content.offsetHeight);
			applyDraggableRect(content, { x: left, y: top, w: content.offsetWidth, h: content.offsetHeight });
			startX = e.clientX;
			startY = e.clientY;
			startLeft = left;
			startTop = top;
			if (windowId && callbacks.onWindowMove) {
				callbacks.onWindowMove(windowId, { x: left, y: top });
			}
		};
		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			if (windowId && callbacks.onWindowMove) {
				callbacks.onWindowMove(windowId, { x: startLeft, y: startTop });
			}
		};
		handle.addEventListener("mousedown", onMouseDown);
	});
}

function attachRoomViewModalListeners(container, callbacks) {
	const leaveModal = container.querySelector("#leave-room-modal");
	const openLeaveModal = () => leaveModal?.removeAttribute("hidden");
	const closeLeaveModal = () => leaveModal?.setAttribute("hidden", "");
	container.querySelectorAll('[data-action="leave"]').forEach((btn) => btn.addEventListener("click", openLeaveModal));
	leaveModal?.querySelectorAll('[data-action="leave-cancel"]').forEach((el) => el.addEventListener("click", closeLeaveModal));
	leaveModal?.querySelector('[data-action="leave-confirm"]')?.addEventListener("click", () => {
		closeLeaveModal();
		callbacks.onLeave?.();
	});
	container.querySelectorAll('[data-action="minimize-share-modal"]').forEach((el) => {
		el.addEventListener("click", () => callbacks.onMinimizeShareModal?.());
	});
	container.querySelectorAll('[data-action="minimize-polls-modal"]').forEach((el) => {
		el.addEventListener("click", () => callbacks.onMinimizePollsModal?.());
	});
	container.querySelectorAll('[data-action="minimize-stream-modal"]').forEach((el) => {
		el.addEventListener("click", () => callbacks.onMinimizeStreamModal?.());
	});
	container.querySelector('[data-action="open-file-modal"]')?.addEventListener("click", () => {
		container.querySelector("#file-modal")?.removeAttribute("hidden");
	});
	container.querySelectorAll('[data-action="close-file-modal"]').forEach((el) => {
		el.addEventListener("click", () => container.querySelector("#file-modal")?.setAttribute("hidden", ""));
	});
}

function attachRoomViewDownloadListeners(container, callbacks) {
	container.addEventListener("click", (e) => {
		const downloadBtn = e.target.closest('[data-action="download-file"]');
		if (downloadBtn) {
			const fileId = downloadBtn.dataset.fileId;
			if (fileId) callbacks.onDownloadFile?.(fileId);
			return;
		}
		const removeBtn = e.target.closest('[data-action="remove-gif"]');
		if (removeBtn) callbacks.onRemoveGif?.(parseInt(removeBtn.dataset.index, 10));
	});
}

function attachRoomViewShareListeners(container, callbacks) {
	container.addEventListener("click", (e) => {
		const btn = e.target.closest('[data-action="open-stream-modal"]');
		if (btn) callbacks.onOpenStreamModal?.(btn.dataset?.peerId);
	});
	container.querySelectorAll('[data-action="share"]').forEach((el) =>
		el.addEventListener("click", () => {
			callbacks.onShareOpen?.();
		})
	);
}

function attachRoomViewChatInputListeners(container, callbacks, input) {
	container.querySelector('[data-action="send"]')?.addEventListener("click", () => callbacks.onSend?.());
	input?.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			callbacks.onSend?.();
		}
	});
}

function attachRoomViewChatMoreListeners(container, callbacks) {
	const chatMoreMenu = container.querySelector("#chat-more-menu");
	const chatMoreWrap = container.querySelector(".chat__more-wrap");
	container.addEventListener("click", (e) => {
		const toggleBtn = e.target.closest('[data-action="toggle-chat-more"]');
		const emojiBtn = e.target.closest('[data-action="emoji"]');
		const giphyBtn = e.target.closest('[data-action="giphy"]');
		const fileBtn = e.target.closest('[data-action="open-file-modal"]');
		if (toggleBtn) {
			chatMoreMenu?.toggleAttribute("hidden");
			return;
		}
		if (emojiBtn) {
			chatMoreMenu?.setAttribute("hidden", "");
			container.querySelector("#giphy-picker")?.setAttribute("hidden", "");
			container.querySelector("#emoji-picker")?.toggleAttribute("hidden");
			return;
		}
		if (giphyBtn) {
			chatMoreMenu?.setAttribute("hidden", "");
			container.querySelector("#emoji-picker")?.setAttribute("hidden", "");
			container.querySelector("#giphy-picker")?.toggleAttribute("hidden");
			callbacks.onGiphyOpen?.();
			return;
		}
		if (fileBtn) {
			chatMoreMenu?.setAttribute("hidden", "");
			container.querySelector("#file-modal")?.removeAttribute("hidden");
			return;
		}
		if (chatMoreWrap && !chatMoreWrap.contains(e.target) && !chatMoreMenu?.hasAttribute("hidden")) chatMoreMenu?.setAttribute("hidden", "");
	});
}

function attachRoomViewEmojiListeners(container, input) {
	container.querySelector('[data-action="close-emoji"]')?.addEventListener("click", () => container.querySelector("#emoji-picker")?.setAttribute("hidden", ""));
	const emojiGrid = container.querySelector("#emoji-grid");
	container.querySelector("#emoji-search")?.addEventListener("input", (e) => {
		const q = e.target.value.trim();
		const results = searchEmojis(q, 500);
		if (emojiGrid)
			emojiGrid.innerHTML = results.map(([em]) => `<button type="button" class="emoji-picker__btn" data-emoji="${escapeAttr(em)}">${escapeHtml(em)}</button>`).join("");
	});
	emojiGrid?.addEventListener("click", (e) => {
		const btn = e.target.closest(".emoji-picker__btn");
		if (btn && input) {
			input.value += btn.dataset.emoji;
			input.focus();
			container.querySelector("#emoji-picker")?.setAttribute("hidden", "");
		}
	});
}

function attachRoomViewGiphyListeners(container, callbacks) {
	container.querySelector('[data-action="close-giphy"]')?.addEventListener("click", () => container.querySelector("#giphy-picker")?.setAttribute("hidden", ""));
	container.querySelector(".giphy-picker__grid")?.addEventListener("click", (e) => {
		const btn = e.target.closest(".giphy-picker__item");
		if (btn?.dataset?.url) {
			callbacks.onGiphySelect?.(btn.dataset.url, btn.dataset.preview);
			container.querySelector("#giphy-picker")?.setAttribute("hidden", "");
		}
	});
	let giphyTimeout;
	container.querySelector("#giphy-search")?.addEventListener("input", (e) => {
		const q = e.target.value.trim();
		clearTimeout(giphyTimeout);
		if (!q) return;
		giphyTimeout = setTimeout(() => callbacks.onGiphySearch?.(q), 300);
	});
}

function attachRoomViewEmojiGiphyListeners(container, callbacks, input) {
	attachRoomViewEmojiListeners(container, input);
	attachRoomViewGiphyListeners(container, callbacks);
}

function attachRoomViewChatListeners(container, callbacks, input) {
	attachRoomViewChatInputListeners(container, callbacks, input);
	attachRoomViewChatMoreListeners(container, callbacks);
	attachRoomViewEmojiGiphyListeners(container, callbacks, input);
}

function attachRoomViewShareModalCopyListeners(container) {
	container.addEventListener("click", (e) => {
		const shareModal = container.querySelector("#share-modal");
		if (!shareModal?.contains(e.target)) return;
		const copyBtn = e.target.closest('[data-action="copy"]');
		const copyLinkBtn = e.target.closest('[data-action="copy-link"]');
		const openLinkBtn = e.target.closest('[data-action="open-link"]');
		if (copyBtn) {
			const roomId = shareModal.querySelector(".room-code:not(.room-link)")?.dataset?.roomId;
			if (roomId && navigator.clipboard) {
				navigator.clipboard.writeText(roomId);
				const span = copyBtn.querySelector("span");
				if (span) {
					span.textContent = t("copied");
					setTimeout(() => (span.textContent = t("copy")), 2000);
				}
			}
			return;
		}
		if (copyLinkBtn) {
			const urlEl = shareModal.querySelector(".room-link .room-link__url");
			if (urlEl?.textContent && navigator.clipboard) {
				navigator.clipboard.writeText(urlEl.textContent);
				const span = copyLinkBtn.querySelector("span");
				if (span) {
					span.textContent = t("linkCopied");
					setTimeout(() => (span.textContent = t("copyLink")), 2000);
				}
			}
			return;
		}
		if (openLinkBtn) {
			const urlEl = shareModal.querySelector(".room-link .room-link__url");
			if (urlEl?.textContent) window.open(urlEl.textContent, "_blank");
		}
	});
}

/** Skip modals with hidden; still clamp floating windows when collapsed (visible in viewport when opened). */
function shouldClampDraggable(el) {
	const modal = el.closest("#stream-modal, #settings-modal, #share-modal, #polls-modal");
	if (modal?.hasAttribute("hidden")) return false;
	return true;
}

function clampAllDraggableWindows(container, callbacks) {
	const getWp = callbacks.getWindowPositions;
	const onResize = callbacks.onWindowResize;
	if (!getWp || !onResize) return;
	let merged = { ...getWp() };
	let changed = false;
	container.querySelectorAll("[data-draggable][data-window]").forEach((el) => {
		if (!shouldClampDraggable(el)) return;
		const id = el.dataset.window;
		if (!id) return;
		const rect = el.getBoundingClientRect();
		if (rect.width < 8 || rect.height < 8) return;
		const c = clampWindowRectById(id, { x: rect.left, y: rect.top, w: rect.width, h: rect.height });
		const moved = Math.abs(c.x - rect.left) > 0.5 || Math.abs(c.y - rect.top) > 0.5 || Math.abs(c.w - rect.width) > 0.5 || Math.abs(c.h - rect.height) > 0.5;
		if (moved) {
			applyDraggableRect(el, c);
			merged = { ...merged, [id]: { ...(merged[id] || {}), x: c.x, y: c.y, w: c.w, h: c.h } };
			changed = true;
		}
	});
	if (changed) onResize("_viewport", merged);
}

export function attachRoomViewListeners(container, callbacks) {
	container._easymeetViewportClampAbort?.abort();
	const viewportClampAc = new AbortController();
	container._easymeetViewportClampAbort = viewportClampAc;
	const vSignal = viewportClampAc.signal;

	function closeReactionPopover() {
		container.querySelector("#reaction-popover")?.setAttribute("hidden", "");
		container.querySelectorAll('[data-action="toggle-reaction-popover"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
	}

	document.addEventListener(
		"click",
		(e) => {
			const pop = container.querySelector("#reaction-popover");
			if (!pop || pop.hasAttribute("hidden")) return;
			if (e.target.closest("#reaction-popover") || e.target.closest('[data-action="toggle-reaction-popover"]')) return;
			closeReactionPopover();
		},
		{ signal: vSignal }
	);

	let clampRaf = 0;
	const scheduleViewportClamp = () => {
		cancelAnimationFrame(clampRaf);
		clampRaf = requestAnimationFrame(() => {
			clampRaf = 0;
			clampAllDraggableWindows(container, callbacks);
		});
	};
	window.addEventListener("resize", scheduleViewportClamp, { signal: vSignal });
	window.visualViewport?.addEventListener("resize", scheduleViewportClamp, { signal: vSignal });
	window.visualViewport?.addEventListener("scroll", scheduleViewportClamp, { signal: vSignal });
	requestAnimationFrame(scheduleViewportClamp);

	container.addEventListener(
		"click",
		(e) => {
			if (e.target.closest("#start-screen-btn")) {
				callbacks.onStartScreen?.();
				return;
			}
			if (e.target.closest("#stop-screen-btn")) {
				callbacks.onStopScreen?.();
				return;
			}
			if (e.target.closest("#audio-screen-btn")) {
				callbacks.onAudioScreenToggle?.();
				return;
			}
			if (e.target.closest('[data-action="stop-screen-share"]')) {
				callbacks.onStopScreenDirect?.();
				return;
			}
		},
		{ signal: vSignal }
	);

	setupDraggableModals(container, { onWindowMove: callbacks.onWindowMove });
	setupFloatingWindowResize(container, { onWindowResize: callbacks.onWindowResize, getWindowPositions: callbacks.getWindowPositions });
	setupStreamModalResize(container, { onWindowResize: callbacks.onWindowResize, getWindowPositions: callbacks.getWindowPositions });
	setupSettingsModalResize(container, { onWindowResize: callbacks.onWindowResize, getWindowPositions: callbacks.getWindowPositions });
	setupShareModalResize(container, { onWindowResize: callbacks.onWindowResize, getWindowPositions: callbacks.getWindowPositions });
	setupPollsModalResize(container, { onWindowResize: callbacks.onWindowResize, getWindowPositions: callbacks.getWindowPositions });
	attachRoomViewModalListeners(container, callbacks);
	attachRoomViewDownloadListeners(container, callbacks);
	attachRoomViewShareListeners(container, callbacks);
	attachRoomViewShareModalCopyListeners(container);
	const input = container.querySelector("#chat-input");
	attachRoomViewChatListeners(container, callbacks, input);
	attachChatResize(container);
	const chatList = container.querySelector("#chat-messages");
	if (chatList) {
		chatList.scrollTop = chatList.scrollHeight;
		chatList.addEventListener("scroll", () => updateScrollToBottomButton(container));
		updateScrollToBottomButton(container);
	}
	container.querySelector("#chat-scroll-to-bottom")?.addEventListener("click", () => {
		const list = container.querySelector("#chat-messages");
		if (list) list.scrollTop = list.scrollHeight;
		updateScrollToBottomButton(container);
	});
	container.querySelectorAll('[data-action="toggle-mute"]').forEach((el) => el.addEventListener("click", () => callbacks.onToggleMute?.()));
	container.querySelectorAll('[data-action="toggle-video"]').forEach((el) => el.addEventListener("click", () => callbacks.onToggleVideo?.()));

	container.addEventListener(
		"click",
		(e) => {
			const tr = e.target.closest('[data-action="toggle-reaction-popover"]');
			if (!tr) return;
			e.stopPropagation();
			const pop = container.querySelector("#reaction-popover");
			if (!pop) return;
			const willOpen = pop.hasAttribute("hidden");
			if (willOpen) pop.removeAttribute("hidden");
			else pop.setAttribute("hidden", "");
			tr.setAttribute("aria-expanded", willOpen ? "true" : "false");
		},
		{ signal: vSignal }
	);
	container.addEventListener(
		"click",
		(e) => {
			const sr = e.target.closest('[data-action="send-reaction"]');
			/* getAttribute: zuverlässiger als dataset bei manchen Emoji-Sequenzen / Browsern */
			const reactionEmoji = sr?.getAttribute?.("data-emoji") ?? sr?.dataset?.emoji ?? sr?.textContent?.trim() ?? "";
			if (sr && reactionEmoji) {
				e.preventDefault();
				callbacks.onSendReaction?.(reactionEmoji);
				return;
			}
			const sfx = e.target.closest('[data-action="send-reaction-effect"]');
			if (sfx?.dataset?.effect) {
				e.preventDefault();
				callbacks.onSendReactionEffect?.(sfx.dataset.effect);
			}
		},
		{ signal: vSignal }
	);
	container.querySelectorAll('[data-action="toggle-hand"]').forEach((el) =>
		el.addEventListener("click", () => {
			callbacks.onToggleHand?.();
			container.querySelectorAll(".meeting-control-bar").forEach((bar) => bar.classList.remove("meeting-control-bar--more-open"));
			container.querySelectorAll('[data-action="toggle-meeting-more"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
		})
	);
	container.querySelectorAll('[data-action="toggle-polls-panel"]').forEach((el) =>
		el.addEventListener("click", () => {
			const modal = container.querySelector("#polls-modal");
			if (!modal) return;
			if (modal.hasAttribute("hidden")) callbacks.onOpenPollsPanel?.();
			else callbacks.onMinimizePollsModal?.();
			container.querySelectorAll(".meeting-control-bar").forEach((bar) => bar.classList.remove("meeting-control-bar--more-open"));
			container.querySelectorAll('[data-action="toggle-meeting-more"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
		})
	);
	container.addEventListener(
		"click",
		(e) => {
			const addOpt = e.target.closest('[data-action="poll-add-option"]');
			if (addOpt) {
				e.preventDefault();
				const wrap = container.querySelector("#poll-create-options");
				if (!wrap) return;
				const n = wrap.querySelectorAll(".poll-create__option-row").length;
				if (n >= POLL_CREATE_MAX_OPTIONS) return;
				wrap.insertAdjacentHTML("beforeend", renderPollOptionRowHtml(n + 1));
				syncPollCreateOptionUi(container);
				return;
			}
			const remOpt = e.target.closest('[data-action="poll-remove-option"]');
			if (remOpt) {
				e.preventDefault();
				const row = remOpt.closest(".poll-create__option-row");
				const wrap = container.querySelector("#poll-create-options");
				if (!row || !wrap || wrap.querySelectorAll(".poll-create__option-row").length <= 2) return;
				row.remove();
				syncPollCreateOptionUi(container);
				return;
			}
			const voteBtn = e.target.closest('[data-action="poll-vote"]');
			if (voteBtn?.dataset?.pollId != null && voteBtn.dataset.optionIndex != null) {
				callbacks.onPollVote?.(voteBtn.dataset.pollId, parseInt(voteBtn.dataset.optionIndex, 10));
				return;
			}
			const closePoll = e.target.closest('[data-action="poll-close"]');
			if (closePoll?.dataset?.pollId) {
				callbacks.onPollClose?.(closePoll.dataset.pollId);
				return;
			}
			const createSub = e.target.closest('[data-action="poll-create-submit"]');
			if (createSub) {
				const qEl = container.querySelector("#poll-create-question");
				const q = qEl?.value?.trim() ?? "";
				const opts = [...container.querySelectorAll(".poll-create-option")]
					.map((inp) => inp.value.trim())
					.filter(Boolean);
				callbacks.onPollCreate?.(q, opts);
			}
		},
		{ signal: vSignal }
	);

	container.querySelectorAll('[data-action="toggle-meeting-more"]').forEach((el) =>
		el.addEventListener("click", () => {
			container.querySelectorAll(".meeting-control-bar").forEach((bar) => {
				bar.classList.toggle("meeting-control-bar--more-open");
				const open = bar.classList.contains("meeting-control-bar--more-open");
				el.setAttribute("aria-expanded", open ? "true" : "false");
			});
		})
	);
	function positionVolumeTooltip(wrap) {
		const tooltip = wrap?.querySelector(".voip-view__volume-tooltip");
		if (!tooltip) return;
		const TOOLTIP_W = 130;
		const MARGIN = 8;
		const wrapRect = wrap.getBoundingClientRect();
		const vw = window.innerWidth;
		const spaceRight = vw - wrapRect.right;
		const spaceLeft = wrapRect.left;
		tooltip.classList.remove("voip-view__volume-tooltip--flip-h");
		if (spaceRight < TOOLTIP_W + MARGIN && spaceLeft >= TOOLTIP_W + MARGIN) {
			tooltip.classList.add("voip-view__volume-tooltip--flip-h");
		}
	}

	container.addEventListener("click", (e) => {
		const toggleBtn = e.target.closest('[data-action="volume-toggle"]');
		const wrap = e.target.closest(".voip-view__volume-wrap");
		if (toggleBtn) {
			const w = toggleBtn.closest(".voip-view__volume-wrap");
			container.querySelectorAll(".voip-view__volume-wrap--open").forEach((o) => {
				if (o !== w) o.classList.remove("voip-view__volume-wrap--open");
			});
			w?.classList.toggle("voip-view__volume-wrap--open");
			if (w?.classList.contains("voip-view__volume-wrap--open")) requestAnimationFrame(() => positionVolumeTooltip(w));
		} else if (!wrap) {
			container.querySelectorAll(".voip-view__volume-wrap--open").forEach((o) => o.classList.remove("voip-view__volume-wrap--open"));
		}
	});
	const volumeHideTimers = new Map();
	container.addEventListener("mouseover", (e) => {
		const wrap = e.target.closest(".voip-view__volume-wrap");
		if (wrap) {
			const t = volumeHideTimers.get(wrap);
			if (t) {
				clearTimeout(t);
				volumeHideTimers.delete(wrap);
			}
			wrap.classList.add("voip-view__volume-wrap--hover");
			requestAnimationFrame(() => positionVolumeTooltip(wrap));
		}
	});
	container.addEventListener("mouseout", (e) => {
		const wrap = e.target.closest(".voip-view__volume-wrap");
		const related = e.relatedTarget;
		if (!wrap || (related && wrap.contains(related))) return;
		if (volumeHideTimers.has(wrap)) clearTimeout(volumeHideTimers.get(wrap));
		volumeHideTimers.set(
			wrap,
			setTimeout(() => {
				wrap.classList.remove("voip-view__volume-wrap--hover");
				volumeHideTimers.delete(wrap);
			}, 350)
		);
	});
	container.addEventListener("input", (e) => {
		const slider = e.target.closest(".voip-view__volume-slider");
		if (slider?.dataset?.peerId) {
			const val = parseInt(slider.value, 10);
			callbacks.onPeerVolumeChange?.(slider.dataset.peerId, val);
		}
	});
	const openSettingsModal = () => {
		callbacks.onOpenSettingsModal?.();
	};
	const closeSettingsModal = () => {
		callbacks.onMinimizeSettingsModal?.();
	};
	container.querySelectorAll('[data-action="toggle-video-layout"]').forEach((el) => el.addEventListener("click", () => callbacks.onToggleVideoLayout?.()));
	container.querySelectorAll('[data-action="toggle-settings"]').forEach((el) =>
		el.addEventListener("click", () => {
			const modal = container.querySelector("#settings-modal");
			if (!modal) return;
			const isOpen = modal.hasAttribute("hidden");
			if (isOpen) openSettingsModal();
			else closeSettingsModal();
			container.querySelectorAll(".meeting-control-bar").forEach((bar) => bar.classList.remove("meeting-control-bar--more-open"));
		})
	);
	container.querySelectorAll('[data-action="minimize-settings-modal"]').forEach((el) => {
		el.addEventListener("click", closeSettingsModal);
	});
	container.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			const leaveM = container.querySelector("#leave-room-modal");
			if (leaveM && !leaveM.hasAttribute("hidden")) {
				leaveM.setAttribute("hidden", "");
				return;
			}
			const pop = container.querySelector("#reaction-popover");
			if (pop && !pop.hasAttribute("hidden")) {
				closeReactionPopover();
				return;
			}
			const pollsModal = container.querySelector("#polls-modal");
			if (pollsModal && !pollsModal.hasAttribute("hidden")) {
				callbacks.onMinimizePollsModal?.();
				return;
			}
			const modal = container.querySelector("#settings-modal");
			if (modal && !modal.hasAttribute("hidden")) closeSettingsModal();
		}
	});
	container.querySelector("#input-device")?.addEventListener("change", (e) => {
		const deviceId = e.target?.value || "";
		callbacks.onInputDeviceChange?.(deviceId);
	});
	const audioTh = container.querySelector("#audio-speaking-threshold");
	const audioThVal = container.querySelector("#audio-speaking-threshold-value");
	audioTh?.addEventListener("input", () => {
		const v = parseInt(audioTh.value, 10);
		if (Number.isNaN(v)) return;
		const pct = speakingThresholdToSensitivityPercent(v);
		if (audioThVal) audioThVal.textContent = `${pct}%`;
		audioTh.setAttribute("aria-valuenow", String(v));
		audioTh.setAttribute("aria-valuetext", `${pct}%`);
		callbacks.onAudioSettingsChange?.({ speakingThreshold: v });
	});
	container.querySelector("#audio-noise-suppression")?.addEventListener("change", (e) => {
		callbacks.onAudioSettingsChange?.({ noiseSuppression: e.target.checked });
	});
	container.querySelector("#audio-echo-cancellation")?.addEventListener("change", (e) => {
		callbacks.onAudioSettingsChange?.({ echoCancellation: e.target.checked });
	});
	container.querySelector("#audio-auto-gain")?.addEventListener("change", (e) => {
		callbacks.onAudioSettingsChange?.({ autoGainControl: e.target.checked });
	});
	container.querySelector("#output-device")?.addEventListener("change", (e) => {
		const deviceId = e.target?.value || "";
		callbacks.onOutputDeviceChange?.(deviceId);
	});
	container.querySelector("#video-device")?.addEventListener("change", (e) => {
		const deviceId = e.target?.value || "";
		callbacks.onVideoDeviceChange?.(deviceId);
	});
	container.querySelector("#effect-tiles-upload-btn")?.addEventListener("click", () => {
		container.querySelector("#background-upload-input")?.click();
	});
	container.querySelector("#background-upload-input")?.addEventListener("change", (e) => {
		const file = e.target?.files?.[0];
		if (file) callbacks.onCustomBackgroundUpload?.(file);
		e.target.value = "";
	});
	container.querySelector("#effect-tiles-wrap")?.addEventListener("click", (e) => {
		const removeBtn = e.target.closest('[data-action="remove-custom-bg"]');
		if (removeBtn) {
			e.stopPropagation();
			e.preventDefault();
			const id = removeBtn.dataset.effectId;
			if (id) callbacks.onRemoveCustomBackground?.(id);
			return;
		}
		const expandBtn = e.target.closest("#effect-tiles-expand-btn");
		if (expandBtn) {
			const more = container.querySelector("#effect-tiles-more");
			const isExpanded = expandBtn.dataset.expanded === "true";
			expandBtn.dataset.expanded = !isExpanded;
			more?.toggleAttribute("hidden", isExpanded);
			const textSpan = expandBtn.querySelector(".effect-tiles-expand-btn__text");
			const iconSpan = expandBtn.querySelector(".effect-tiles-expand-btn__icon");
			if (textSpan) textSpan.textContent = isExpanded ? t("showMoreBackgrounds") : t("showLessBackgrounds");
			if (iconSpan) iconSpan.innerHTML = isExpanded ? iconChevronDown() : iconChevronUp();
			return;
		}
		const tile = e.target.closest(".effect-tile[data-effect]");
		if (!tile) return;
		const effect = tile.dataset.effect || "none";
		container.querySelectorAll(".effect-tile").forEach((t) => t.classList.remove("effect-tile--selected"));
		tile.classList.add("effect-tile--selected");
		callbacks.onBackgroundEffectChange?.(effect);
	});
	container.querySelector("#file-input")?.addEventListener("change", (e) => callbacks.onFileSelect?.(e.target.files));
	container.querySelector("#folder-input")?.addEventListener("change", (e) => callbacks.onFileSelect?.(e.target.files));
	container.querySelector('[data-input="file"]')?.addEventListener("click", () => container.querySelector("#file-input")?.click());
	container.querySelector('[data-input="folder"]')?.addEventListener("click", () => container.querySelector("#folder-input")?.click());

	const sidebar = container.querySelector("#chat-sidebar");
	const overlay = document.getElementById("mobile-overlay");
	const chatPanel = container.querySelector("#chat-panel");
	const chatFloatingWindow = container.querySelector('.floating-window[data-window="chat"]');
	const participantsFloatingWindow = container.querySelector('.floating-window[data-window="participants"]');

	/** Dim overlay only on narrow viewports (like @media max-width: 768px) — no fullscreen filter on grid desktop. */
	const syncMobileMeetingOverlay = () => {
		if (!overlay) return;
		const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
		const panelOpen = sidebar?.classList.contains("chat__sidebar--open") || chatPanel?.classList.contains("chat-panel--open");
		if (narrow && panelOpen) overlay.removeAttribute("hidden");
		else overlay.setAttribute("hidden", "");
	};
	window.addEventListener("resize", syncMobileMeetingOverlay, { signal: vSignal });
	requestAnimationFrame(syncMobileMeetingOverlay);

	const collapseMeetingMore = () => {
		container.querySelectorAll(".meeting-control-bar").forEach((bar) => bar.classList.remove("meeting-control-bar--more-open"));
		container.querySelectorAll('[data-action="toggle-meeting-more"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
	};
	const toggleSidebar = () => {
		collapseMeetingMore();
		if (participantsFloatingWindow) {
			callbacks.onFloatingParticipantsToggle?.();
		} else {
			sidebar?.classList.toggle("chat__sidebar--open");
			syncMobileMeetingOverlay();
		}
	};
	const toggleChatPanel = () => {
		collapseMeetingMore();
		if (chatFloatingWindow) {
			callbacks.onFloatingChatToggle?.();
		} else {
			const wasOpen = chatPanel?.classList.contains("chat-panel--open");
			chatPanel?.classList.toggle("chat-panel--open");
			if (!wasOpen && chatPanel?.classList.contains("chat-panel--open")) callbacks.onChatPanelOpen?.();
			syncMobileMeetingOverlay();
		}
	};
	const closeOverlays = () => {
		sidebar?.classList.remove("chat__sidebar--open");
		chatPanel?.classList.remove("chat-panel--open");
		if (chatFloatingWindow) {
			callbacks.onDismissFloatingMobileOverlays?.();
		}
		overlay?.setAttribute("hidden", "");
	};

	container.querySelectorAll('[data-action="toggle-sidebar"]').forEach((el) => el.addEventListener("click", toggleSidebar));
	container.querySelectorAll('[data-action="close-sidebar"]').forEach((el) =>
		el.addEventListener("click", () => {
			if (participantsFloatingWindow) callbacks.onFloatingParticipantsClose?.();
			else {
				sidebar?.classList.remove("chat__sidebar--open");
				syncMobileMeetingOverlay();
			}
		})
	);
	if (chatFloatingWindow) {
		chatFloatingWindow.addEventListener("mousedown", () => {
			callbacks.onFloatingChatMouseDown?.();
		});
	}
	container.querySelectorAll('[data-action="toggle-chat-panel"]').forEach((el) => el.addEventListener("click", toggleChatPanel));
	container.querySelector('[data-action="close-chat-panel"]')?.addEventListener("click", () => {
		if (chatFloatingWindow) callbacks.onFloatingChatClose?.();
		else {
			chatPanel?.classList.remove("chat-panel--open");
			syncMobileMeetingOverlay();
		}
	});
	container.querySelector('[data-action="minimize-floating-chat"]')?.addEventListener("click", () => {
		callbacks.onMinimizeFloatingChat?.();
	});
	container.querySelector('[data-action="minimize-floating-participants"]')?.addEventListener("click", () => {
		callbacks.onMinimizeFloatingParticipants?.();
	});
	container.querySelector('[data-action="minimize-floating-videos"]')?.addEventListener("click", () => {
		callbacks.onMinimizeFloatingVideos?.();
	});
	overlay?.addEventListener("click", closeOverlays);

	return {
		getInputValue: () => input?.value?.trim() ?? "",
		clearInput: () => {
			if (input) input.value = "";
		},
		onFileSelect: callbacks.onFileSelect,
		setGiphyHint: (text) => {
			const el = container.querySelector("#giphy-hint");
			if (el) el.textContent = text;
		},
		setGiphyResults: (gifs) => {
			const grid = container.querySelector("#giphy-grid");
			if (!grid) return;
			grid.innerHTML = gifs
				.map(
					(g) =>
						`<button type="button" class="giphy-picker__item" data-url="${escapeAttr(g.url)}" data-preview="${escapeAttr(g.preview || g.url)}"><img src="${escapeAttr(g.preview || g.url)}" alt="" loading="lazy" /></button>`
				)
				.join("");
		},
		setGiphyPreview: (gifs) => {
			const wrap = container.querySelector("#chat-gif-preview");
			if (!wrap) return;
			if (!gifs?.length) {
				wrap.innerHTML = "";
				wrap.setAttribute("hidden", "");
				return;
			}
			wrap.innerHTML = gifs
				.map(
					(g, i) =>
						`<div class="chat__gif-preview-item"><img class="chat__gif-preview-img" src="${escapeAttr(g.previewUrl || g.url)}" alt="" /><button type="button" class="chat__gif-preview-remove" data-action="remove-gif" data-index="${i}" aria-label="${escapeAttr(t("close"))}">${iconX()}</button></div>`
				)
				.join("");
			wrap.removeAttribute("hidden");
		}
	};
}
