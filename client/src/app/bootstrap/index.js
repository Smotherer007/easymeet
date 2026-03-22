/**
 * App Bootstrap – Composition Root.
 * Orchestriert Module unter ./bootstrap/* (Navigation, Storage, Raum-Lebenszyklus, Subscriptions).
 */

import { installAudioUnlockOnUserGesture } from '../../audio.js';
import {
  preloadBackgroundEffectsModel,
  preloadBackgroundImages,
} from '../../effects/backgroundEffects.js';
import { fetchRoomStatus } from '../../effects/network/api.js';
import { readNickname, readPeerVolumes, readDeviceIds } from '../../effects/storage/deviceStorage.js';
import { dispatch, getState, subscribe } from '../../store/index.js';
import * as selectors from '../../domain/selectors/index.js';
import { onLangChange } from '../../i18n.js';
import { initFromStorage } from './storageHydration.js';
import { createApplyEffectToPreview } from './previewEffects.js';
import { renderLangSwitcher, navigateScreens } from './screens.js';
import {
  cleanupAndNavigate as cleanupAndNavigateFn,
  setupBeforeUnload,
  handleStopScreen as handleStopScreenFn,
} from './cleanup.js';
import { createSubscriptionHandler } from './subscribe.js';
import { logAppInfo } from '../../utils/easymeetLog.js';

/**
 * @param {HTMLElement} appEl
 */
export function bootstrap(appEl) {
  logAppInfo('bootstrap start');
  installAudioUnlockOnUserGesture();
  initFromStorage(dispatch, readDeviceIds, readPeerVolumes);
  setupBeforeUnload({ getState });

  const applyEffectToPreview = createApplyEffectToPreview(getState, dispatch);

  const ctx = {
    dispatch,
    getState,
    readNickname,
    readPeerVolumes,
    getJoinUrl: (roomId) => {
      const base = window.location.origin + window.location.pathname;
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}join=${encodeURIComponent(roomId || '')}`;
    },
    applyEffectToPreview,
    navigate: (el, screen, data) => navigateScreens(el, ctx, screen, data),
    cleanupAndNavigate: (el, screen) => cleanupAndNavigateFn(ctx, el, screen),
    handleStopScreen: (el) => handleStopScreenFn({ dispatch, getState, appEl: el }),
  };

  subscribe(createSubscriptionHandler(appEl, getState, dispatch));
  renderLangSwitcher(appEl, ctx);
  onLangChange(() => ctx.navigate(appEl, selectors.selectScreen(getState())));
  preloadBackgroundEffectsModel();
  preloadBackgroundImages();
  initFromUrl(appEl, ctx);
}

async function initFromUrl(appEl, ctx) {
  const params = new URLSearchParams(window.location.search);
  const join = params.get('join') || params.get('code');
  if (join) {
    const identifier = join.trim();
    if (identifier) {
      const statusResult = await fetchRoomStatus(identifier);
      const { hasPassword } = statusResult.success
        ? statusResult.data
        : { exists: false, hasPassword: true };
      ctx.navigate(appEl, 'join-room', {
        joinRoomCode: identifier,
        joinRoomHasPassword: hasPassword,
      });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
  }
  ctx.navigate(appEl, 'landing');
  logAppInfo('bootstrap ready');
}
