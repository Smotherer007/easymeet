import { t } from "../../i18n.js";
import {
	iconMessageCirclePlus,
	iconMessageCircle,
	iconLogoWordmark,
	iconGithub,
	iconGlobe,
	iconRefreshCw,
	iconPlus,
	iconLockInline,
	iconPinnedRoomJump,
	iconTrash2,
	iconLandingActiveRoomsEmpty,
	iconLoader2
} from "../../icons.js";
import { fetchActiveRooms, fetchPinnedRooms } from "../../effects/network/api.js";

/**
 * Poll interval for GET /api/rooms/active (no extra WebSocket).
 * Shorter interval = fresher numbers, slightly more HTTP traffic.
 */
export const LANDING_ROOMS_POLL_MS = 10000;

/**
 * Serialize landing list refreshes so only one runs at a time (e.g. active rooms).
 * Avoids a fast empty response winning over a slower response that still has rooms.
 */
let landingRoomPanelsRefreshChain = Promise.resolve();

/**
 * Clear landing poll timer and visibility listener (e.g. when navigating away from the home screen).
 * @param {HTMLElement} container
 */
export function teardownLandingAutoRefresh(container) {
	if (!container) return;
	clearInterval(container._easymeetActiveRoomsInterval);
	container._easymeetActiveRoomsInterval = undefined;
	if (container._easymeetLandingVisibilityHandler) {
		document.removeEventListener("visibilitychange", container._easymeetLandingVisibilityHandler);
		container._easymeetLandingVisibilityHandler = undefined;
	}
	if (container._easymeetServerAdminOpenHandler) {
		document.removeEventListener("click", container._easymeetServerAdminOpenHandler);
		container._easymeetServerAdminOpenHandler = undefined;
	}
}

export function renderLanding() {
	return `
    <div class="screen landing">
      <div class="landing__hero">
        <h1 class="sr-only">${t("title")}</h1>
        <div class="landing__wordmark">${iconLogoWordmark({ width: "100%", height: "auto" })}</div>
        <p class="landing__subtitle">${t("subtitle")}</p>
      </div>
      <div class="landing__cards">
        <div class="card card--create" data-action="create">
          <span class="landing__nav-spinner" hidden aria-hidden="true">${iconLoader2()}</span>
          <div class="card__icon card__icon--create">${iconMessageCirclePlus()}</div>
          <h2>${t("createCardTitle")}</h2>
          <p>${t("createCardDesc")}</p>
          <button type="button" class="btn btn--primary" data-action="create">
            <span class="landing__nav-spinner" hidden aria-hidden="true">${iconLoader2()}</span>
            <span class="landing__btn-text">${t("createRoom")}</span>
          </button>
        </div>
        <div class="card card--join" data-action="join">
          <span class="landing__nav-spinner" hidden aria-hidden="true">${iconLoader2()}</span>
          <div class="card__icon card__icon--join">${iconMessageCircle()}</div>
          <h2>${t("joinCardTitle")}</h2>
          <p>${t("joinCardDesc")}</p>
          <button type="button" class="btn btn--secondary" data-action="join">
            <span class="landing__nav-spinner" hidden aria-hidden="true">${iconLoader2()}</span>
            <span class="landing__btn-text">${t("join")}</span>
          </button>
        </div>
      </div>
      <section class="landing__pinned" aria-labelledby="pinned-rooms-heading">
        <div class="landing__active-head">
          <h2 id="pinned-rooms-heading" class="landing__active-title">${t("pinnedRoomsTitle")}</h2>
          <button
            type="button"
            class="btn btn--ghost btn--sm landing__pinned-create"
            data-action="persistent-room-open"
            title="Create persistent room"
            aria-label="Create persistent room"
          >
            ${iconPlus()}
          </button>
        </div>
        <p class="landing__active-hint">${t("pinnedRoomsHint")}</p>
        <p class="landing__active-error" id="pinned-rooms-error" hidden></p>
        <p class="landing__active-empty" id="pinned-rooms-empty" hidden>${t("pinnedRoomsEmpty")}</p>
        <ul class="landing__active-list" id="pinned-rooms-list" role="list"></ul>
      </section>
      <section class="landing__active" aria-labelledby="active-rooms-heading">
        <div class="landing__active-head">
          <h2 id="active-rooms-heading" class="landing__active-title">${t("activeRoomsTitle")}</h2>
          <button type="button" class="btn btn--ghost btn--sm landing__active-refresh" data-action="refresh-active-rooms" title="${t("activeRoomsRefresh")}">
            ${iconRefreshCw()}
            <span>${t("activeRoomsRefresh")}</span>
          </button>
        </div>
        <p class="landing__active-hint">${t("activeRoomsHint")}</p>
        <p class="landing__active-loading" id="active-rooms-loading">${t("activeRoomsLoading")}</p>
        <p class="landing__active-error" id="active-rooms-error" hidden></p>
        <div class="landing__active-empty-wrap" id="active-rooms-empty" hidden>
          <div class="landing__empty-icon" aria-hidden="true">${iconLandingActiveRoomsEmpty()}</div>
          <p class="landing__empty-headline">${t("activeRoomsEmptyHeadline")}</p>
          <p class="landing__empty-copy">${t("activeRoomsEmpty")}</p>
          <button type="button" class="btn btn--secondary btn--sm" data-action="join-empty-cta">
            <span class="landing__nav-spinner" hidden aria-hidden="true">${iconLoader2()}</span>
            <span class="landing__btn-text">${t("activeRoomsEmptyCta")}</span>
          </button>
        </div>
        <ul class="landing__active-list" id="active-rooms-list" role="list"></ul>
      </section>
      <footer class="landing__footer">
        <a href="https://github.com/Smotherer007/easymeet" target="_blank" rel="noopener noreferrer" class="landing__footer-link" title="GitHub">
          ${iconGithub()}
          <span>GitHub</span>
        </a>
        <span class="landing__footer-sep">·</span>
        <a href="https://patrick.weppelmann.ddnss.de" target="_blank" rel="noopener noreferrer" class="landing__footer-link" title="patrick.weppelmann.ddnss.de">
          ${iconGlobe()}
          <span>Patrick Weppelmann</span>
        </a>
      </footer>
      <div class="server-admin-modal" id="server-admin-modal" hidden>
        <div class="server-admin-modal__backdrop" data-action="server-admin-close"></div>
        <div class="server-admin-modal__panel" role="dialog" aria-modal="true" aria-labelledby="server-admin-modal-title">
          <h3 class="server-admin-modal__title" id="server-admin-modal-title">Server Admin Login</h3>
          <p class="server-admin-modal__body">Enter the bootstrap token from the server logs.</p>
          <div class="input-group server-admin-modal__field">
            <label for="server-admin-token">Bootstrap Token</label>
            <input id="server-admin-token" type="password" autocomplete="off" placeholder="Paste token" />
          </div>
          <p class="server-admin-modal__status" id="server-admin-status" hidden></p>
          <div class="server-admin-modal__actions">
            <button type="button" class="btn btn--ghost" data-action="server-admin-close">Cancel</button>
            <button type="button" class="btn btn--secondary" data-action="server-admin-login">Login</button>
          </div>
        </div>
      </div>
      <div class="server-admin-modal" id="persistent-room-modal" hidden>
        <div class="server-admin-modal__backdrop" data-action="persistent-room-close"></div>
        <div class="server-admin-modal__panel" role="dialog" aria-modal="true" aria-labelledby="persistent-room-modal-title">
          <h3 class="server-admin-modal__title" id="persistent-room-modal-title">Create Persistent Room</h3>
          <p class="server-admin-modal__body">This action is available to server admins only.</p>
          <div class="input-group server-admin-modal__field">
            <label for="persistent-room-code">Room Code</label>
            <input id="persistent-room-code" type="text" autocomplete="off" placeholder="e.g. STANDUP" />
          </div>
          <div class="input-group server-admin-modal__field">
            <label for="persistent-room-name">Name</label>
            <input id="persistent-room-name" type="text" autocomplete="off" placeholder="Optional room name" />
          </div>
          <div class="input-group server-admin-modal__field">
            <label for="persistent-room-description">Description</label>
            <input id="persistent-room-description" type="text" autocomplete="off" placeholder="Optional description" />
          </div>
          <div class="input-group server-admin-modal__field">
            <label for="persistent-room-welcome">Welcome Message</label>
            <input id="persistent-room-welcome" type="text" autocomplete="off" placeholder="Optional welcome text" />
          </div>
          <div class="input-group server-admin-modal__field">
            <label for="persistent-room-password">Password</label>
            <input id="persistent-room-password" type="password" autocomplete="off" placeholder="Optional password" />
          </div>
          <p class="server-admin-modal__status" id="persistent-room-status" hidden></p>
          <div class="server-admin-modal__actions">
            <button type="button" class="btn btn--ghost" data-action="persistent-room-close">Cancel</button>
            <button type="button" class="btn btn--primary" data-action="persistent-room-create">Create Room</button>
          </div>
        </div>
      </div>
      <div class="leave-room-modal" id="persistent-room-delete-modal" hidden role="dialog" aria-modal="true" aria-labelledby="persistent-room-delete-title">
        <div class="leave-room-modal__backdrop" data-action="persistent-room-delete-cancel"></div>
        <div class="leave-room-modal__panel">
          <h2 class="leave-room-modal__title" id="persistent-room-delete-title">Delete Persistent Room</h2>
          <p class="leave-room-modal__body">
            Do you really want to delete
            <strong id="persistent-room-delete-room-id"></strong>?
            This cannot be undone.
          </p>
          <div class="leave-room-modal__actions">
            <button type="button" class="btn btn--secondary" data-action="persistent-room-delete-cancel">Cancel</button>
            <button type="button" class="btn btn--danger" data-action="persistent-room-delete-confirm">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/** Display room id without hyphenation (canonical code). */
function formatRoomIdDisplay(roomId) {
	const s = String(roomId || "")
		.replace(/[^A-Z0-9]/gi, "")
		.toUpperCase();
	return s || String(roomId || "").trim();
}

function peopleLabel(count) {
	return count === 1 ? t("activeRoomsOnlineOne") : t("activeRoomsOnlineMany").replace("{n}", String(count));
}

const MAX_ACTIVE_ROOM_NAMES_SHOWN = 8;

function formatActiveRoomParticipantLine(participants) {
	if (!Array.isArray(participants) || participants.length === 0) return "";
	if (participants.length <= MAX_ACTIVE_ROOM_NAMES_SHOWN) {
		return participants.join(", ");
	}
	const head = participants.slice(0, MAX_ACTIVE_ROOM_NAMES_SHOWN).join(", ");
	const more = participants.length - MAX_ACTIVE_ROOM_NAMES_SHOWN;
	return `${head} ${t("activeRoomsNamesMore").replace("{n}", String(more))}`;
}

/**
 * @param {{ showJumpIcon?: boolean; showDelete?: boolean; onDeleteRoom?: (roomId: string) => void }} [options]
 */
function appendRoomListItem(listEl, r, metaMainText, onPickRoom, options = {}) {
	const { showJumpIcon = false, showDelete = false, onDeleteRoom } = options;
	const li = document.createElement("li");
	li.className = showJumpIcon ? "landing-active-room landing-active-room--pinned" : "landing-active-room";
	li.setAttribute("role", "button");
	li.tabIndex = 0;
	const code = document.createElement("span");
	code.className = "landing-active-room__code";
	code.textContent = formatRoomIdDisplay(r.roomId);
	const meta = document.createElement("span");
	meta.className = "landing-active-room__meta";
	meta.appendChild(document.createTextNode(metaMainText));
	if (r.hasPassword) {
		meta.appendChild(document.createTextNode(" · "));
		const lockWrap = document.createElement("span");
		lockWrap.className = "landing-active-room__lock";
		lockWrap.setAttribute("title", t("activeRoomsPasswordHint"));
		lockWrap.setAttribute("aria-label", t("activeRoomsPasswordHint"));
		lockWrap.innerHTML = iconLockInline();
		meta.appendChild(lockWrap);
	}
	if (showJumpIcon) {
		const top = document.createElement("div");
		top.className = "landing-active-room__top";
		top.appendChild(code);
		const actions = document.createElement("div");
		actions.className = "landing-active-room__actions";
		const jump = document.createElement("span");
		jump.className = "landing-active-room__jump";
		jump.setAttribute("aria-hidden", "true");
		jump.setAttribute("title", t("pinnedRoomsJumpHint"));
		jump.innerHTML = iconPinnedRoomJump();
		actions.appendChild(jump);
		if (showDelete) {
			const delBtn = document.createElement("button");
			delBtn.type = "button";
			delBtn.className = "landing-active-room__delete";
			delBtn.title = "Delete persistent room";
			delBtn.setAttribute("aria-label", "Delete persistent room");
			delBtn.innerHTML = iconTrash2();
			delBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				onDeleteRoom?.(String(r.roomId || ""));
			});
			delBtn.addEventListener("keydown", (e) => {
				e.stopPropagation();
			});
			actions.appendChild(delBtn);
		}
		top.appendChild(actions);
		li.appendChild(top);
	} else {
		li.appendChild(code);
	}
	li.appendChild(meta);
	const namesLine = formatActiveRoomParticipantLine(r.participants);
	if (namesLine) {
		const namesEl = document.createElement("span");
		namesEl.className = "landing-active-room__names";
		namesEl.textContent = namesLine;
		li.appendChild(namesEl);
	}
	const open = () => onPickRoom?.(r.roomId, !!r.hasPassword);
	li.addEventListener("click", open);
	li.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open();
		}
	});
	listEl.appendChild(li);
}

/**
 * @param {HTMLElement} container
 * @param {(roomId: string, hasPassword: boolean) => void} onPickRoom
 * @param {{ canDelete?: boolean; onDeleteRoom?: (roomId: string) => void }} [options]
 */
export async function refreshPinnedRoomsPanel(container, onPickRoom, options = {}) {
	const { canDelete = false, onDeleteRoom } = options;
	const listEl = container.querySelector("#pinned-rooms-list");
	const emptyEl = container.querySelector("#pinned-rooms-empty");
	const errEl = container.querySelector("#pinned-rooms-error");
	if (!listEl) return;
	listEl.innerHTML = "";
	if (errEl) {
		errEl.textContent = "";
		errEl.setAttribute("hidden", "");
	}
	if (emptyEl) emptyEl.setAttribute("hidden", "");

	const result = await fetchPinnedRooms();

	if (!result.success) {
		if (errEl) {
			errEl.textContent = t("pinnedRoomsError");
			errEl.removeAttribute("hidden");
		}
		return;
	}

	const rooms = result.data.rooms || [];
	if (rooms.length === 0) {
		if (emptyEl) emptyEl.removeAttribute("hidden");
		return;
	}

	if (emptyEl) emptyEl.setAttribute("hidden", "");
	for (const r of rooms) {
		appendRoomListItem(listEl, r, t("pinnedRoomsMeta"), onPickRoom, {
			showJumpIcon: true,
			showDelete: !!canDelete,
			onDeleteRoom
		});
	}
}

/**
 * @param {HTMLElement} container
 * @param {(roomId: string, hasPassword: boolean) => void} onPickRoom
 */
export async function refreshActiveRoomsPanel(container, onPickRoom) {
	const listEl = container.querySelector("#active-rooms-list");
	const emptyEl = container.querySelector("#active-rooms-empty");
	const errEl = container.querySelector("#active-rooms-error");
	const loadingEl = container.querySelector("#active-rooms-loading");
	if (!listEl) return;
	listEl.innerHTML = "";
	if (errEl) {
		errEl.textContent = "";
		errEl.setAttribute("hidden", "");
	}
	if (emptyEl) emptyEl.setAttribute("hidden", "");
	loadingEl?.removeAttribute("hidden");

	const result = await fetchActiveRooms();

	loadingEl?.setAttribute("hidden", "");

	if (!result.success) {
		if (errEl) {
			errEl.textContent = t("activeRoomsError");
			errEl.removeAttribute("hidden");
		}
		return;
	}

	const rooms = result.data.rooms || [];
	if (rooms.length === 0) {
		if (emptyEl) emptyEl.removeAttribute("hidden");
		return;
	}

	if (emptyEl) emptyEl.setAttribute("hidden", "");
	for (const r of rooms) {
		appendRoomListItem(listEl, r, peopleLabel(r.participantCount), onPickRoom);
	}
}

/**
 * @param {HTMLElement} container
 * @param {{ onCreateRoom: () => void; onJoinRoom: () => void; onPickActiveRoom: (roomId: string, hasPassword: boolean) => void }} handlers
 */
export function attachLandingListeners(container, handlers) {
	const { onCreateRoom, onJoinRoom, onPickActiveRoom, onServerAdminLogin, onCreatePersistentRoom, onDeletePersistentRoom, isServerAdmin } = handlers;
	teardownLandingAutoRefresh(container);
	landingRoomPanelsRefreshChain = Promise.resolve();

	const runLandingNav = (fn) => (e) => {
		const el = e.currentTarget;
		el.setAttribute("aria-busy", "true");
		el.classList.add("landing__nav-pending");
		el.querySelectorAll(":scope > .landing__nav-spinner").forEach((s) => s.removeAttribute("hidden"));
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				fn();
			});
		});
	};
	container.querySelectorAll('[data-action="create"]').forEach((el) => el.addEventListener("click", runLandingNav(onCreateRoom)));
	container.querySelectorAll('[data-action="join"]').forEach((el) => el.addEventListener("click", runLandingNav(onJoinRoom)));

	/** Active rooms only (do not reload pinned list on every poll). */
	const runActiveRoomsRefresh = () => {
		landingRoomPanelsRefreshChain = landingRoomPanelsRefreshChain
			.catch(() => {})
			.then(async () => {
				await refreshActiveRoomsPanel(container, onPickActiveRoom);
			});
		return landingRoomPanelsRefreshChain;
	};
	const getServerAdminStatus = () => {
		if (typeof isServerAdmin === "function") return !!isServerAdmin();
		return !!isServerAdmin;
	};
	const syncPersistentRoomCreateVisibility = () => {
		const btn = container.querySelector('[data-action="persistent-room-open"]');
		if (!btn) return;
		btn.hidden = !getServerAdminStatus();
	};
	const deleteModal = container.querySelector("#persistent-room-delete-modal");
	const deleteRoomIdEl = container.querySelector("#persistent-room-delete-room-id");
	let pendingDeleteRoomId = "";
	const openDeleteModal = (roomId) => {
		pendingDeleteRoomId = String(roomId || "").trim().toUpperCase();
		if (deleteRoomIdEl) deleteRoomIdEl.textContent = pendingDeleteRoomId;
		deleteModal?.removeAttribute("hidden");
	};
	const closeDeleteModal = () => {
		pendingDeleteRoomId = "";
		deleteModal?.setAttribute("hidden", "");
	};
	deleteModal
		?.querySelectorAll('[data-action="persistent-room-delete-cancel"]')
		.forEach((el) => el.addEventListener("click", closeDeleteModal));
	const refreshPinnedRoomsForRole = async () => {
		syncPersistentRoomCreateVisibility();
		await refreshPinnedRoomsPanel(container, onPickActiveRoom, {
			canDelete: getServerAdminStatus(),
			onDeleteRoom: deletePersistentRoom
		});
	};
	const deletePersistentRoom = async (roomId) => {
		if (!getServerAdminStatus()) {
			window.alert("Only server admins can delete persistent rooms.");
			return;
		}
		openDeleteModal(roomId);
	};
	deleteModal?.querySelector('[data-action="persistent-room-delete-confirm"]')?.addEventListener("click", async () => {
		if (!pendingDeleteRoomId) return;
		const result = await onDeletePersistentRoom?.(pendingDeleteRoomId);
		if (!result?.success) {
			window.alert(result?.error?.message || "Could not delete persistent room.");
			return;
		}
		closeDeleteModal();
		await refreshPinnedRoomsForRole();
	});

	container.querySelector('[data-action="refresh-active-rooms"]')?.addEventListener("click", () => void runActiveRoomsRefresh());
	container.querySelector('[data-action="join-empty-cta"]')?.addEventListener("click", runLandingNav(onJoinRoom));
	const adminModal = container.querySelector("#server-admin-modal");
	const openAdminModal = () => {
		adminModal?.removeAttribute("hidden");
		container.querySelector("#server-admin-token")?.focus();
	};
	const closeAdminModal = () => {
		adminModal?.setAttribute("hidden", "");
	};
	adminModal?.querySelectorAll('[data-action="server-admin-close"]').forEach((el) => el.addEventListener("click", closeAdminModal));

	const persistentRoomModal = container.querySelector("#persistent-room-modal");
	const openPersistentRoomModal = () => {
		const status = container.querySelector("#persistent-room-status");
		if (!getServerAdminStatus()) {
			if (status) {
				status.textContent = "Only server admins can create persistent rooms.";
				status.classList.add("server-admin-modal__status--error");
				status.removeAttribute("hidden");
			}
			return;
		}
		if (status) {
			status.textContent = "";
			status.classList.remove("server-admin-modal__status--error");
			status.setAttribute("hidden", "");
		}
		persistentRoomModal?.removeAttribute("hidden");
		container.querySelector("#persistent-room-code")?.focus();
	};
	const closePersistentRoomModal = () => {
		persistentRoomModal?.setAttribute("hidden", "");
	};
	persistentRoomModal
		?.querySelectorAll('[data-action="persistent-room-close"]')
		.forEach((el) => el.addEventListener("click", closePersistentRoomModal));

	if (!container._easymeetServerAdminOpenHandler) {
		const onAdminOpenClick = (e) => {
			const trigger = e.target?.closest?.("#server-admin-open-btn");
			if (!trigger) return;
			openAdminModal();
		};
		container._easymeetServerAdminOpenHandler = onAdminOpenClick;
		document.addEventListener("click", onAdminOpenClick);
	}
	container.querySelector('[data-action="persistent-room-open"]')?.addEventListener("click", openPersistentRoomModal);
	syncPersistentRoomCreateVisibility();

	container.querySelector('[data-action="server-admin-login"]')?.addEventListener("click", async () => {
		const input = container.querySelector("#server-admin-token");
		const status = container.querySelector("#server-admin-status");
		const token = input?.value?.trim() || "";
		if (!token) return;
		const ok = await onServerAdminLogin?.(token);
		if (!status) return;
		status.removeAttribute("hidden");
		status.textContent = ok ? "Server admin is now active on this browser." : "Server admin login failed.";
		status.classList.toggle("server-admin-modal__status--error", !ok);
		if (ok && input) {
			input.value = "";
			await refreshPinnedRoomsForRole();
			setTimeout(closeAdminModal, 500);
		}
	});

	container.querySelector('[data-action="persistent-room-create"]')?.addEventListener("click", async () => {
		const status = container.querySelector("#persistent-room-status");
		if (!getServerAdminStatus()) {
			if (status) {
				status.textContent = "Only server admins can create persistent rooms.";
				status.classList.add("server-admin-modal__status--error");
				status.removeAttribute("hidden");
			}
			return;
		}
		const roomCode = container.querySelector("#persistent-room-code")?.value?.trim() || "";
		const name = container.querySelector("#persistent-room-name")?.value?.trim() || "";
		const description = container.querySelector("#persistent-room-description")?.value?.trim() || "";
		const welcomeMessage = container.querySelector("#persistent-room-welcome")?.value?.trim() || "";
		const password = container.querySelector("#persistent-room-password")?.value || "";
		if (!roomCode) {
			if (status) {
				status.textContent = "Room code is required.";
				status.classList.add("server-admin-modal__status--error");
				status.removeAttribute("hidden");
			}
			return;
		}
		const result = await onCreatePersistentRoom?.({ roomCode, name, description, welcomeMessage, password });
		if (!status) return;
		if (!result?.success) {
			status.textContent = result?.error?.message || "Could not create persistent room.";
			status.classList.add("server-admin-modal__status--error");
			status.removeAttribute("hidden");
			return;
		}
		status.textContent = "Persistent room created successfully.";
		status.classList.remove("server-admin-modal__status--error");
		status.removeAttribute("hidden");
		await refreshPinnedRoomsForRole();
		setTimeout(closePersistentRoomModal, 600);
	});

	void (async () => {
		await refreshPinnedRoomsForRole();
		await refreshActiveRoomsPanel(container, onPickActiveRoom);
	})();

	container._easymeetActiveRoomsInterval = window.setInterval(() => void runActiveRoomsRefresh(), LANDING_ROOMS_POLL_MS);

	const onVis = () => {
		if (document.visibilityState === "visible") void runActiveRoomsRefresh();
	};
	container._easymeetLandingVisibilityHandler = onVis;
	document.addEventListener("visibilitychange", onVis);

	/* Orb parallax intentionally disabled to keep landing background static. */

	return {
		refreshPinnedRoomsForRole
	};
}
