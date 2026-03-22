import { t } from '../../i18n.js';
import { iconCopy, iconLink, iconExternalLink } from '../../icons.js';

export function renderCreateRoomForm() {
  return `
    <div class="screen create-room">
      <button class="btn btn--ghost back-btn" data-action="back">${t('back')}</button>
      <div class="create-room__form">
        <h1>${t('createRoom')}</h1>
        <p class="create-room__hint">${t('createRoomHint')}</p>
        <div class="input-group">
          <label for="nickname">${t('nickname')}</label>
          <input type="text" id="nickname" placeholder="${t('nicknamePlaceholder')}" autocomplete="off" maxlength="32" />
        </div>
        <div class="input-group">
          <label for="room-code">${t('roomCode')}</label>
          <input type="text" id="room-code" placeholder="${t('roomCodePlaceholderCreate')}" autocomplete="off" maxlength="32" />
        </div>
        <div class="input-group">
          <label for="password">${t('password')}</label>
          <input type="password" id="password" placeholder="${t('passwordPlaceholder')}" autocomplete="off" />
        </div>
        <button type="button" class="btn btn--primary btn--lg" id="create-room-btn">${t('createRoom')}</button>
        <p class="error-msg" id="create-error"></p>
      </div>
    </div>
  `;
}

/** Shared share content for create-room-success and room-view share modal */
export function renderShareContent(roomId, formattedRoomId, joinUrl, options = {}) {
  const { qrCanvasId = 'qr-code-canvas', qrContainerId = 'qr-code-container', showOpenLink = true } = options;
  const openLinkBtn = showOpenLink ? `<button class="btn btn--ghost room-code__copy" data-action="open-link">${iconExternalLink()}<span>${t('openLink')}</span></button>` : '';
  return `
    <p class="room-code-label">${t('shareCode')}</p>
    <div class="room-code" data-room-id="${roomId}">
      <span class="room-code__value">${formattedRoomId}</span>
      <button class="btn btn--ghost room-code__copy" data-action="copy">${iconCopy()}<span>${t('copy')}</span></button>
    </div>
    <p class="room-code-label">${t('orShareLink')}</p>
    <div class="room-code room-link" data-room-id="${roomId}">
      <span class="room-code__value room-link__url">${joinUrl || ''}</span>
      <button class="btn btn--ghost room-code__copy" data-action="copy-link">${iconLink()}<span>${t('copyLink')}</span></button>
      ${openLinkBtn}
    </div>
    <div class="qr-code-section">
      <div class="qr-code__container" id="${qrContainerId}">
        <canvas id="${qrCanvasId}" class="qr-code__canvas"></canvas>
        <p class="qr-code__hint">${t('qrHint')}</p>
      </div>
    </div>
  `;
}

export function renderCreateRoomSuccess(roomId, getJoinUrl) {
  const formatted = roomId.replace(/(.{3})/g, '$1-').replace(/-$/, '');
  const joinUrl = getJoinUrl?.(roomId) ?? `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(roomId)}`;
  return `
    <div class="screen create-room create-room--success">
      <button class="btn btn--ghost back-btn" data-action="back">${t('back')}</button>
      <div class="create-room__success">
        <h2>${t('roomCreated')}</h2>
        ${renderShareContent(roomId, formatted, joinUrl, { showOpenLink: false })}
        <button class="btn btn--primary btn--lg" id="enter-room-btn">${t('enterRoom')}</button>
      </div>
    </div>
  `;
}

export async function showQrCode(container, roomId, getJoinUrl) {
  const canvas = container.querySelector('#qr-code-canvas');
  if (!canvas || !roomId) return;
  const joinUrl = getJoinUrl?.(roomId) ?? `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(roomId)}`;
  const QRCode = (await import('qrcode')).default;
  try {
    await QRCode.toCanvas(canvas, joinUrl, { width: 200, margin: 2 });
  } catch (err) {
    console.error('QR-Code Fehler:', err);
  }
}

export function attachCreateRoomListeners(container, callbacks) {
  const nicknameInput = container.querySelector('#nickname');
  const roomCodeInput = container.querySelector('#room-code');
  const passwordInput = container.querySelector('#password');
  const createBtn = container.querySelector('#create-room-btn');
  const errorEl = container.querySelector('#create-error');

  if (nicknameInput && callbacks.initialNickname) nicknameInput.value = callbacks.initialNickname;
  if (roomCodeInput && callbacks.initialRoomCode) roomCodeInput.value = callbacks.initialRoomCode;
  if (nicknameInput && createBtn) {
    nicknameInput.addEventListener('input', () => {
      if (errorEl) errorEl.textContent = '';
    });
    nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') createBtn.click();
    });
    createBtn.addEventListener('click', () => {
      const nick = (nicknameInput?.value ?? '').trim();
      const roomCode = (roomCodeInput?.value ?? '').trim();
      const pwd = (passwordInput?.value ?? '').toString().trim();
      if (!nick) {
        if (errorEl) errorEl.textContent = t('nicknameRequired');
        return;
      }
      callbacks.onCreate(nick, pwd, roomCode);
    });
  }

  container.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
  container.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
    const roomId = container.querySelector('.room-code:not(.room-link)')?.dataset?.roomId;
    if (roomId && navigator.clipboard) {
      navigator.clipboard.writeText(roomId);
      const span = container.querySelector('[data-action="copy"] span');
      if (span) {
        span.textContent = t('copied');
        setTimeout(() => (span.textContent = t('copy')), 2000);
      }
    }
  });
  container.querySelector('[data-action="copy-link"]')?.addEventListener('click', () => {
    const roomId = container.querySelector('.room-link')?.dataset?.roomId;
    if (roomId && navigator.clipboard) {
      const joinUrl = callbacks.getJoinUrl?.(roomId) ?? `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(roomId)}`;
      navigator.clipboard.writeText(joinUrl);
      const span = container.querySelector('[data-action="copy-link"] span');
      if (span) {
        span.textContent = t('linkCopied');
        setTimeout(() => (span.textContent = t('copyLink')), 2000);
      }
    }
  });
  container.querySelector('[data-action="open-link"]')?.addEventListener('click', () => {
    const roomId = container.querySelector('.room-link')?.dataset?.roomId;
    if (roomId && callbacks.getJoinUrl) window.open(callbacks.getJoinUrl(roomId), '_blank');
  });
  container.querySelector('#enter-room-btn')?.addEventListener('click', () => {
    callbacks.onEnterRoom?.();
  });
  const roomId = container.querySelector('.room-link')?.dataset?.roomId;
  if (roomId && callbacks.getJoinUrl) {
    showQrCode(container, roomId, callbacks.getJoinUrl);
  }
}
