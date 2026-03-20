import { t } from '../../i18n.js';
import {
  iconMessageCirclePlus,
  iconMessageCircle,
  iconLogoWordmark,
  iconGithub,
  iconGlobe,
  iconRefreshCw,
  iconLockInline,
} from '../../icons.js';
import { fetchActiveRooms, fetchPinnedRooms } from '../../effects/network/api.js';

export function renderLanding() {
  return `
    <div class="screen landing">
      <div class="landing__hero">
        <h1 class="sr-only">${t('title')}</h1>
        ${iconLogoWordmark({ width: '100%', style: 'max-width: 320px; display: block; margin: 0 auto 1.5rem;' })}
        <p class="landing__subtitle">${t('subtitle')}</p>
      </div>
      <div class="landing__cards">
        <div class="card card--create" data-action="create">
          <div class="card__icon card__icon--create">${iconMessageCirclePlus()}</div>
          <h2>${t('createCardTitle')}</h2>
          <p>${t('createCardDesc')}</p>
          <button class="btn btn--primary" data-action="create">${t('createRoom')}</button>
        </div>
        <div class="card card--join" data-action="join">
          <div class="card__icon card__icon--join">${iconMessageCircle()}</div>
          <h2>${t('joinCardTitle')}</h2>
          <p>${t('joinCardDesc')}</p>
          <button class="btn btn--secondary" data-action="join">${t('join')}</button>
        </div>
      </div>
      <section class="landing__pinned" aria-labelledby="pinned-rooms-heading">
        <div class="landing__active-head">
          <h2 id="pinned-rooms-heading" class="landing__active-title">${t('pinnedRoomsTitle')}</h2>
        </div>
        <p class="landing__active-hint">${t('pinnedRoomsHint')}</p>
        <p class="landing__active-error" id="pinned-rooms-error" hidden></p>
        <p class="landing__active-empty" id="pinned-rooms-empty" hidden>${t('pinnedRoomsEmpty')}</p>
        <ul class="landing__active-list" id="pinned-rooms-list" role="list"></ul>
      </section>
      <section class="landing__active" aria-labelledby="active-rooms-heading">
        <div class="landing__active-head">
          <h2 id="active-rooms-heading" class="landing__active-title">${t('activeRoomsTitle')}</h2>
          <button type="button" class="btn btn--ghost btn--sm landing__active-refresh" data-action="refresh-active-rooms" title="${t('activeRoomsRefresh')}">
            ${iconRefreshCw()}
            <span>${t('activeRoomsRefresh')}</span>
          </button>
        </div>
        <p class="landing__active-hint">${t('activeRoomsHint')}</p>
        <p class="landing__active-loading" id="active-rooms-loading">${t('activeRoomsLoading')}</p>
        <p class="landing__active-error" id="active-rooms-error" hidden></p>
        <p class="landing__active-empty" id="active-rooms-empty" hidden>${t('activeRoomsEmpty')}</p>
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
    </div>
  `;
}

/** Anzeige ohne Bindestriche (kanonischer Code). */
function formatRoomIdDisplay(roomId) {
  const s = String(roomId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return s || String(roomId || '').trim();
}

function peopleLabel(count) {
  return count === 1 ? t('activeRoomsOnlineOne') : t('activeRoomsOnlineMany').replace('{n}', String(count));
}

function appendRoomListItem(listEl, r, metaMainText, onPickRoom) {
  const li = document.createElement('li');
  li.className = 'landing-active-room';
  li.setAttribute('role', 'button');
  li.tabIndex = 0;
  const code = document.createElement('span');
  code.className = 'landing-active-room__code';
  code.textContent = formatRoomIdDisplay(r.roomId);
  const meta = document.createElement('span');
  meta.className = 'landing-active-room__meta';
  meta.appendChild(document.createTextNode(metaMainText));
  if (r.hasPassword) {
    meta.appendChild(document.createTextNode(' · '));
    const lockWrap = document.createElement('span');
    lockWrap.className = 'landing-active-room__lock';
    lockWrap.setAttribute('title', t('activeRoomsPasswordHint'));
    lockWrap.setAttribute('aria-label', t('activeRoomsPasswordHint'));
    lockWrap.innerHTML = iconLockInline();
    meta.appendChild(lockWrap);
  }
  li.appendChild(code);
  li.appendChild(meta);
  const open = () => onPickRoom?.(r.roomId, !!r.hasPassword);
  li.addEventListener('click', open);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  listEl.appendChild(li);
}

/**
 * @param {HTMLElement} container
 * @param {(roomId: string, hasPassword: boolean) => void} onPickRoom
 */
export async function refreshPinnedRoomsPanel(container, onPickRoom) {
  const listEl = container.querySelector('#pinned-rooms-list');
  const emptyEl = container.querySelector('#pinned-rooms-empty');
  const errEl = container.querySelector('#pinned-rooms-error');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (errEl) {
    errEl.textContent = '';
    errEl.setAttribute('hidden', '');
  }
  if (emptyEl) emptyEl.setAttribute('hidden', '');

  const result = await fetchPinnedRooms();
  if (!result.success) {
    if (errEl) {
      errEl.textContent = t('pinnedRoomsError');
      errEl.removeAttribute('hidden');
    }
    return;
  }

  const rooms = result.data.rooms || [];
  if (rooms.length === 0) {
    if (emptyEl) emptyEl.removeAttribute('hidden');
    return;
  }

  for (const r of rooms) {
    appendRoomListItem(listEl, r, t('pinnedRoomsMeta'), onPickRoom);
  }
}

/**
 * @param {HTMLElement} container
 * @param {(roomId: string, hasPassword: boolean) => void} onPickRoom
 */
export async function refreshActiveRoomsPanel(container, onPickRoom) {
  const listEl = container.querySelector('#active-rooms-list');
  const emptyEl = container.querySelector('#active-rooms-empty');
  const errEl = container.querySelector('#active-rooms-error');
  const loadingEl = container.querySelector('#active-rooms-loading');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (errEl) {
    errEl.textContent = '';
    errEl.setAttribute('hidden', '');
  }
  if (emptyEl) emptyEl.setAttribute('hidden', '');
  loadingEl?.removeAttribute('hidden');

  const result = await fetchActiveRooms();
  loadingEl?.setAttribute('hidden', '');

  if (!result.success) {
    if (errEl) {
      errEl.textContent = t('activeRoomsError');
      errEl.removeAttribute('hidden');
    }
    return;
  }

  const rooms = result.data.rooms || [];
  if (rooms.length === 0) {
    if (emptyEl) emptyEl.removeAttribute('hidden');
    return;
  }

  for (const r of rooms) {
    appendRoomListItem(listEl, r, peopleLabel(r.participantCount), onPickRoom);
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ onCreateRoom: () => void; onJoinRoom: () => void; onPickActiveRoom: (roomId: string, hasPassword: boolean) => void }} handlers
 */
export function attachLandingListeners(container, handlers) {
  const { onCreateRoom, onJoinRoom, onPickActiveRoom } = handlers;
  clearInterval(container._easymeetActiveRoomsInterval);

  container.querySelector('[data-action="create"]')?.addEventListener('click', onCreateRoom);
  container.querySelectorAll('[data-action="join"]').forEach((el) => {
    el.addEventListener('click', onJoinRoom);
  });

  const runRefresh = async () => {
    await refreshPinnedRoomsPanel(container, onPickActiveRoom);
    await refreshActiveRoomsPanel(container, onPickActiveRoom);
  };
  container.querySelector('[data-action="refresh-active-rooms"]')?.addEventListener('click', () => void runRefresh());
  void runRefresh();
  container._easymeetActiveRoomsInterval = window.setInterval(() => void runRefresh(), 30000);
}
