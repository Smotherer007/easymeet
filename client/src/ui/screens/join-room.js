import { t } from '../../i18n.js';
import { escapeAttr } from '../../shared/escape.js';

export function renderJoinRoom(initialRoomCode = '', hasPassword = true) {
  const value = escapeAttr((initialRoomCode || '').trim());
  return `
    <div class="screen join-room">
      <button class="btn btn--ghost back-btn" data-action="back">${t('back')}</button>
      <form class="join-room__form" id="join-form" novalidate>
        <h1>${t('joinRoom')}</h1>
        <p class="join-room__hint">${t('joinRoomHint')}</p>
        <div class="input-group">
          <label for="nickname">${t('nickname')}</label>
          <input type="text" id="nickname" placeholder="${t('nicknamePlaceholder')}" autocomplete="off" maxlength="32" />
        </div>
        <div class="input-group">
          <label for="room-code">${t('roomCode')}</label>
          <input type="text" id="room-code" placeholder="${t('roomCodePlaceholder')}" autocomplete="off" maxlength="64" value="${value}" />
        </div>
        ${hasPassword ? `
        <div class="input-group">
          <label for="join-password">${t('password')} <span class="input-group__optional">${t('passwordOptional')}</span></label>
          <input type="password" id="join-password" placeholder="${t('passwordJoinPlaceholder')}" autocomplete="off" />
        </div>
        ` : ''}
        <button type="submit" class="btn btn--primary btn--lg" id="join-btn">${t('join')}</button>
        <p class="error-msg" id="join-error"></p>
      </form>
    </div>
  `;
}

export function attachJoinRoomListeners(container, callbacks) {
  const nicknameInput = container.querySelector('#nickname');
  const roomInput = container.querySelector('#room-code');
  const passwordInput = container.querySelector('#join-password');
  const joinBtn = container.querySelector('#join-btn');
  const errorEl = container.querySelector('#join-error');
  const hasPassword = !!passwordInput;

  if (nicknameInput && callbacks.initialNickname) nicknameInput.value = callbacks.initialNickname;

  const updateJoinBtn = () => {
    if (joinBtn) {
      const roomOk = roomInput?.value?.trim();
      const nickOk = nicknameInput?.value?.trim();
      joinBtn.disabled = !roomOk || !nickOk;
    }
  };

  nicknameInput?.addEventListener('input', updateJoinBtn);
  roomInput?.addEventListener('input', updateJoinBtn);
  passwordInput?.addEventListener('input', updateJoinBtn);
  nicknameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn?.click(); });
  roomInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn?.click(); });
  passwordInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn?.click(); });

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const nick = nicknameInput?.value?.trim() ?? '';
    const roomId = roomInput?.value?.trim();
    const password = hasPassword ? (passwordInput?.value?.trim() ?? '') : '';
    if (roomId && nick) {
      if (errorEl) errorEl.textContent = '';
      callbacks.onJoin(roomId, password, nick);
    }
  };
  container.querySelector('#join-form')?.addEventListener('submit', handleSubmit);
  joinBtn?.addEventListener('click', handleSubmit);

  updateJoinBtn();
  container.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
}

export function setJoinError(container, message) {
  const el = container.querySelector('#join-error');
  if (el) el.textContent = message;
}
