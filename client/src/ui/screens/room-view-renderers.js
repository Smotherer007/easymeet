/**
 * Render helpers for room-view (rule: ≤20 lines per function)
 */
import { t } from "../../i18n.js";
import { DEFAULT_AUDIO_SETTINGS } from "../../effects/storage/audioSettingsStorage.js";
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
	iconUpload,
	iconMessageSquare,
	iconLayoutGrid,
	iconUsers,
	iconShare2,
	iconPhoneOff,
	iconVideoOff,
	iconVideo,
	iconGrip,
	iconLogoWordmark
} from "../../icons.js";
import { renderChatContent } from "../../link-embed.js";
import { EMOJI_DATA } from "../../emoji-data.js";
import { escapeHtml } from "../../shared/escape.js";
import { mergeAndClampWindowRect } from "../utils/viewportWindowClamp.js";

export { escapeHtml };

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
	if (m.text?.trim()) parts.push(renderChatContent(m.text, escapeHtml, t("openInNewTab")));
	const urls = m.giphyUrls?.length ? m.giphyUrls : m.giphyUrl ? [m.giphyUrl] : [];
	urls.forEach((u) => parts.push(`<span class="chat__gif-wrap"><img src="${escapeHtml(u)}" alt="GIF" class="chat__gif" loading="lazy" /></span>`));
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
		? `<button type="button" class="chat__file-download-btn" data-action="download-file" data-file-id="${escapeHtml(fileId)}" title="${t("download")}" aria-label="${t("download")}">${iconDownload()}</button>`
		: `<span class="chat__file-loading">${iconLoader2()}</span>`;
	return `<span class="chat__file-share-label">${label}</span>${iconHtml}`;
}

function renderFileShareMessage(m, getFileBlob, myNick) {
	const fileId = m.fileId || "";
	const hasBlob = getFileBlob?.(fileId);
	const bodyHtml = renderFileShareBody(fileId, m.nick, m.filename, hasBlob);
	const isSelf = m.nick === (myNick ?? "");
	const selfClass = isSelf ? " chat__msg--self" : "";
	return `<div class="chat__msg chat__msg--file-share${selfClass}" data-file-id="${escapeHtml(fileId)}"><div class="chat__msg-header"><span class="chat__msg-nick">${escapeHtml(m.nick ?? "?")}</span><span class="chat__msg-time">${formatTime(m.ts)}</span></div><div class="chat__msg-body chat__file-share-body">${bodyHtml}</div></div>`;
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
	const isSelf = peerId === myPeerId;
	const memberMuted = isSelf ? isMuted : (muteMap.get(peerId) ?? false);
	const vol = volumeMap.get(peerId) ?? 100;
	const streaming = state.screenStreams?.has?.(peerId);
	const volumeControl =
		!isSelf && !memberMuted
			? `<div class="voip-view__volume-wrap" data-peer-id="${escapeHtml(peerId)}" title="${t("volume")}"><button type="button" class="voip-view__participant-status voip-view__volume-trigger" data-action="volume-toggle" aria-label="${t("volume")}" title="${t("volume")}">${iconMic()}</button><div class="voip-view__volume-tooltip"><input type="range" class="voip-view__volume-slider" min="0" max="200" value="${vol}" data-peer-id="${escapeHtml(peerId)}" /></div></div>`
			: `<div class="voip-view__participant-status" title="${memberMuted ? t("muted") : t("unmuted")}">${memberMuted ? iconMicOff() : iconMic()}</div>`;
	const streamHtml = streaming
		? `<div class="voip-view__participant-stream" data-action="open-stream-modal" data-peer-id="${escapeHtml(peerId)}" title="${t("clickToExpand")}"><video class="voip-view__stream-thumb" autoplay playsinline muted disablepictureinpicture></video></div>`
		: "";
	return `<div class="voip-view__participant" data-peer-id="${escapeHtml(peerId)}" data-self="${isSelf}"><div class="voip-view__participant-info"><div class="voip-view__participant-name">${escapeHtml(nick)}</div><div class="voip-view__participant-status-row">${volumeControl}</div></div>${streamHtml}</div>`;
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

/** Screen-share control in bar — slot hot-swappable without full re-render. */
export function renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream }) {
	if (!hasScreenShareSupport) return "";
	if (hostStream) {
		return `<button type="button" class="meeting-control-btn meeting-control-btn--danger" id="stop-screen-btn" title="${escapeHtml(t("stopSharingToolbar"))}">${iconMonitorOff()}</button>`;
	}
	return `<button type="button" class="meeting-control-btn" id="start-screen-btn" title="${escapeHtml(t("startSharing"))}">${iconMonitor()}</button>`;
}

/** Audio (room host) + stop share (when self is sharing, hostStream). */
export function renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled }) {
	if (!hostStream) return "";
	let html = "";
	if (isHost && hostStream?.getAudioTracks?.().length) {
		const audioPart = `${audioEnabled ? iconVolume2() : iconVolumeX()} ${escapeHtml(audioEnabled ? t("audioOn") : t("audioOff"))}`;
		html += `<button type="button" class="btn btn--ghost btn--sm" id="audio-screen-btn">${audioPart}</button>`;
	}
	const stopTitle = escapeHtml(t("stopSharing"));
	html += `<button type="button" class="btn btn--ghost btn--sm stream-modal__stop-share-btn" data-action="stop-screen-share" title="${stopTitle}" aria-label="${stopTitle}">${iconMonitorOff()} ${stopTitle}</button>`;
	return html;
}

export function renderMeetingControlBarFloating(state) {
	const { isMuted, isVideoEnabled, hostStream, hasScreenShareSupport, unreadChatCount, roomId } = state;
	return `
    <button class="meeting-control-btn chat__mute-btn--${isMuted ? "muted" : "unmuted"}" data-action="toggle-mute" title="${isMuted ? t("unmute") : t("mute")}">${isMuted ? iconMicOff() : iconMic()}</button>
    <button class="meeting-control-btn video-btn--${isVideoEnabled ? "on" : "off"}" data-action="toggle-video" title="${isVideoEnabled ? t("cameraOn") : t("cameraOff")}">${isVideoEnabled ? iconVideo() : iconVideoOff()}</button>
${hasScreenShareSupport ? `<span class="meeting-control-bar__screen-slot">${renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream })}</span>` : ""}
      <button class="meeting-control-btn meeting-control-btn--chat" data-action="toggle-chat-panel" title="${t("tabChat")}"><span class="meeting-control-btn__icon-wrap">${iconMessageSquare()}<span class="chat-badge" id="chat-badge" ${unreadChatCount > 0 ? "" : "hidden"}>${unreadChatCount > 99 ? "99+" : unreadChatCount}</span></span></button>
      <button class="meeting-control-btn" data-action="toggle-video-layout" title="${t("layoutGrid")}">${iconLayoutGrid()}</button>
    <button class="meeting-control-btn" data-action="toggle-sidebar" title="${t("participants")}">${iconUsers()}</button>
    ${roomId ? `<button class="meeting-control-btn" data-action="share" title="${t("shareRoom")}">${iconShare2()}</button>` : ""}
    <button class="meeting-control-btn" data-action="toggle-settings" title="${t("settings")}">${iconMoreHorizontal()}</button>
    <button class="meeting-control-btn meeting-control-btn--leave" data-action="leave" title="${t("leaveRoom")}">${iconPhoneOff()}</button>
  `;
}

export function renderFloatingWindowVideos(pos, isOpen = true) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--videos${hiddenCls}" data-window="videos" data-draggable style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("videos")}</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize" data-action="minimize-floating-videos" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="video-gallery video-gallery--grid" id="video-gallery" data-layout-mode="grid"></div>
      </div>
      <div class="floating-window__resize-handle" data-resize-handle title="${t("resize")}"></div>
    </div>
  `;
}

export function renderFloatingWindowChat(pos, messagesHtml, isOpen = false) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--chat${hiddenCls}" data-window="chat" data-draggable style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("tabChat")}</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize" data-action="minimize-floating-chat" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="chat__messages-wrap chat__messages-wrap--overlay" id="chat-dropzone">
          <div class="chat__messages" id="chat-messages">${messagesHtml || '<div class="chat__empty">' + t("typeMessage") + "</div>"}</div>
          <button type="button" class="chat__scroll-to-bottom" id="chat-scroll-to-bottom" hidden title="${t("scrollToBottom")}">${iconChevronDown()}</button>
        </div>
        <div class="chat__input-wrap">
          <div class="chat__gif-preview" id="chat-gif-preview" hidden></div>
          <div class="chat__input-row">
            <div class="emoji-picker" id="emoji-picker" hidden>
              <div class="emoji-picker__header"><span class="emoji-picker__title">${t("emoji")}</span><button type="button" class="emoji-picker__close" data-action="close-emoji">${iconX()}</button></div>
              <input type="text" class="emoji-picker__search" id="emoji-search" placeholder="${t("emojiSearch")}" />
              <div class="emoji-picker__grid" id="emoji-grid">${EMOJI_DATA.slice(0, 500)
					.map(([e]) => `<button type="button" class="emoji-picker__btn" data-emoji="${e}">${e}</button>`)
					.join("")}</div>
            </div>
            <div class="giphy-picker" id="giphy-picker" hidden>
              <div class="giphy-picker__header"><span class="giphy-picker__title">${t("giphy")}</span><button type="button" class="giphy-picker__close" data-action="close-giphy">${iconX()}</button></div>
              <input type="text" class="giphy-picker__search" id="giphy-search" placeholder="${t("giphySearch")}" />
              <div class="giphy-picker__grid" id="giphy-grid"></div>
              <p class="giphy-picker__hint" id="giphy-hint"></p>
            </div>
            <div class="chat__more-wrap">
              <button type="button" class="btn btn--ghost chat__more-btn" data-action="toggle-chat-more" title="${t("more")}">${iconMoreHorizontal()}</button>
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
      <div class="floating-window__resize-handle" data-resize-handle title="${t("resize")}"></div>
    </div>
  `;
}

export function renderFloatingWindowParticipants(pos, voipParticipantsHtml, voipMembersLength, isOpen = false) {
	const hiddenCls = isOpen ? "" : " floating-window--hidden";
	return `
    <div class="floating-window floating-window--participants${hiddenCls}" data-window="participants" data-draggable style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;">
      <div class="floating-window__header" data-drag-handle>
        <span class="floating-window__title">${t("participants")} (<span id="participant-count">${voipMembersLength}</span>)</span>
        <button type="button" class="btn btn--ghost btn--sm floating-window__minimize chat__sidebar-close" data-action="minimize-floating-participants" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
      </div>
      <div class="floating-window__body">
        <div class="voip-view__participant-list" id="participant-list">${voipParticipantsHtml || '<p class="voip-view__empty">' + t("participants") + "</p>"}</div>
      </div>
      <div class="floating-window__resize-handle" data-resize-handle title="${t("resize")}"></div>
    </div>
  `;
}

export function renderStreamModalFloating(pos, state) {
	const { isHost, hostStream, audioEnabled } = state;
	return `
    <div class="stream-modal" id="stream-modal" hidden>
      <div class="stream-modal__content" data-draggable data-window="stream" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;transform:none">
        <div class="stream-modal__header" data-drag-handle>
          <span class="stream-modal__title" id="stream-modal-title">${t("screenStream")}</span>
          <div class="stream-modal__actions">
            <button class="btn btn--ghost btn--sm" id="stream-fullscreen-btn" title="${t("fullscreen")}">${iconMaximize2()}</button>
            <button class="btn btn--ghost btn--sm" id="stream-pip-btn" title="${t("pip")}">${iconVideo()}</button>
            <span class="stream-modal__host-actions-slot">${renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled })}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-stream-modal" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
          </div>
        </div>
        <div class="stream-modal__video-wrap">
          <video id="stream-modal-video" autoplay playsinline></video>
        </div>
        <div class="stream-modal__resize-handle" data-resize-handle title="${t("resize")}"></div>
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
			? `<div class="voip-view__volume-wrap" data-peer-id="${escapeHtml(peerId)}" title="${t("volume")}"><button type="button" class="voip-view__participant-status voip-view__volume-trigger" data-action="volume-toggle" aria-label="${t("volume")}" title="${t("volume")}">${iconMic()}</button><div class="voip-view__volume-tooltip"><input type="range" class="voip-view__volume-slider" min="0" max="200" value="${vol}" data-peer-id="${escapeHtml(peerId)}" /></div></div>`
			: `<div class="voip-view__participant-status" title="${memberMuted ? t("muted") : t("unmuted")}">${memberMuted ? iconMicOff() : iconMic()}</div>`;
	const hasBgEffect = isSelf ? (backgroundEffect || "none") !== "none" : (bgEffectMap.get(peerId) || "none") !== "none";
	const streamHtml = showThumb
		? `<div class="voip-view__participant-stream" data-action="open-stream-modal" data-peer-id="${escapeHtml(peerId)}" title="${t("clickToExpand")}"><video class="voip-view__stream-thumb" autoplay playsinline muted disablepictureinpicture></video></div>`
		: "";
	return `<div class="voip-view__participant" data-peer-id="${escapeHtml(peerId)}" data-self="${isSelf}" data-has-background-effect="${hasBgEffect}"><div class="voip-view__participant-info"><div class="voip-view__participant-name">${escapeHtml(nick)}</div><div class="voip-view__participant-status-row">${volumeControl}</div></div>${streamHtml}</div>`;
}

export function renderVoipParticipantsHtmlGrid(voipMembers, ctx) {
	return (voipMembers || []).map((m) => renderVoipParticipantHtmlGrid(m, ctx)).join("");
}

export function renderScreenShareBannerHtml(peerId, entry, myPeerId) {
	const nick = entry?.nick ?? "?";
	const isSelf = peerId === myPeerId;
	const label = isSelf ? t("sharingScreenYou") : escapeHtml(nick) + " " + t("sharingScreen");
	return `<div class="room-view__screen-share-banner" data-action="open-stream-modal" data-peer-id="${escapeHtml(peerId)}" title="${t("clickToExpand")}">${iconMonitor()} <span>${label}</span></div>`;
}

export function renderScreenShareBannersHtml(screenStreams, myPeerId) {
	const streams = screenStreams instanceof Map ? screenStreams : new Map();
	const html = [...streams.entries()].map(([peerId, entry]) => renderScreenShareBannerHtml(peerId, entry, myPeerId)).join("");
	return html ? `<div class="room-view__screen-share-banners">${html}</div>` : "";
}

export function renderRoomViewHeader(meetingTitle) {
	const latencyTitle = escapeHtml(t("roomMediaLatencyTitle"));
	const latencyPlaceholder = escapeHtml(t("roomMediaLatencyNone"));
	return `
    <div class="room-view__header room-view__header--centered">
      <div class="room-view__header-brand">
        <a href="/" class="room-view__logo-link">${iconLogoWordmark({ width: "110px", height: "28px" })}</a>
        <span class="room-view__header-sep"></span>
        <span class="room-view__meeting-title">${escapeHtml(meetingTitle)}</span>
        <span class="room-view__media-latency" id="room-view-media-latency" title="${latencyTitle}" aria-live="polite">${latencyPlaceholder}</span>
      </div>
    </div>
  `;
}

export function renderShareModalContent(roomId, formattedRoomId, joinUrl, renderShareContent, shareStyle) {
	const content = roomId ? renderShareContent(roomId, formattedRoomId, joinUrl, { qrCanvasId: "share-qr-canvas", qrContainerId: "share-qr-container", showOpenLink: false }) : "";
	return `
    <div class="share-modal" id="share-modal" hidden>
      <div class="share-modal__content" data-draggable data-window="share" style="${shareStyle}">
        <div class="share-modal__header" data-drag-handle>
          <h3 class="share-modal__title">${t("roomCreated")}</h3>
          <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-share-modal" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
        </div>
        <div class="share-modal__body">
          ${content}
        </div>
        <div class="share-modal__resize-handle" data-resize-handle title="${t("resize")}"></div>
      </div>
    </div>
  `;
}

export function renderMeetingControlBarGrid(state) {
	const { isMuted, isVideoEnabled, hostStream, hasScreenShareSupport, unreadChatCount, roomId } = state;
	return `
    <div class="meeting-control-bar">
      <button class="meeting-control-btn chat__mute-btn--${isMuted ? "muted" : "unmuted"}" data-action="toggle-mute" title="${isMuted ? t("unmute") : t("mute")}">${isMuted ? iconMicOff() : iconMic()}</button>
      <button class="meeting-control-btn video-btn--${isVideoEnabled ? "on" : "off"}" data-action="toggle-video" title="${isVideoEnabled ? t("cameraOn") : t("cameraOff")}">${isVideoEnabled ? iconVideo() : iconVideoOff()}</button>
      ${hasScreenShareSupport ? `<span class="meeting-control-bar__screen-slot">${renderMeetingScreenShareSlotInner({ hasScreenShareSupport, hostStream })}</span>` : ""}
      <button class="meeting-control-btn meeting-control-btn--chat" data-action="toggle-chat-panel" title="${t("tabChat")}"><span class="meeting-control-btn__icon-wrap">${iconMessageSquare()}<span class="chat-badge" id="chat-badge" ${unreadChatCount > 0 ? "" : "hidden"}>${unreadChatCount > 99 ? "99+" : unreadChatCount}</span></span></button>
      <button class="meeting-control-btn" data-action="toggle-video-layout" title="${t("layoutFree")}">${iconGrip()}</button>
      <button class="meeting-control-btn" data-action="toggle-sidebar" title="${t("participants")}">${iconUsers()}</button>
      ${roomId ? `<button class="meeting-control-btn" data-action="share" title="${t("shareRoom")}">${iconShare2()}</button>` : ""}
      <button class="meeting-control-btn" data-action="toggle-settings" title="${t("settings")}">${iconMoreHorizontal()}</button>
      <button class="meeting-control-btn meeting-control-btn--leave" data-action="leave" title="${t("leaveRoom")}">${iconPhoneOff()}</button>
    </div>
  `;
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
    <div class="chat__resize-handle chat__resize-handle--hidden" id="chat-resize-handle" title="${t("resize")}"></div>
    <div class="chat-panel chat-panel--overlay" id="chat-panel">
      <div class="chat-panel__header">
        <h3 class="chat-panel__title">${t("tabChat")}</h3>
        <button class="btn btn--ghost btn--sm" data-action="close-chat-panel">${iconX()}</button>
      </div>
      <div class="chat__messages-wrap chat__messages-wrap--overlay" id="chat-dropzone">
        <div class="chat__messages" id="chat-messages">${messagesHtml || '<div class="chat__empty">' + t("typeMessage") + "</div>"}</div>
        <button type="button" class="chat__scroll-to-bottom" id="chat-scroll-to-bottom" hidden title="${t("scrollToBottom")}">${iconChevronDown()}</button>
      </div>
      <div class="chat__input-wrap">
        <div class="chat__gif-preview" id="chat-gif-preview" hidden></div>
        <div class="chat__input-row">
          <div class="emoji-picker" id="emoji-picker" hidden>
            <div class="emoji-picker__header"><span class="emoji-picker__title">${t("emoji")}</span><button type="button" class="emoji-picker__close" data-action="close-emoji">${iconX()}</button></div>
            <input type="text" class="emoji-picker__search" id="emoji-search" placeholder="${t("emojiSearch")}" />
            <div class="emoji-picker__grid" id="emoji-grid">${EMOJI_DATA.slice(0, 500)
				.map(([e]) => `<button type="button" class="emoji-picker__btn" data-emoji="${e}">${e}</button>`)
				.join("")}</div>
          </div>
          <div class="giphy-picker" id="giphy-picker" hidden>
            <div class="giphy-picker__header"><span class="giphy-picker__title">${t("giphy")}</span><button type="button" class="giphy-picker__close" data-action="close-giphy">${iconX()}</button></div>
            <input type="text" class="giphy-picker__search" id="giphy-search" placeholder="${t("giphySearch")}" />
            <div class="giphy-picker__grid" id="giphy-grid"></div>
            <p class="giphy-picker__hint" id="giphy-hint"></p>
          </div>
          <div class="chat__more-wrap">
            <button type="button" class="btn btn--ghost chat__more-btn" data-action="toggle-chat-more" title="${t("more")}">${iconMoreHorizontal()}</button>
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
    <div class="chat__resize-handle chat__resize-handle--hidden" id="chat-resize-handle-right" title="${t("resize")}"></div>
  `;
}

export function renderGridMeetingSection(state, messagesHtml, voipParticipantsHtml) {
	const controlBar = renderMeetingControlBarGrid(state);
	const chatPanel = renderChatPanelContent(messagesHtml, voipParticipantsHtml, state.voipMembers?.length ?? 0);
	return `
    <div class="meeting-main">
      <div class="video-gallery video-gallery--grid" id="video-gallery" data-layout-mode="grid"></div>
    </div>
    ${controlBar}
    ${chatPanel}
  `;
}

export function renderStreamModalGrid(streamStyle, state) {
	const { isHost, hostStream, audioEnabled } = state;
	return `
    <div class="stream-modal" id="stream-modal" hidden>
      <div class="stream-modal__content" data-draggable data-window="stream" style="${streamStyle}">
        <div class="stream-modal__header" data-drag-handle>
          <span class="stream-modal__title" id="stream-modal-title">${t("screenStream")}</span>
          <div class="stream-modal__actions">
            <button class="btn btn--ghost btn--sm" id="stream-fullscreen-btn" title="${t("fullscreen")}">${iconMaximize2()}</button>
            <button class="btn btn--ghost btn--sm" id="stream-pip-btn" title="${t("pip")}">${iconVideo()}</button>
            <span class="stream-modal__host-actions-slot">${renderStreamModalHostActionsInner({ isHost, hostStream, audioEnabled })}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-stream-modal" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
          </div>
        </div>
        <div class="stream-modal__video-wrap">
          <video id="stream-modal-video" autoplay playsinline></video>
        </div>
        <div class="stream-modal__resize-handle" data-resize-handle title="${t("resize")}"></div>
      </div>
    </div>
  `;
}

function renderEffectTile(bg, backgroundEffect) {
	const fullUrl = bg.url.startsWith("/") ? new URL(bg.url, window.location.origin).href : bg.url;
	const label = bg.label || (bg.labelKey ? t(bg.labelKey) : t("backgroundCustomLabel"));
	const isCustom = bg.id?.startsWith("custom-");
	return `<button type="button" class="effect-tile effect-tile--bg ${backgroundEffect === bg.id ? "effect-tile--selected" : ""}" data-effect="${escapeHtml(bg.id)}" data-custom="${isCustom ? "true" : ""}" title="${escapeHtml(label)}">
    <span class="effect-tile__preview">${isCustom ? `<span role="button" tabindex="0" class="effect-tile__remove" data-action="remove-custom-bg" data-effect-id="${escapeHtml(bg.id)}" title="${t("removeCustomBackground")}" aria-label="${t("removeCustomBackground")}">${iconX()}</span>` : ""}<img src="${escapeHtml(fullUrl)}" alt="" loading="lazy" /></span>
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
	const { settingsStyle, isVideoEnabled, hasBackgroundBlur, backgroundEffect, backgroundImages } = state;
	const audioSettings = state.audioSettings && typeof state.audioSettings === "object" ? { ...DEFAULT_AUDIO_SETTINGS, ...state.audioSettings } : { ...DEFAULT_AUDIO_SETTINGS };
	const st = audioSettings.speakingThreshold;
	const effectTiles = hasBackgroundBlur
		? `<div class="effect-tiles" id="effect-tiles"><button type="button" class="effect-tile ${backgroundEffect === "none" ? "effect-tile--selected" : ""}" data-effect="none" title="${t("backgroundNone")}"><span class="effect-tile__preview effect-tile__preview--none">${iconVideo()}</span><span class="effect-tile__label">${t("backgroundNone")}</span></button><button type="button" class="effect-tile ${backgroundEffect === "blur" ? "effect-tile--selected" : ""}" data-effect="blur" title="${t("backgroundBlur")}"><span class="effect-tile__preview effect-tile__preview--blur"></span><span class="effect-tile__label">${t("backgroundBlur")}</span></button>${renderEffectTilesFirst(backgroundImages, backgroundEffect)}</div>${renderEffectTilesMore(backgroundImages, backgroundEffect)}<input type="file" id="background-upload-input" accept="image/*" hidden /><button type="button" class="effect-tiles-upload-btn" id="effect-tiles-upload-btn" title="${t("uploadCustomBackground")}">${iconUpload()} ${t("uploadCustomBackground")}</button>`
		: `<p class="effect-preview-unsupported" id="effect-preview-unsupported">${t("backgroundEffectsNotSupported")}</p>`;
	return `
    <div class="settings-modal" id="settings-modal" ${state.settingsPanelOpen ? "" : "hidden"}>
      <div class="settings-modal__content" data-draggable data-window="settings" style="${settingsStyle}">
        <div class="settings-modal__header" data-drag-handle>
          <h3 class="settings-modal__title">${t("settings")}</h3>
          <button type="button" class="btn btn--ghost btn--sm" data-action="minimize-settings-modal" title="${escapeHtml(t("minimizeWindow"))}" aria-label="${escapeHtml(t("minimizeWindow"))}">${iconMinus()}</button>
        </div>
        <div class="settings-modal__body" id="settings-panel">
          <div class="settings-modal__section">
            <h4>${t("videoDevice")}</h4>
            <div class="input-group"><select id="video-device"></select></div>
          </div>
          <div class="effect-tiles-wrap settings-modal__section" id="effect-tiles-wrap" data-camera-active="${isVideoEnabled}">
            <h4>${t("backgroundEffect")}</h4>
            <div class="effect-preview-wrap" id="effect-preview-wrap">
              <video class="effect-preview-video" id="effect-preview-video" autoplay playsinline muted></video>
              <div class="effect-preview-loading" id="effect-preview-loading" hidden>${iconLoader2()}</div>
            </div>
            ${effectTiles}
          </div>
          <div class="settings-modal__section">
            <h4>${t("inputDevice")}</h4>
            <div class="input-group"><select id="input-device"></select></div>
          </div>
          <div class="settings-modal__section settings-modal__section--audio-advanced">
            <h4>${t("audioAdvancedTitle")}</h4>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("audioAdvancedHint")}</p>
            <div class="settings-modal__range-row">
              <label class="settings-modal__range-label" for="audio-speaking-threshold">${t("speakingThresholdLabel")}</label>
              <div class="settings-modal__range-controls">
                <input type="range" id="audio-speaking-threshold" min="5" max="45" step="1" value="${st}" />
                <span class="settings-modal__range-value" id="audio-speaking-threshold-value">${st}</span>
              </div>
            </div>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("speakingThresholdHint")}</p>
            <label class="settings-modal__check-row"><input type="checkbox" id="audio-noise-suppression" ${audioSettings.noiseSuppression ? "checked" : ""} /> <span>${t("noiseSuppressionLabel")}</span></label>
            <label class="settings-modal__check-row"><input type="checkbox" id="audio-echo-cancellation" ${audioSettings.echoCancellation ? "checked" : ""} /> <span>${t("echoCancellationLabel")}</span></label>
            <label class="settings-modal__check-row"><input type="checkbox" id="audio-auto-gain" ${audioSettings.autoGainControl ? "checked" : ""} /> <span>${t("autoGainControlLabel")}</span></label>
            <p class="settings-modal__hint settings-modal__hint--sm">${t("browserAudioConstraintsHint")}</p>
          </div>
          <div class="settings-modal__section">
            <h4>${t("outputDevice")}</h4>
            <div class="input-group"><select id="output-device"></select></div>
          </div>
        </div>
        <div class="settings-modal__resize-handle" data-resize-handle title="${t("resize")}"></div>
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
