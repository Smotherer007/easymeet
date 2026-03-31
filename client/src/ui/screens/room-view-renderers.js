/**
 * Render helpers for room-view (rule: ≤20 lines per function)
 */
import { t } from "../../i18n.js";
import { DEFAULT_AUDIO_SETTINGS, speakingThresholdToSensitivityPercent } from "../../effects/storage/audioSettingsStorage.js";
import {
	iconDownload,
	iconLoader2,
	iconMic,
	iconMicOff,
	iconMonitor,
	iconMonitorOff,
	iconMaximize2,
	iconVolume2,
	iconVolumeX,
	iconX,
	iconMinus,
	iconChevronDown,
	iconChevronUp,
	iconSmile,
	iconImage,
	iconSend,
	iconMoreHorizontal,
	iconSettings,
	iconUpload,
	iconMessageSquare,
	iconLayoutGrid,
	iconUsers,
	iconShare2,
	iconPhoneOff,
	iconVideoOff,
	iconVideo,
	iconGrip,
	iconLogoWordmark,
	iconHand,
	iconBarChart2,
	iconRefreshCw
} from "../../icons.js";
import { replaceEmojiShortcodes } from "../../utils/emojiShortcodes.js";
import { renderChatContent } from "../../link-embed.js";
import { EMOJI_DATA } from "../../emoji-data.js";
import { escapeHtml, escapeAttr } from "../../shared/escape.js";
import { REACTION_EFFECT_IDS } from "../../shared/reactionEffectIds.js";
import { mergeAndClampWindowRect } from "../utils/viewportWindowClamp.js";
import { draggableRectInlineStyle } from "../utils/draggableRect.js";
import { WINDOW_POSITION_DEFAULTS } from "../../shared/windowPositionsDefaults.js";
export { escapeHtml, escapeAttr };

export function formatTime(ts) {
	if (!ts) return "";
	const d = new Date(ts);
	return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function renderJoinMessage(m) {
	return `<div class="chat__msg chat__system-msg"><div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(m.nick)} ${t("participantJoined")}</span><span class="chat__msg-time">${formatTime(m.ts || Date.now())}</span></div></div>`;
}

function renderLeaveMessage(m) {
	return `<div class="chat__msg chat__system-msg"><div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(m.nick)} ${t("participantLeft")}</span><span class="chat__msg-time">${formatTime(m.ts || Date.now())}</span></div></div>`;
}

function renderChatMessage(m, myNick) {
	const parts = [];
	if (m.text?.trim()) {
		const expanded = replaceEmojiShortcodes(m.text);
		parts.push(renderChatContent(expanded, escapeHtml, t("openInNewTab")));
	}
	const urls = m.giphyUrls?.length ? m.giphyUrls : m.giphyUrl ? [m.giphyUrl] : [];
	urls.forEach((u) => parts.push(`<span class="chat__gif-wrap"><img src="${escapeAttr(u)}" alt="GIF" class="chat__gif" loading="lazy" /></span>`));
	const content = parts.length ? parts.join("") : "";
	const isSelf = m.nick === (myNick ?? "");
	const selfClass = isSelf ? " chat__msg--self" : "";
	return content
		? `<div class="chat__msg${selfClass}"><div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(m.nick ?? "?")}</span><span class="chat__msg-time">${formatTime(m.ts)}</span></div><div class="chat__msg-body">${content}</div></div>`
		: "";
}

export function renderFileShareBody(fileId, nick, filename, hasBlob) {
	const label = `${escapeHtml(nick || "?")} ${t("fileShared")}: ${escapeHtml(filename || "?")}`;
	const iconHtml = hasBlob
		? `<button type="button" class="chat__file-download-btn" data-action="download-file" data-file-id="${escapeAttr(fileId)}" title="${escapeAttr(t("download"))}" aria-label="${escapeAttr(t("download"))}">${iconDownload()}</button>`
		: `<span class="chat__file-loading">${iconLoader2()}</span>`;
	return `<span class="chat__file-share-label">${label}</span>${iconHtml}`;
}

function renderFileShareMessage(m, getFileBlob, myNick) {
	const fileId = m.fileId || "";
	const hasBlob = getFileBlob?.(fileId);
	const bodyHtml = renderFileShareBody(fileId, m.nick, m.filename, hasBlob);
	const isSelf = m.nick === (myNick ?? "");
	const selfClass = isSelf ? " chat__msg--self" : "";
	return `<div class="chat__msg chat__msg--file-share${selfClass}" data-file-id="${escapeAttr(fileId)}"><div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(m.nick ?? "?")}</span><span class="chat__msg-time">${formatTime(m.ts)}</span></div><div class="chat__msg-body chat__file-share-body">${bodyHtml}</div></div>`;
}

export function renderMessagesHtml(messages, getFileBlob, myNick) {
	return (messages || [])
		.map((m) => {
			if (m.type === "join") return renderJoinMessage(m);
			if (m.type === "leave") return renderLeaveMessage(m);
			if (m.type === "chat") return renderChatMessage(m, myNick);
			if (m.type === "file_share") return renderFileShareMessage(m, getFileBlob, myNick);
			return "";
		})
		.filter(Boolean)
		.join("");
}

export function renderVoipParticipantHtmlFloating(m, state) {
	const { muteMap, volumeMap, myPeerId, isMuted } = state;
	const nick = m.nick ?? "?";
	const peerId = m.peerId ?? "";
	const handMark = m.handRaised ? `<span class="voip-view__hand" title="${escapeAttr(t("handRaisedMarker"))}">✋</span>` : "";
	const isSelf = peerId === myPeerId;
	const memberMuted = isSelf ? isMuted : (muteMap.get(peerId) ?? false);
	const vol = volumeMap.get(peerId) ?? 100;
	const streaming = state.screenStreams?.has?.(peerId);
	const volumeControl =
		!isSelf && !memberMuted
			? `<div class="voip-view__volume-wrap" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("volume"))}"><button type="button" class="voip-view__participant-status voip-view__volume-trigger" data-action="volume-toggle" aria-label="${escapeAttr(t("volume"))}" title="${escapeAttr(t("volume"))}">${iconMic()}</button><div class="voip-view__volume-tooltip"><input type="range" class="voip-view__volume-slider" min="0" max="200" value="${vol}" data-peer-id="${escapeAttr(peerId)}" /></div></div>`
			: `<div class="voip-view__participant-status" title="${escapeAttr(memberMuted ? t("muted") : t("unmuted"))}">${memberMuted ? iconMicOff() : iconMic()}</div>`;
	const streamHtml = streaming
		? `<div class="voip-view__participant-stream" data-action="open-stream-modal" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("clickToExpand"))}"><video class="voip-view__stream-thumb" autoplay playsinline muted disablepictureinpicture></video></div>`
		: "";
	return `<div class="voip-view__participant" data-peer-id="${escapeAttr(peerId)}" data-self="${isSelf}"><div class="voip-view__participant-info"><div class="voip-view__participant-name">${escapeHtml(nick)}${handMark}</div><div class="voip-view__participant-status-row">${volumeControl}</div></div>${streamHtml}</div>`;
}

export function renderVoipParticipantsHtmlFloating(voipMembers, state) {
	return (voipMembers || []).map((m) => renderVoipParticipantHtmlFloating(m, state)).join("");
}

export function getWindowPositions(defaults, windowPositions) {
	const pos = (id) => {
		const d = defaults[id] || { x: 20, y: 80, w: 400, h: 300 };
		const p = windowPositions[id] || {};
		return mergeAndClampWindowRect(id, d, p);
	};
	return pos;
}

export function renderLeaveRoomModal() {
	return `
    <div class="leave-room-modal" id="leave-room-modal" hidden role="dialog" aria-modal="true" aria-labelledby="leave-room-modal-title">
      <div class="leave-room-modal__backdrop" data-action="leave-cancel"></div>
      <div class="leave-room-modal__panel">
        <h2 class="leave-room-modal__title" id="leave-room-modal-title">${escapeHtml(t("leaveRoomTitle"))}</h2>
        <p class="leave-room-modal__body">${escapeHtml(t("leaveRoomBody"))}</p>
        <div class="leave-room-modal__actions">
          <button type="button" class="btn btn--secondary" data-action="leave-cancel">${escapeHtml(t("leaveRoomStay"))}</button>
          <button type="button" class="btn btn--danger" data-action="leave-confirm">${escapeHtml(t("leaveRoomConfirmLeave"))}</button>
        </div>
      </div>
    </div>
  `;
}

/** Symbole + i18n-Keys — Reihenfolge kommt aus `REACTION_EFFECT_IDS`. */
const REACTION_EFFECT_POPOVER_META = {
	confetti: { sym: "🎊", key: "reactionEffectConfetti" },
	fireworks: { sym: "🎆", key: "reactionEffectFireworks" },
	sparkles: { sym: "✨", key: "reactionEffectSparkles" },
	hearts: { sym: "💕", key: "reactionEffectHearts" },
	bubbles: { sym: "🫧", key: "reactionEffectBubbles" },
	meteors: { sym: "💫", key: "reactionEffectMeteors" }
};

function renderReactionPopoverBody() {
	const reactionEmojis = ["👍", "👏", "😂", "😮", "❤️", "🎉"];
	const reactionBtns = reactionEmojis
		.map(
			(e) =>
				`<button type="button" class="reaction-popover__btn" data-action="send-reaction" data-emoji="${escapeAttr(e)}" title="${escapeAttr(e)}">${e}</button>`
		)
		.join("");
	const effects = REACTION_EFFECT_IDS.map((id) => ({ id, ...REACTION_EFFECT_POPOVER_META[id] }));
	const effectBtns = effects
		.map(
			(f) =>
				`<button type="button" class="reaction-popover__btn" data-action="send-reaction-effect" data-effect="${escapeAttr(f.id)}" title="${escapeAttr(t(f.key))}" aria-label="${escapeAttr(t(f.key))}">${f.sym}</button>`
		)
		.join("");
	return `
    <div class="reaction-popover__section reaction-popover__section--emoji">${reactionBtns}</div>
    <div class="reaction-popover__divider" role="separator" aria-hidden="true"></div>
    <div class="reaction-popover__effects-label">${escapeHtml(t("reactionEffectsLabel"))}</div>
    <div class="reaction-popover__section reaction-popover__section--effects">${effectBtns}</div>
  `;
}

/**
 * Gemeinsame Steuerleiste: Desktop eine Reihe; Smartphone bis 768px Grid mit 6 Icons pro Reihe (alle sichtbar).
 */
function renderMeetingControlBarInner(state) {
	const {
		isMuted,
		isVideoEnabled,
		hostStream,
		hasScreenShareSupport,
		unreadChatCount,
		roomId,
		videoLayoutMode = "grid",
		myHandRaised = false,
		settingsPanelOpen = false
	} = state;
	const screenSlot = hasScreenShareSupport
		? `<span class="meeting-control-bar__screen-slot">${renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream })}</span>`
		: "";
	const moreLabel = escapeAttr(t("moreControls"));
	const inFree = videoLayoutMode === "free";
	const layoutTitle = inFree ? t("layoutGrid") : t("layoutFree");
	const layoutIcon = inFree ? iconLayoutGrid() : iconGrip();
	const handTitle = myHandRaised ? t("lowerHand") : t("raiseHand");
	const reactionPopoverInner = renderReactionPopoverBody();
	const resetFreeBtn = inFree
		? `<button type="button" class="meeting-control-btn meeting-control-btn--reset-layout" data-action="reset-free-layout" title="${escapeAttr(t("freeLayoutResetLayout"))}" aria-label="${escapeAttr(t("freeLayoutResetLayout"))}">${iconRefreshCw()}</button>`
		: "";
	return `
    <div class="meeting-control-bar__primary">
      <button type="button" class="meeting-control-btn chat__mute-btn--${isMuted ? "muted" : "unmuted"}" data-action="toggle-mute" aria-pressed="${isMuted ? "true" : "false"}" title="${escapeAttr(isMuted ? t("unmute") : t("mute"))}">${isMuted ? iconMicOff() : iconMic()}</button>
      <button type="button" class="meeting-control-btn video-btn--${isVideoEnabled ? "on" : "off"}" data-action="toggle-video" aria-pressed="${isVideoEnabled ? "true" : "false"}" title="${escapeAttr(isVideoEnabled ? t("cameraOn") : t("cameraOff"))}">${isVideoEnabled ? iconVideo() : iconVideoOff()}</button>
      <button class="meeting-control-btn meeting-control-btn--leave" data-action="leave" title="${escapeAttr(t("leaveRoom"))}">${iconPhoneOff()}</button>
      <button class="meeting-control-btn meeting-control-btn--chat" data-action="toggle-chat-panel" title="${escapeAttr(t("tabChat"))}"><span class="meeting-control-btn__icon-wrap">${iconMessageSquare()}<span class="chat-badge" id="chat-badge" ${unreadChatCount > 0 ? "" : "hidden"}>${unreadChatCount > 99 ? "99+" : unreadChatCount}</span></span></button>
      <button class="meeting-control-btn" data-action="toggle-sidebar" title="${escapeAttr(t("participants"))}">${iconUsers()}</button>
    </div>
    <button type="button" class="meeting-control-btn meeting-control-btn--more" data-action="toggle-meeting-more" aria-label="${moreLabel}" aria-expanded="false" title="${moreLabel}">${iconMoreHorizontal()}</button>
    <div class="meeting-control-bar__secondary">
      <div class="reaction-popover-wrap">
        <button type="button" class="meeting-control-btn" data-action="toggle-reaction-popover" aria-expanded="false" aria-haspopup="true" title="${escapeAttr(t("reactionsTitle"))}">${iconSmile()}</button>
        <div class="reaction-popover" id="reaction-popover" hidden role="menu">${reactionPopoverInner}</div>
      </div>
      <button type="button" class="meeting-control-btn meeting-control-btn--hand${myHandRaised ? " meeting-control-btn--active" : ""}" data-action="toggle-hand" title="${escapeAttr(handTitle)}" aria-pressed="${myHandRaised ? "true" : "false"}">${iconHand()}</button>
      <button type="button" class="meeting-control-btn" data-action="toggle-polls-panel" title="${escapeAttr(t("pollsToggle"))}">${iconBarChart2()}</button>
      ${screenSlot}
      ${roomId ? `<button class="meeting-control-btn" data-action="share" title="${escapeAttr(t("shareRoom"))}">${iconShare2()}</button>` : ""}
      ${resetFreeBtn}
      <button type="button" class="meeting-control-btn meeting-control-btn--layout" data-action="toggle-video-layout" title="${escapeAttr(layoutTitle)}" aria-label="${escapeAttr(layoutTitle)}">${layoutIcon}</button>
      <button type="button" class="meeting-control-btn meeting-control-btn--settings" data-action="toggle-settings" aria-expanded="${settingsPanelOpen ? "true" : "false"}" title="${escapeAttr(t("settings"))}" aria-label="${escapeAttr(t("settings"))}">${iconSettings()}</button>
    </div>
  `;
}

/** Screen-share control in bar — slot hot-swappable without full re-render. */
export function renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream }) {
	if (!hasScreenShareSupport) return "";
	if (hostStream) {
		return `<button type="button" class="meeting-control-btn meeting-control-btn--danger" id="stop-screen-btn" title="${escapeAttr(t("stopSharingToolbar"))}">${iconMonitorOff()}</button>`;
	}
	return `<button type="button" class="meeting-control-btn" id="start-screen-btn" title="${escapeAttr(t("startSharing"))}">${iconMonitor()}</button>`;
}

/** Audio (room host) + stop share (when self is sharing, hostStream). */
export function renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled }) {
	if (!hostStream) return "";
	let html = "";
	if (isHost && hostStream?.getAudioTracks?.().length) {
		const audioPart = `${audioEnabled ? iconVolume2() : iconVolumeX()} ${escapeHtml(audioEnabled ? t("audioOn") : t("audioOff"))}`;
		html += `<button type="button" class="btn btn--ghost btn--sm" id="audio-screen-btn">${audioPart}</button>`;
	}
	const stopLabel = escapeHtml(t("stopSharing"));
	const stopTitleAttr = escapeAttr(t("stopSharing"));
	html += `<button type="button" class="btn btn--ghost btn--sm stream-modal__stop-share-btn" data-action="stop-screen-share" title="${stopTitleAttr}" aria-label="${stopTitleAttr}">${iconMonitorOff()} ${stopLabel}</button>`;
	return html;
}

export function renderMeetingControlBarFloating(state) {
	return renderMeetingControlBarInner(state);
}

export function renderFloatingWindowVideos(pos, isOpen = true) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--videos draggable-rect${hiddenCls}" data-window="videos" data-draggable style="${draggableRectInlineStyle(pos)}">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("videos")}</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize" data-action="minimize-floating-videos" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="meeting-videos-stack">
          <div class="video-gallery video-gallery--grid" id="video-gallery" data-layout-mode="grid"></div>
          <div class="reaction-float-layer" id="reaction-float-layer" aria-hidden="true"></div>
        </div>
      </div>
      <div class="floating-window__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
    </div>
  `;
}

export function renderFloatingWindowChat(pos, messagesHtml, isOpen = false) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--chat draggable-rect${hiddenCls}" data-window="chat" data-draggable style="${draggableRectInlineStyle(pos)}">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("tabChat")}</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize" data-action="minimize-floating-chat" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="chat__messages-wrap chat__messages-wrap--overlay" id="chat-dropzone">
          <div class="chat__messages" id="chat-messages">${messagesHtml || '<div class="chat__empty">' + t("typeMessage") + "</div>"}</div>
          <button type="button" class="chat__scroll-to-bottom" id="chat-scroll-to-bottom" hidden title="${escapeAttr(t("scrollToBottom"))}">${iconChevronDown()}</button>
        </div>
        <div class="chat__input-wrap">
          <div class="chat__gif-preview" id="chat-gif-preview" hidden></div>
          <div class="chat__input-row">
            <div class="emoji-picker" id="emoji-picker" hidden>
              <div class="emoji-picker__header"><span class="emoji-picker__title">${t("emoji")}</span><button type="button" class="emoji-picker__close" data-action="close-emoji">${iconX()}</button></div>
              <input type="text" class="emoji-picker__search" id="emoji-search" placeholder="${t("emojiSearch")}" />
              <div class="emoji-picker__grid" id="emoji-grid">${EMOJI_DATA.slice(0, 500)
					.map(([e]) => `<button type="button" class="emoji-picker__btn" data-emoji="${escapeAttr(e)}">${e}</button>`)
					.join("")}</div>
            </div>
            <div class="giphy-picker" id="giphy-picker" hidden>
              <div class="giphy-picker__header"><span class="giphy-picker__title">${t("giphy")}</span><button type="button" class="giphy-picker__close" data-action="close-giphy">${iconX()}</button></div>
              <input type="text" class="giphy-picker__search" id="giphy-search" placeholder="${t("giphySearch")}" />
              <div class="giphy-picker__grid" id="giphy-grid"></div>
              <p class="giphy-picker__hint" id="giphy-hint"></p>
            </div>
            <div class="chat__more-wrap">
              <button type="button" class="btn btn--ghost chat__more-btn" data-action="toggle-chat-more" title="${escapeAttr(t("more"))}">${iconMoreHorizontal()}</button>
              <div class="chat__more-menu" id="chat-more-menu" hidden>
                <button type="button" class="chat__more-item" data-action="emoji">${iconSmile()} ${t("emoji")}</button>
                <button type="button" class="chat__more-item" data-action="giphy">${iconImage()} ${t("giphy")}</button>
                <button type="button" class="chat__more-item" data-action="open-file-modal">${iconUpload()} ${t("uploadFiles")}</button>
              </div>
            </div>
            <input type="text" class="chat__input" id="chat-input" placeholder="${t("typeMessage")}" maxlength="2000" />
            <button class="btn btn--primary chat__send-btn" data-action="send">${iconSend()}</button>
          </div>
        </div>
      </div>
      <div class="floating-window__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
    </div>
  `;
}

export function renderFloatingWindowParticipants(pos, voipParticipantsHtml, voipMembersLength, isOpen = false) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--participants draggable-rect${hiddenCls}" data-window="participants" data-draggable style="${draggableRectInlineStyle(pos)}">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("participants")} (<span id="participant-count">${voipMembersLength}</span>)</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize chat__sidebar-close" data-action="minimize-floating-participants" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="voip-view__participant-list" id="participant-list">${voipParticipantsHtml || '<p class="voip-view__empty">' + t("participants") + "</p>"}</div>
      </div>
      <div class="floating-window__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
    </div>
  `;
}

export function renderStreamModalFloating(pos, state) {
	const { isHost, hostStream, audioEnabled } = state;
	return `
    <div class="stream-modal" id="stream-modal" hidden>
      <div class="stream-modal__content draggable-rect" data-draggable data-window="stream" style="${draggableRectInlineStyle(pos)}">
        <div class="stream-modal__header" data-drag-handle>
          <span class="stream-modal__title" id="stream-modal-title">${t("screenStream")}</span>
          <div class="stream-modal__actions">
            <button class="btn btn--ghost btn--sm" id="stream-fullscreen-btn" title="${escapeAttr(t("fullscreen"))}">${iconMaximize2()}</button>
            <button class="btn btn--ghost btn--sm" id="stream-pip-btn" title="${escapeAttr(t("pip"))}">${iconVideo()}</button>
            <span class="stream-modal__host-actions-slot">${renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled })}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-stream-modal" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
          </div>
        </div>
        <div class="stream-modal__video-wrap">
          <video id="stream-modal-video" autoplay playsinline></video>
        </div>
        <div class="stream-modal__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
      </div>
    </div>
  `;
}

export function renderVoipParticipantHtmlGrid(m, ctx) {
	const { muteMap, volumeMap, videoMap, bgEffectMap, myPeerId, isMuted, isVideoEnabled, backgroundEffect, getStreamForPeerId } = ctx;
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
					return (s?.getVideoTracks?.().length ?? 0) > 0;
				})();
	const vol = volumeMap.get(peerId) ?? 100;
	const streaming = ctx.isStreaming?.(peerId);
	const showThumb = !!streaming;
	const volumeControl =
		!isSelf && !memberMuted
			? `<div class="voip-view__volume-wrap" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("volume"))}"><button type="button" class="voip-view__participant-status voip-view__volume-trigger" data-action="volume-toggle" aria-label="${escapeAttr(t("volume"))}" title="${escapeAttr(t("volume"))}">${iconMic()}</button><div class="voip-view__volume-tooltip"><input type="range" class="voip-view__volume-slider" min="0" max="200" value="${vol}" data-peer-id="${escapeAttr(peerId)}" /></div></div>`
			: `<div class="voip-view__participant-status" title="${escapeAttr(memberMuted ? t("muted") : t("unmuted"))}">${memberMuted ? iconMicOff() : iconMic()}</div>`;
	const hasBgEffect = isSelf ? (backgroundEffect || "none") !== "none" : (bgEffectMap.get(peerId) || "none") !== "none";
	const streamHtml = showThumb
		? `<div class="voip-view__participant-stream" data-action="open-stream-modal" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("clickToExpand"))}"><video class="voip-view__stream-thumb" autoplay playsinline muted disablepictureinpicture></video></div>`
		: "";
	return `<div class="voip-view__participant" data-peer-id="${escapeAttr(peerId)}" data-self="${isSelf}" data-has-background-effect="${hasBgEffect}"><div class="voip-view__participant-info"><div class="voip-view__participant-name">${escapeHtml(nick)}</div><div class="voip-view__participant-status-row">${volumeControl}</div></div>${streamHtml}</div>`;
}

export function renderVoipParticipantsHtmlGrid(voipMembers, ctx) {
	return (voipMembers || []).map((m) => renderVoipParticipantHtmlGrid(m, ctx)).join("");
}

export function renderScreenShareBannerHtml(peerId, entry, myPeerId) {
	const nick = entry?.nick ?? "?";
	const isSelf = peerId === myPeerId;
	const label = isSelf ? t("sharingScreenYou") : escapeHtml(nick) + " " + t("sharingScreen");
	return `<div class="room-view__screen-share-banner" data-action="open-stream-modal" data-peer-id="${escapeAttr(peerId)}" title="${escapeAttr(t("clickToExpand"))}">${iconMonitor()} <span>${label}</span></div>`;
}

export function renderScreenShareBannersHtml(screenStreams, myPeerId) {
	const streams = screenStreams instanceof Map ? screenStreams : new Map();
	const html = [...streams.entries()].map(([peerId, entry]) => renderScreenShareBannerHtml(peerId, entry, myPeerId)).join("");
	return html ? `<div class="room-view__screen-share-banners">${html}</div>` : "";
}

export function renderRoomViewHeader(meetingTitle) {
	const latencyTitle = escapeAttr(t("roomMediaLatencyTitle"));
	const latencyPlaceholder = escapeHtml(t("roomMediaLatencyNone"));
	return `
    <div class="room-view__header room-view__header--centered">
      <div class="room-view__header-brand">
        <a href="/" class="room-view__logo-link">${iconLogoWordmark({ width: "110px", height: "28px" })}</a>
        <span class="room-view__header-sep"></span>
        <span class="room-view__meeting-title">${escapeHtml(meetingTitle)}</span>
        <span class="room-view__media-latency" id="room-view-media-latency" role="status" title="${latencyTitle}" aria-label="${latencyTitle}" aria-live="polite">${latencyPlaceholder}</span>
      </div>
    </div>
  `;
}

/** @param {{ x: number; y: number; w: number; h: number }} positionRect */
export function renderShareModalContent(roomId, formattedRoomId, joinUrl, renderShareContent, positionRect) {
	const content = roomId ? renderShareContent(roomId, formattedRoomId, joinUrl, { qrCanvasId: "share-qr-canvas", qrContainerId: "share-qr-container", showOpenLink: false }) : "";
	return `
    <div class="share-modal" id="share-modal" hidden>
      <div class="share-modal__content draggable-rect" data-draggable data-window="share" style="${draggableRectInlineStyle(positionRect)}">
        <div class="share-modal__header" data-drag-handle>
          <h3 class="share-modal__title">${t("roomCreated")}</h3>
          <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-share-modal" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
        </div>
        <div class="share-modal__body">
          ${content}
        </div>
        <div class="share-modal__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
      </div>
    </div>
  `;
}

export function renderMeetingControlBarGrid(state) {
	return `<div class="meeting-control-bar" id="meeting-control-bar">${renderMeetingControlBarInner(state)}</div>`;
}

export function renderChatPanelContent(messagesHtml, voipParticipantsHtml, voipMembersLength) {
	return `
    <aside class="chat__sidebar chat__sidebar--voip chat__sidebar--overlay" id="chat-sidebar">
      <div class="chat__sidebar-header">
        <h3 class="chat__sidebar-title">${t("participants")} (<span id="participant-count">${voipMembersLength}</span>)</h3>
        <button class="btn btn--ghost btn--sm chat__sidebar-close" data-action="close-sidebar">${iconX()}</button>
      </div>
      <div class="voip-view__participant-list" id="participant-list">${voipParticipantsHtml || '<p class="voip-view__empty">' + t("participants") + "</p>"}</div>
    </aside>
    <div class="chat__resize-handle chat__resize-handle--hidden" id="chat-resize-handle" title="${escapeAttr(t("resize"))}"></div>
    <div class="chat-panel chat-panel--overlay" id="chat-panel">
      <div class="chat-panel__header">
        <h3 class="chat-panel__title">${t("tabChat")}</h3>
        <button class="btn btn--ghost btn--sm" data-action="close-chat-panel">${iconX()}</button>
      </div>
      <div class="chat__messages-wrap chat__messages-wrap--overlay" id="chat-dropzone">
        <div class="chat__messages" id="chat-messages">${messagesHtml || '<div class="chat__empty">' + t("typeMessage") + "</div>"}</div>
        <button type="button" class="chat__scroll-to-bottom" id="chat-scroll-to-bottom" hidden title="${escapeAttr(t("scrollToBottom"))}">${iconChevronDown()}</button>
      </div>
      <div class="chat__input-wrap">
        <div class="chat__gif-preview" id="chat-gif-preview" hidden></div>
        <div class="chat__input-row">
          <div class="emoji-picker" id="emoji-picker" hidden>
            <div class="emoji-picker__header"><span class="emoji-picker__title">${t("emoji")}</span><button type="button" class="emoji-picker__close" data-action="close-emoji">${iconX()}</button></div>
            <input type="text" class="emoji-picker__search" id="emoji-search" placeholder="${t("emojiSearch")}" />
            <div class="emoji-picker__grid" id="emoji-grid">${EMOJI_DATA.slice(0, 500)
				.map(([e]) => `<button type="button" class="emoji-picker__btn" data-emoji="${escapeAttr(e)}">${e}</button>`)
				.join("")}</div>
          </div>
          <div class="giphy-picker" id="giphy-picker" hidden>
            <div class="giphy-picker__header"><span class="giphy-picker__title">${t("giphy")}</span><button type="button" class="giphy-picker__close" data-action="close-giphy">${iconX()}</button></div>
            <input type="text" class="giphy-picker__search" id="giphy-search" placeholder="${t("giphySearch")}" />
            <div class="giphy-picker__grid" id="giphy-grid"></div>
            <p class="giphy-picker__hint" id="giphy-hint"></p>
          </div>
          <div class="chat__more-wrap">
            <button type="button" class="btn btn--ghost chat__more-btn" data-action="toggle-chat-more" title="${escapeAttr(t("more"))}">${iconMoreHorizontal()}</button>
            <div class="chat__more-menu" id="chat-more-menu" hidden>
              <button type="button" class="chat__more-item" data-action="emoji">${iconSmile()} ${t("emoji")}</button>
              <button type="button" class="chat__more-item" data-action="giphy">${iconImage()} ${t("giphy")}</button>
              <button type="button" class="chat__more-item" data-action="open-file-modal">${iconUpload()} ${t("uploadFiles")}</button>
            </div>
          </div>
          <input type="text" class="chat__input" id="chat-input" placeholder="${t("typeMessage")}" maxlength="2000" />
          <button class="btn btn--primary chat__send-btn" data-action="send">${iconSend()}</button>
        </div>
      </div>
    </div>
    <div class="chat__resize-handle chat__resize-handle--hidden" id="chat-resize-handle-right" title="${escapeAttr(t("resize"))}"></div>
  `;
}

/** Server: min. 2, max. 8 Optionen (protoo poll_create). */
export const POLL_CREATE_MAX_OPTIONS = 8;

/**
 * @param {number} optionNumber 1-based for placeholder “Answer 1” …
 */
export function renderPollOptionRowHtml(optionNumber) {
	const p1 = escapeAttr(t("pollOptionPlaceholder"));
	const removeLabel = escapeAttr(t("pollRemoveOption"));
	return `<div class="poll-create__option-row">
    <input type="text" class="poll-create__input poll-create__input--option poll-create-option" maxlength="80" placeholder="${p1} ${optionNumber}" autocomplete="off" />
    <button type="button" class="poll-create__row-remove btn btn--ghost btn--sm" data-action="poll-remove-option" hidden aria-label="${removeLabel}">${iconX()}</button>
  </div>`;
}

function renderPollCreateFormHtml() {
	return `<div class="poll-create">
    <h4 class="poll-create__title">${escapeHtml(t("pollNew"))}</h4>
    <p class="poll-create__error" id="poll-create-error" hidden role="alert"></p>
    <div class="poll-create__fields">
      <input type="text" id="poll-create-question" class="poll-create__input poll-create__input--question" maxlength="200" placeholder="${escapeAttr(t("pollQuestionPlaceholder"))}" autocomplete="off" aria-describedby="poll-create-error" />
      <div class="poll-create__options" id="poll-create-options">
        ${renderPollOptionRowHtml(1)}
        ${renderPollOptionRowHtml(2)}
      </div>
      <button type="button" class="btn btn--ghost btn--sm poll-create__add-option" data-action="poll-add-option">${escapeHtml(t("pollAddOption"))}</button>
    </div>
    <button type="button" class="btn btn--primary btn--sm poll-create__submit" data-action="poll-create-submit">${escapeHtml(t("pollCreate"))}</button>
  </div>`;
}

/**
 * Remove buttons only from 3 rows onward; “Add option” until server limit.
 * @param {HTMLElement} container
 */
export function syncPollCreateOptionUi(container) {
	const wrap = container.querySelector("#poll-create-options");
	if (!wrap) return;
	const rows = wrap.querySelectorAll(".poll-create__option-row");
	const showRemove = rows.length > 2;
	rows.forEach((r) => {
		const btn = r.querySelector('[data-action="poll-remove-option"]');
		if (btn) btn.hidden = !showRemove;
	});
	const addBtn = container.querySelector('[data-action="poll-add-option"]');
	if (addBtn) {
		const atMax = rows.length >= POLL_CREATE_MAX_OPTIONS;
		addBtn.disabled = atMax;
		addBtn.title = atMax ? t("pollMaxOptions") : "";
	}
}

function renderOnePollBlock(poll, myId, participantCount = 0) {
	const closed = !!poll.closed;
	const opts = poll.options || [];
	const tallies = poll.tallies || opts.map(() => 0);
	const totalVotes = tallies.reduce((a, b) => a + b, 0);
	/** Bar: share of room participants (visual feedback); fallback to vote share when no member list. */
	const barDenominator =
		participantCount > 0 ? participantCount : totalVotes > 0 ? totalVotes : 1;
	const barPct = (votes) =>
		barDenominator > 0 ? Math.min(100, Math.round((votes / barDenominator) * 100)) : 0;

	const rows = opts
		.map((opt, i) => {
			const c = tallies[i] ?? 0;
			const pct = barPct(c);
			if (!closed) {
				return `<button type="button" class="poll-option-btn" data-action="poll-vote" data-poll-id="${escapeAttr(poll.id)}" data-option-index="${i}">
          <div class="poll-option-btn__progress" style="--progress-pct: ${pct}%"></div>
          <span class="poll-option-btn__label">${escapeHtml(opt)}</span>
          <span class="poll-option-btn__tally">${c}</span>
        </button>`;
			}
			return `<div class="poll-option-result">
        <div class="poll-option-result__progress" style="--progress-pct: ${pct}%"></div>
        <span>${escapeHtml(opt)}</span>
        <span>${c}</span>
      </div>`;
		})
		.join("");
	const closeBtn =
		poll.creatorPeerId === myId && !closed
			? `<button type="button" class="btn btn--ghost btn--sm poll-card__close" data-action="poll-close" data-poll-id="${escapeAttr(poll.id)}">${escapeHtml(t("pollClose"))}</button>`
			: "";
	const status = closed ? `<span class="poll-badge">${escapeHtml(t("pollClosed"))}</span>` : "";
	return `<div class="poll-card" data-poll-id="${escapeAttr(poll.id)}">
    <div class="poll-card__head"><strong>${escapeHtml(poll.question)}</strong>${status}</div>
    <div class="poll-card__options">${rows}</div>
    ${closeBtn}
  </div>`;
}

function renderPollsDockInner(state) {
	const myId = state.peer?.id ?? "";
	const polls = state.roomPolls ?? [];
	const participantCount = state.voipMembers?.length ?? 0;
	let html = polls.map((poll) => renderOnePollBlock(poll, myId, participantCount)).join("");
	if (!polls.length) {
		html += `<p class="polls-dock__empty">${escapeHtml(t("pollsEmpty"))}</p>`;
	}
	html += renderPollCreateFormHtml();
	return html;
}

/** @param {{ x: number; y: number; w: number; h: number }} positionRect */
export function renderPollsDock(positionRect) {
	return `
    <div class="polls-modal" id="polls-modal" hidden>
      <div class="polls-dock polls-modal__content draggable-rect" data-draggable data-window="polls" style="${draggableRectInlineStyle(positionRect)}" aria-label="${escapeAttr(t("pollsTitle"))}">
        <div class="polls-dock__header" data-drag-handle>
          <h3 class="polls-dock__title">${escapeHtml(t("pollsTitle"))}</h3>
          <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-polls-modal" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
        </div>
        <div class="polls-dock__body" id="polls-dock-body"></div>
        <div class="polls-modal__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
      </div>
    </div>`;
}

/** @param {HTMLElement} container @param {object} state */
export function refreshPollsDock(container, state) {
	const body = container.querySelector("#polls-dock-body");
	if (!body) return;
	body.innerHTML = renderPollsDockInner(state);
	syncPollCreateOptionUi(container);
}

/**
 * @param {HTMLElement} container
 * @param {boolean} raised
 */
export function updateHandRaiseMeetingBar(container, raised) {
	container.querySelectorAll('[data-action="toggle-hand"]').forEach((btn) => {
		btn.classList.toggle("meeting-control-btn--active", raised);
		btn.title = raised ? t("lowerHand") : t("raiseHand");
		btn.setAttribute("aria-pressed", raised ? "true" : "false");
	});
}

export function renderGridMeetingSection(state, messagesHtml, voipParticipantsHtml) {
	const controlBar = renderMeetingControlBarGrid(state);
	const chatPanel = renderChatPanelContent(messagesHtml, voipParticipantsHtml, state.voipMembers?.length ?? 0);
	return `
    <div class="meeting-main">
      <div class="meeting-videos-stack">
        <div class="video-gallery video-gallery--grid" id="video-gallery" data-layout-mode="grid"></div>
        <div class="reaction-float-layer" id="reaction-float-layer" aria-hidden="true"></div>
      </div>
    </div>
    ${controlBar}
    ${chatPanel}
  `;
}

/** @param {{ x: number; y: number; w: number; h: number }} positionRect */
export function renderStreamModalGrid(positionRect, state) {
	const { isHost, hostStream, audioEnabled } = state;
	return `
    <div class="stream-modal" id="stream-modal" hidden>
      <div class="stream-modal__content draggable-rect" data-draggable data-window="stream" style="${draggableRectInlineStyle(positionRect)}">
        <div class="stream-modal__header" data-drag-handle>
          <span class="stream-modal__title" id="stream-modal-title">${t("screenStream")}</span>
          <div class="stream-modal__actions">
            <button class="btn btn--ghost btn--sm" id="stream-fullscreen-btn" title="${escapeAttr(t("fullscreen"))}">${iconMaximize2()}</button>
            <button class="btn btn--ghost btn--sm" id="stream-pip-btn" title="${escapeAttr(t("pip"))}">${iconVideo()}</button>
            <span class="stream-modal__host-actions-slot">${renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled })}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-stream-modal" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
          </div>
        </div>
        <div class="stream-modal__video-wrap">
          <video id="stream-modal-video" autoplay playsinline></video>
        </div>
        <div class="stream-modal__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
      </div>
    </div>
  `;
}

function renderEffectTile(bg, backgroundEffect) {
	const fullUrl = bg.url.startsWith("/") ? new URL(bg.url, window.location.origin).href : bg.url;
	const label = bg.label || (bg.labelKey ? t(bg.labelKey) : t("backgroundCustomLabel"));
	const isCustom = bg.id?.startsWith("custom-");
	return `<button type="button" class="effect-tile effect-tile--bg ${backgroundEffect === bg.id ? "effect-tile--selected" : ""}" data-effect="${escapeAttr(bg.id)}" data-custom="${isCustom ? "true" : ""}" title="${escapeAttr(label)}">
    <span class="effect-tile__preview">${isCustom ? `<span role="button" tabindex="0" class="effect-tile__remove" data-action="remove-custom-bg" data-effect-id="${escapeAttr(bg.id)}" title="${escapeAttr(t("removeCustomBackground"))}" aria-label="${escapeAttr(t("removeCustomBackground"))}">${iconX()}</span>` : ""}<img src="${escapeAttr(fullUrl)}" alt="" loading="lazy" /></span>
    <span class="effect-tile__label">${escapeHtml(label)}</span>
  </button>`;
}

export function renderEffectTilesFirst(backgroundImages, backgroundEffect) {
	return (backgroundImages || [])
		.slice(0, 3)
		.map((bg) => renderEffectTile(bg, backgroundEffect))
		.join("");
}

export function renderEffectTilesMore(backgroundImages, backgroundEffect) {
	const more = (backgroundImages || []).slice(3);
	if (!more.length) return "";
	return `<button type="button" class="effect-tiles-expand-btn" id="effect-tiles-expand-btn" data-expanded="false"><span class="effect-tiles-expand-btn__text">${t("showMoreBackgrounds")}</span><span class="effect-tiles-expand-btn__icon">${iconChevronDown()}</span></button><div class="effect-tiles effect-tiles--more" id="effect-tiles-more" hidden>${more.map((bg) => renderEffectTile(bg, backgroundEffect)).join("")}</div>`;
}

export function renderSettingsModalContent(state) {
	const {
		settingsPositionRect = WINDOW_POSITION_DEFAULTS.settings,
		isVideoEnabled,
		hasBackgroundBlur,
		backgroundEffect,
		backgroundImages
	} = state;
	const audioSettings = state.audioSettings && typeof state.audioSettings === "object" ? { ...DEFAULT_AUDIO_SETTINGS, ...state.audioSettings } : { ...DEFAULT_AUDIO_SETTINGS };
	const st = audioSettings.speakingThreshold;
	const stSensitivityPct = speakingThresholdToSensitivityPercent(st);
	const effectTiles = hasBackgroundBlur
		? `<div class="effect-tiles" id="effect-tiles"><button type="button" class="effect-tile ${backgroundEffect === "none" ? "effect-tile--selected" : ""}" data-effect="none" title="${escapeAttr(t("backgroundNone"))}"><span class="effect-tile__preview effect-tile__preview--none">${iconVideo()}</span><span class="effect-tile__label">${t("backgroundNone")}</span></button><button type="button" class="effect-tile ${backgroundEffect === "blur" ? "effect-tile--selected" : ""}" data-effect="blur" title="${escapeAttr(t("backgroundBlur"))}"><span class="effect-tile__preview effect-tile__preview--blur"></span><span class="effect-tile__label">${t("backgroundBlur")}</span></button>${renderEffectTilesFirst(backgroundImages, backgroundEffect)}</div>${renderEffectTilesMore(backgroundImages, backgroundEffect)}<input type="file" id="background-upload-input" accept="image/*" hidden /><button type="button" class="effect-tiles-upload-btn" id="effect-tiles-upload-btn" title="${escapeAttr(t("uploadCustomBackground"))}">${iconUpload()} ${t("uploadCustomBackground")}</button>`
		: `<p class="effect-preview-unsupported" id="effect-preview-unsupported">${t("backgroundEffectsNotSupported")}</p>`;
	const tabsAria = escapeAttr(t("settingsModalTabsAria"));
	const mediaPanel = `
          <div class="settings-modal__section">
            <h4>${t("videoDevice")}</h4>
            <div class="input-group"><select id="video-device"></select></div>
          </div>
          <div class="settings-modal__section">
            <h4>${t("inputDevice")}</h4>
            <div class="input-group"><select id="input-device"></select></div>
          </div>
          <div class="settings-modal__section">
            <h4>${t("outputDevice")}</h4>
            <div class="input-group"><select id="output-device"></select></div>
          </div>`;
	const effectsPanel = `
          <div class="effect-tiles-wrap settings-modal__section" id="effect-tiles-wrap" data-camera-active="${isVideoEnabled}">
            <h4>${t("backgroundEffect")}</h4>
            <div class="effect-preview-wrap" id="effect-preview-wrap">
              <video class="effect-preview-video" id="effect-preview-video" autoplay playsinline muted></video>
              <div class="effect-preview-loading" id="effect-preview-loading" hidden>${iconLoader2()}</div>
            </div>
            ${effectTiles}
          </div>`;
	const advancedPanel = `
          <div class="settings-modal__section settings-modal__section--audio-advanced">
            <h4>${t("audioAdvancedTitle")}</h4>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("audioAdvancedHint")}</p>
            <div class="settings-modal__range-row">
              <label class="settings-modal__range-label" for="audio-speaking-threshold">${t("speakingThresholdLabel")}</label>
              <div class="settings-modal__range-controls">
                <input type="range" id="audio-speaking-threshold" min="5" max="50" step="1" value="${st}" aria-valuemin="5" aria-valuemax="50" aria-valuenow="${st}" aria-valuetext="${stSensitivityPct}%" />
                <span class="settings-modal__range-value settings-modal__range-value--pct" id="audio-speaking-threshold-value" title="${escapeAttr(t("speakingThresholdValueTitle"))}">${stSensitivityPct}%</span>
              </div>
              <div class="settings-modal__range-scale" aria-hidden="true">
                <span>${escapeHtml(t("speakingThresholdScaleLeft"))}</span>
                <span>${escapeHtml(t("speakingThresholdScaleRight"))}</span>
              </div>
            </div>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("speakingThresholdHint")}</p>
            <div class="settings-modal__check-row settings-modal__check-row--with-help">
              <label class="settings-modal__check-row-label" for="audio-noise-suppression"><input type="checkbox" id="audio-noise-suppression" ${audioSettings.noiseSuppression ? "checked" : ""} /><span>${t("noiseSuppressionLabel")}</span></label>
              <span class="settings-modal__field-help" role="img" aria-label="${escapeAttr(t("noiseSuppressionHelp"))}" title="${escapeAttr(t("noiseSuppressionHelp"))}">?</span>
            </div>
            <div class="settings-modal__check-row settings-modal__check-row--with-help">
              <label class="settings-modal__check-row-label" for="audio-echo-cancellation"><input type="checkbox" id="audio-echo-cancellation" ${audioSettings.echoCancellation ? "checked" : ""} /><span>${t("echoCancellationLabel")}</span></label>
              <span class="settings-modal__field-help" role="img" aria-label="${escapeAttr(t("echoCancellationHelp"))}" title="${escapeAttr(t("echoCancellationHelp"))}">?</span>
            </div>
            <div class="settings-modal__check-row settings-modal__check-row--with-help">
              <label class="settings-modal__check-row-label" for="audio-auto-gain"><input type="checkbox" id="audio-auto-gain" ${audioSettings.autoGainControl ? "checked" : ""} /><span>${t("autoGainControlLabel")}</span></label>
              <span class="settings-modal__field-help" role="img" aria-label="${escapeAttr(t("autoGainControlHelp"))}" title="${escapeAttr(t("autoGainControlHelp"))}">?</span>
            </div>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("browserAudioConstraintsHint")}</p>
          </div>`;
	return `
    <div class="settings-modal" id="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" ${state.settingsPanelOpen ? "" : "hidden"}>
      <div class="settings-modal__content draggable-rect" data-draggable data-window="settings" style="${draggableRectInlineStyle(settingsPositionRect)}">
        <div class="settings-modal__header" data-drag-handle>
          <h3 class="settings-modal__title" id="settings-modal-title">${t("settings")}</h3>
          <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-settings-modal" title="${escapeAttr(t("minimizeWindow"))}" aria-label="${escapeAttr(t("minimizeWindow"))}">${iconMinus()}</button>
        </div>
        <div class="settings-modal__tabs" role="tablist" aria-label="${tabsAria}">
          <button type="button" class="settings-modal__tab settings-modal__tab--active" role="tab" id="settings-tab-media" data-action="settings-tab" data-tab="media" aria-selected="true" aria-controls="settings-panel-media" tabindex="0">${escapeHtml(t("settingsTabMedia"))}</button>
          <button type="button" class="settings-modal__tab" role="tab" id="settings-tab-effects" data-action="settings-tab" data-tab="effects" aria-selected="false" aria-controls="settings-panel-effects" tabindex="-1">${escapeHtml(t("settingsTabEffects"))}</button>
          <button type="button" class="settings-modal__tab" role="tab" id="settings-tab-advanced" data-action="settings-tab" data-tab="advanced" aria-selected="false" aria-controls="settings-panel-advanced" tabindex="-1">${escapeHtml(t("settingsTabAdvanced"))}</button>
        </div>
        <div class="settings-modal__body" id="settings-panel">
          <div class="settings-modal__tab-panel" id="settings-panel-media" role="tabpanel" aria-labelledby="settings-tab-media" data-panel="media">${mediaPanel}</div>
          <div class="settings-modal__tab-panel" id="settings-panel-effects" role="tabpanel" aria-labelledby="settings-tab-effects" data-panel="effects" hidden>${effectsPanel}</div>
          <div class="settings-modal__tab-panel" id="settings-panel-advanced" role="tabpanel" aria-labelledby="settings-tab-advanced" data-panel="advanced" hidden>${advancedPanel}</div>
        </div>
        <div class="settings-modal__resize-handle" data-resize-handle title="${escapeAttr(t("resize"))}"></div>
      </div>
    </div>
  `;
}

export function renderFileModalContent() {
	return `
    <div class="file-modal" id="file-modal" hidden>
      <div class="file-modal__backdrop" data-action="close-file-modal"></div>
      <div class="file-modal__content">
        <div class="file-modal__header">
          <h3 class="file-modal__title">${t("uploadFiles")}</h3>
          <button class="btn btn--ghost btn--sm" data-action="close-file-modal">${iconX()}</button>
        </div>
        <div class="file-modal__dropzone" id="dropzone">
          <input type="file" id="file-input" multiple hidden />
          <input type="file" id="folder-input" webkitdirectory directory multiple hidden />
          <div class="dropzone__content"><div class="dropzone__icon">${iconUpload()}</div><p class="dropzone__text">${t("dropzoneText")}</p><p class="dropzone__hint">${t("dropzoneHint")}</p><div class="dropzone__actions"><button type="button" class="btn btn--ghost btn--sm" data-input="file">${t("files")}</button><button type="button" class="btn btn--ghost btn--sm" data-input="folder">${t("folders")}</button></div></div>
        </div>
        <div class="file-modal__progress" id="file-progress-area" hidden></div>
        <div class="file-modal__receiving" id="file-receiving-in-modal" hidden>
          <p class="file-receive-toast__filename" id="file-receiving-filename-modal"></p>
          <div class="file-receive-toast__bar-wrap"><div class="file-receive-toast__bar" id="file-receiving-bar-modal"></div></div>
          <p class="file-receive-toast__stats" id="file-receiving-stats-modal"></p>
        </div>
      </div>
    </div>
  `;
}
