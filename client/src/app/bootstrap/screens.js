/**
 * DOM-Rendering und Screen-Navigation (ohne Subscription-Logik).
 */

import { getLang, setLang, t } from "../../i18n.js";
import {
	renderLanding,
	attachLandingListeners,
	renderCreateRoomForm,
	renderCreateRoomSuccess,
	attachCreateRoomListeners,
	showQrCode,
	renderJoinRoom,
	attachJoinRoomListeners,
	renderRoomView
} from "../../ui/screens/index.js";
import { isSupported as isBackgroundEffectsSupported, BACKGROUND_IMAGES } from "../../effects/backgroundEffects.js";
import { getCustomBackgrounds } from "../../effects/storage/customBackgroundStorage.js";
import { attachRoomViewAndHandlers as attachRoomViewFromModule } from "../../effects/ui/roomView.js";
import { refreshPollsDock } from "../../ui/screens/room-view-renderers.js";
import { getStreamForPeerId, getStreamForScreenShare } from "../../effects/media/tiles.js";
import * as selectors from "../../domain/selectors/index.js";
import { handleCreateRoom, handleJoinRoom } from "./roomJoinCreate.js";
import { getStreamForViewers } from "./roomJoinCreate.js";
import { setupRoomViewDeviceHandlers, setupAudioTrackEndedHandler, setPeerVolume, loadPeerVolumes, refreshDeviceSelects, attachRemoteAudio } from "./cleanup.js";
import { getStreamForVideoTile } from "../../effects/media/tiles.js";

/**
 * @param {HTMLElement} appEl
 * @param {string} html
 * @param {import('../../store/index.js').getState} getState
 */
export function renderShell(appEl, html, getState) {
	const s = getState();
	appEl.innerHTML = html;
	appEl.className = selectors.selectScreen(s) === "room-view" ? "fullscreen" : "";
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderLangSwitcher(appEl, ctx) {
	const { getState } = ctx;
	const el = document.getElementById("lang-switcher");
	if (!el) return;
	const s = getState();
	const screen = selectors.selectScreen(s);
	el.classList.toggle("lang-switcher--bottom", screen === "room-view");
	el.classList.toggle("lang-switcher--hidden", screen === "room-view");
	if (screen === "room-view") return;
	const lang = getLang();
	el.innerHTML = `
    <div class="lang-switcher__dropdown">
      <button type="button" class="lang-switcher__trigger" aria-expanded="false" aria-haspopup="listbox" aria-label="${t("langAriaLabel")}">
        <span class="lang-switcher__flag" aria-hidden="true">${lang === "de" ? "🇩🇪" : "🇬🇧"}</span>
        <span class="lang-switcher__code">${lang === "de" ? "DE" : "EN"}</span>
        <span class="lang-switcher__chevron" aria-hidden="true">▾</span>
      </button>
      <ul class="lang-switcher__menu" role="listbox" hidden>
        <li role="presentation">
          <button type="button" role="option" class="lang-switcher__option ${lang === "de" ? "lang-switcher__option--active" : ""}" data-lang="de">
            <span class="lang-switcher__flag" aria-hidden="true">🇩🇪</span> Deutsch
          </button>
        </li>
        <li role="presentation">
          <button type="button" role="option" class="lang-switcher__option ${lang === "en" ? "lang-switcher__option--active" : ""}" data-lang="en">
            <span class="lang-switcher__flag" aria-hidden="true">🇬🇧</span> English
          </button>
        </li>
      </ul>
    </div>
  `;
	const trigger = el.querySelector(".lang-switcher__trigger");
	const menu = el.querySelector(".lang-switcher__menu");
	const closeMenu = () => {
		menu?.setAttribute("hidden", "");
		trigger?.setAttribute("aria-expanded", "false");
	};
	trigger?.addEventListener("click", (e) => {
		e.stopPropagation();
		const open = menu?.hasAttribute("hidden");
		if (open) menu?.removeAttribute("hidden");
		else menu?.setAttribute("hidden", "");
		trigger?.setAttribute("aria-expanded", open ? "true" : "false");
	});
	el.querySelectorAll("[data-lang]").forEach((btn) => {
		btn.addEventListener("click", () => {
			setLang(btn.dataset.lang || "de");
			closeMenu();
		});
	});
	if (!el._easymeetLangOutsideClose) {
		el._easymeetLangOutsideClose = true;
		document.addEventListener("click", (e) => {
			if (e.target.closest("#lang-switcher")) return;
			const root = document.getElementById("lang-switcher");
			const m = root?.querySelector(".lang-switcher__menu");
			const tr = root?.querySelector(".lang-switcher__trigger");
			m?.setAttribute("hidden", "");
			tr?.setAttribute("aria-expanded", "false");
		});
	}
}

export function getJoinUrl(roomId) {
	const base = window.location.origin + window.location.pathname;
	const sep = base.includes("?") ? "&" : "?";
	return `${base}${sep}join=${encodeURIComponent(roomId || "")}`;
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderLandingScreen(appEl, ctx) {
	const { navigate, getState } = ctx;
	renderShell(appEl, renderLanding(), getState);
	renderLangSwitcher(appEl, ctx);
	attachLandingListeners(appEl, {
		onCreateRoom: () => navigate(appEl, "create-room"),
		onJoinRoom: () => navigate(appEl, "join-room"),
		onPickActiveRoom: (roomId, hasPassword) => {
			navigate(appEl, "join-room", { joinRoomCode: roomId, joinRoomHasPassword: hasPassword });
		}
	});
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderCreateRoomScreen(appEl, ctx) {
	const { navigate, getState, readNickname, cleanupAndNavigate } = ctx;
	renderShell(appEl, renderCreateRoomForm(), getState);
	renderLangSwitcher(appEl, ctx);
	attachCreateRoomListeners(appEl, {
		onBack: () => cleanupAndNavigate(appEl, "landing"),
		onCreate: (nick, pwd, code) => handleCreateRoom(appEl, ctx, nick, pwd, code),
		getJoinUrl,
		initialNickname: readNickname() || "",
		initialRoomCode: ""
	});
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderCreateRoomSuccessScreen(appEl, ctx) {
	const { getState, navigate, cleanupAndNavigate } = ctx;
	const s = getState();
	renderShell(appEl, renderCreateRoomSuccess(selectors.selectRoomId(s), getJoinUrl), getState);
	renderLangSwitcher(appEl, ctx);
	attachCreateRoomListeners(appEl, {
		onBack: () => cleanupAndNavigate(appEl, "landing"),
		onEnterRoom: () => navigate(appEl, "room-view"),
		getJoinUrl,
		roomId: selectors.selectRoomId(s)
	});
	showQrCode(appEl, selectors.selectRoomId(s), getJoinUrl);
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderJoinRoomScreen(appEl, ctx) {
	const { getState, readNickname, cleanupAndNavigate } = ctx;
	const s = getState();
	renderShell(appEl, renderJoinRoom(s.joinRoomCode ?? "", s.joinRoomHasPassword ?? true), getState);
	renderLangSwitcher(appEl, ctx);
	attachJoinRoomListeners(appEl, {
		onBack: () => cleanupAndNavigate(appEl, "landing"),
		onJoin: (roomId, pwd, nick) => handleJoinRoom(appEl, ctx, roomId, pwd, nick),
		initialNickname: readNickname() || ""
	});
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
function getRoomViewDeps(appEl, ctx) {
	const { dispatch, getState, cleanupAndNavigate, applyEffectToPreview } = ctx;
	return {
		cleanupAndNavigate: (scr) => cleanupAndNavigate(appEl, scr),
		handleStopScreen: () => ctx.handleStopScreen(appEl),
		getJoinUrl,
		setupAudioTrackEndedHandler: (track) => setupAudioTrackEndedHandler(dispatch, getState, appEl, track),
		getStreamForViewers: () => getStreamForViewers(getState),
		applyEffectToPreview: (stream, eff, vid) => applyEffectToPreview(appEl, stream, eff, vid),
		navigate: (scr, d) => ctx.navigate(appEl, scr, d),
		setPeerVolume: (peerId, percent) => setPeerVolume(dispatch, getState, peerId, percent)
	};
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderRoomViewContent(appEl, ctx) {
	const { dispatch, getState } = ctx;
	loadPeerVolumes(dispatch, getState, ctx.readPeerVolumes);
	const s = getState();
	const hasBackgroundBlur = isBackgroundEffectsSupported();
	const hasScreenShareSupport = typeof navigator.mediaDevices?.getDisplayMedia === "function";
	const customResult = getCustomBackgrounds();
	const backgroundImages = [...(customResult.success ? customResult.data : []), ...BACKGROUND_IMAGES];
	renderShell(
		appEl,
		renderRoomView({
			...s,
			myPeerId: selectors.selectMyPeerId(s),
			getJoinUrl,
			getStreamForPeerId,
			getStreamForScreenShare,
			hasBackgroundBlur,
			hasScreenShareSupport,
			unreadChatCount: selectors.selectUnreadChatCount(s),
			backgroundImages
		}),
		getState
	);
	renderLangSwitcher(appEl, ctx);
	attachRoomViewFromModule(appEl, getRoomViewDeps(appEl, ctx));
	refreshPollsDock(appEl, getState());
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function setupRoomViewPostRender(appEl, ctx) {
	const { getState } = ctx;
	const s = getState();
	const myPeerId = selectors.selectMyPeerId(s);
	const localStream = selectors.selectLocalStream(s);
	if (localStream && myPeerId) attachRemoteAudio(myPeerId, localStream, appEl);
	selectors.selectRemoteStreams(s).forEach((stream, peerId) => {
		attachRemoteAudio(peerId, stream, appEl);
	});
	(selectors.selectVoipMembers(s) || []).forEach((m) => {
		const stream = getStreamForVideoTile(m.peerId);
		if (stream) attachRemoteAudio(m.peerId, stream, appEl);
	});
	if (selectors.selectSettingsPanelOpen(s)) refreshDeviceSelects(appEl);
	setupRoomViewDeviceHandlers({ ...ctx, appEl });
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function renderRoomViewScreen(appEl, ctx) {
	renderRoomViewContent(appEl, ctx);
	setupRoomViewPostRender(appEl, ctx);
}

/**
 * @param {HTMLElement} appEl
 * @param {object} ctx
 */
export function navigateScreens(appEl, ctx, screen, data = {}) {
	const { dispatch, getState } = ctx;
	dispatch({ type: "navigation/screen", payload: { screen, ...data } });
	const s = getState();
	switch (screen) {
		case "landing":
			renderLandingScreen(appEl, ctx);
			break;
		case "create-room":
			renderCreateRoomScreen(appEl, ctx);
			break;
		case "create-room-success":
			renderCreateRoomSuccessScreen(appEl, ctx);
			break;
		case "join-room":
			renderJoinRoomScreen(appEl, ctx);
			break;
		case "room-view":
			renderRoomViewScreen(appEl, ctx);
			break;
		default:
			navigateScreens(appEl, ctx, "landing");
	}
}
