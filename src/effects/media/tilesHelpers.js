/**
 * Helper functions for tiles.js (rule: ≤20 lines per function)
 */
import { t } from '../../i18n.js';
import { iconMic, iconMicOff, iconVideo, iconVideoOff } from '../../icons.js';
import {
  selectMyPeerId,
  selectPeerVideoState,
  selectPeerMuteState,
  selectIsMuted,
  selectVoipMembers,
  selectPeerVolumeFor,
} from '../../domain/selectors/index.js';

export function getTileState(state, peerId, stream) {
  const isLocal = peerId === selectMyPeerId(state);
  const streamHasVideo = stream?.getVideoTracks?.().length > 0 && stream.getVideoTracks().some((tr) => tr.enabled);
  const peerVideoState = selectPeerVideoState(state);
  const hasVideo = isLocal ? streamHasVideo : (peerVideoState.has(peerId) ? peerVideoState.get(peerId) : streamHasVideo);
  const isMuted = isLocal ? selectIsMuted(state) : (selectPeerMuteState(state).get(peerId) ?? false);
  const vol = selectPeerVolumeFor(state, peerId);
  const nick = selectVoipMembers(state).find((m) => m.peerId === peerId)?.nick || '...';
  return { isLocal, hasVideo, isMuted, vol, nick };
}

export function createMediaElement(isLocal) {
  const mediaEl = document.createElement('video');
  mediaEl.autoplay = true;
  mediaEl.playsInline = true;
  if (isLocal) mediaEl.muted = true;
  return mediaEl;
}

export function createNameElement(nick, isLocal) {
  const nameEl = document.createElement('span');
  nameEl.className = 'video-tile__name';
  nameEl.textContent = isLocal ? nick + ' ' + t('you') : nick;
  return nameEl;
}

export function createMuteStatusElement(isMuted) {
  const el = document.createElement('div');
  el.className = 'video-tile__mute-status';
  el.title = isMuted ? t('muted') : t('unmuted');
  el.innerHTML = isMuted ? iconMicOff() : iconMic();
  return el;
}

export function createVolumeControlElement(peerId, vol) {
  const wrap = document.createElement('div');
  wrap.className = 'voip-view__volume-wrap';
  wrap.dataset.peerId = peerId;
  wrap.title = t('volume');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'video-tile__mute-status video-tile__volume-trigger';
  btn.dataset.action = 'volume-toggle';
  btn.setAttribute('aria-label', t('volume'));
  btn.title = t('volume');
  btn.innerHTML = iconMic();
  const tooltip = document.createElement('div');
  tooltip.className = 'voip-view__volume-tooltip';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'voip-view__volume-slider';
  slider.min = '0';
  slider.max = '200';
  slider.value = String(vol);
  slider.dataset.peerId = peerId;
  tooltip.appendChild(slider);
  wrap.appendChild(btn);
  wrap.appendChild(tooltip);
  return wrap;
}

export function createStatusRowElement(peerId, tileState) {
  const { isLocal, isMuted, vol } = tileState;
  const statusRow = document.createElement('div');
  statusRow.className = 'video-tile__status-row';
  if (isLocal || isMuted) {
    statusRow.appendChild(createMuteStatusElement(isMuted));
  } else {
    statusRow.appendChild(createVolumeControlElement(peerId, vol));
  }
  const cameraStatusEl = document.createElement('div');
  cameraStatusEl.className = 'video-tile__camera-status';
  cameraStatusEl.title = tileState.hasVideo ? t('cameraOn') : t('cameraOff');
  cameraStatusEl.innerHTML = tileState.hasVideo ? iconVideo() : iconVideoOff();
  statusRow.appendChild(cameraStatusEl);
  return statusRow;
}

export function createCameraOffElement() {
  const el = document.createElement('div');
  el.className = 'video-tile__camera-off';
  el.title = t('cameraOff');
  el.innerHTML = iconVideoOff();
  return el;
}

export function createNewTile(container, peerId, tileState) {
  const { isLocal, hasVideo } = tileState;
  const tile = document.createElement('div');
  tile.className = 'video-tile' + (isLocal ? ' video-tile--local' : '') + (!hasVideo ? ' video-tile--no-video' : '');
  tile.dataset.peerId = peerId;
  const mediaEl = createMediaElement(isLocal);
  const nameEl = createNameElement(tileState.nick, isLocal);
  const statusRow = createStatusRowElement(peerId, tileState);
  tile.appendChild(mediaEl);
  tile.appendChild(nameEl);
  tile.appendChild(statusRow);
  if (!hasVideo) tile.appendChild(createCameraOffElement());
  container.appendChild(tile);
  return { tile, mediaEl };
}

export function syncStatusRowVolumeControl(statusRow, peerId, tileState) {
  const { isLocal, isMuted, vol } = tileState;
  const wantsVolumeControl = !isLocal && !isMuted;
  const volumeWrap = statusRow.querySelector('.voip-view__volume-wrap');
  const hasVolumeControl = !!volumeWrap;
  if (wantsVolumeControl !== hasVolumeControl) {
    const toRemove = volumeWrap || statusRow.querySelector(':scope > .video-tile__mute-status');
    if (toRemove) toRemove.remove();
    if (wantsVolumeControl) {
      statusRow.insertBefore(createVolumeControlElement(peerId, vol), statusRow.firstChild);
    } else {
      statusRow.insertBefore(createMuteStatusElement(isMuted), statusRow.firstChild);
    }
  } else {
    const muteStatusEl = statusRow.querySelector('.video-tile__mute-status');
    if (muteStatusEl) {
      muteStatusEl.className = 'video-tile__mute-status' + (wantsVolumeControl ? ' video-tile__volume-trigger' : '');
      muteStatusEl.title = wantsVolumeControl ? t('volume') : (isMuted ? t('muted') : t('unmuted'));
      muteStatusEl.innerHTML = wantsVolumeControl ? iconMic() : (isMuted ? iconMicOff() : iconMic());
    }
  }
}

export function syncStatusRowCamera(statusRow, hasVideo) {
  let cameraStatusEl = statusRow.querySelector('.video-tile__camera-status');
  if (!cameraStatusEl) {
    cameraStatusEl = document.createElement('div');
    statusRow.appendChild(cameraStatusEl);
  }
  cameraStatusEl.className = 'video-tile__camera-status';
  cameraStatusEl.title = hasVideo ? t('cameraOn') : t('cameraOff');
  cameraStatusEl.innerHTML = hasVideo ? iconVideo() : iconVideoOff();
}

export function syncCameraOffElement(tile, hasVideo) {
  let cameraOffEl = tile.querySelector('.video-tile__camera-off');
  if (!hasVideo) {
    if (!cameraOffEl) {
      cameraOffEl = createCameraOffElement();
      tile.appendChild(cameraOffEl);
    }
  } else if (cameraOffEl) {
    cameraOffEl.remove();
  }
}

export function updateExistingTile(tile, peerId, tileState) {
  const { hasVideo } = tileState;
  tile.classList.toggle('video-tile--no-video', !hasVideo);
  let statusRow = tile.querySelector('.video-tile__status-row');
  if (!statusRow) {
    statusRow = document.createElement('div');
    statusRow.className = 'video-tile__status-row';
    const oldCamera = tile.querySelector('.video-tile__camera-status');
    if (oldCamera) oldCamera.remove();
    tile.appendChild(statusRow);
  }
  syncStatusRowVolumeControl(statusRow, peerId, tileState);
  syncStatusRowCamera(statusRow, hasVideo);
  syncCameraOffElement(tile, hasVideo);
}

export function applyStreamToMedia(mediaEl, stream, hasVideo, vol, outputDeviceId) {
  if (!mediaEl.muted) mediaEl.volume = Math.min(1, vol / 100);
  mediaEl.srcObject = hasVideo ? stream : (stream ? new MediaStream(stream.getAudioTracks?.() ?? []) : null);
  if (outputDeviceId && mediaEl.setSinkId) mediaEl.setSinkId(outputDeviceId).catch(() => {});
  mediaEl.play?.().catch(() => {});
}
