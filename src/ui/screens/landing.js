import { t } from '../../i18n.js';
import { iconMessageCirclePlus, iconMessageCircle, iconLogoWordmark, iconGithub, iconGlobe } from '../../icons.js';

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

export function attachLandingListeners(container, onCreateRoom, onJoinRoom) {
  container.querySelector('[data-action="create"]')?.addEventListener('click', onCreateRoom);
  container.querySelectorAll('[data-action="join"]').forEach((el) => {
    el.addEventListener('click', onJoinRoom);
  });
}
