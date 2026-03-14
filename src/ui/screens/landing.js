import { t } from '../../i18n.js';
import { iconMessageCirclePlus, iconMessageCircle, iconLogoWordmark } from '../../icons.js';

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
    </div>
  `;
}

export function attachLandingListeners(container, onCreateRoom, onJoinRoom) {
  container.querySelector('[data-action="create"]')?.addEventListener('click', onCreateRoom);
  container.querySelectorAll('[data-action="join"]').forEach((el) => {
    el.addEventListener('click', onJoinRoom);
  });
}
