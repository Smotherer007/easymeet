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
  const videoTracks = stream?.getVideoTracks?.() ?? [];
  const streamHasVideo = videoTracks.length > 0 && videoTracks.some((tr) => tr.enabled);
  /** Remote: Track existiert (z. B. Consumer), auch wenn enabled kurz false ist – sonst strippt applyStreamToMedia die Spur. */
  const streamHasVideoTrack = videoTracks.length > 0;
  const peerVideoState = selectPeerVideoState(state);

  let hasVideo = false;
  if (isLocal) {
    hasVideo = streamHasVideo;
  } else {
    const signaledVideo = peerVideoState.has(peerId) ? peerVideoState.get(peerId) : false;
    /* Tracks haben Vorrang vor Signalisierung — „Kamera aus“-Overlay nicht über laufendes Consumer-Video */
    hasVideo = streamHasVideoTrack || streamHasVideo || Boolean(signaledVideo);
  }
  
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
  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'video-tile__media-wrap';
  mediaWrap.appendChild(mediaEl);
  const nameEl = createNameElement(tileState.nick, isLocal);
  const statusRow = createStatusRowElement(peerId, tileState);
  tile.appendChild(mediaWrap);
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

function ensureVideoTileMediaWrap(tile) {
  if (tile.querySelector(':scope > .video-tile__media-wrap')) return;
  const directVideo = tile.querySelector(':scope > video');
  if (!directVideo) return;
  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'video-tile__media-wrap';
  tile.insertBefore(mediaWrap, directVideo);
  mediaWrap.appendChild(directVideo);
}

export function updateExistingTile(tile, peerId, tileState) {
  ensureVideoTileMediaWrap(tile);
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

/**
 * Remote mit Kamera: Chromium blockt oft autoplay auf &lt;video&gt; mit Audio+Video (schwarze Kachel).
 * Lösung: Video stumm nur Videospuren, Ton über verstecktes &lt;audio&gt;.
 */
function ensureRemoteAudioElement(tile) {
  let audioEl = tile.querySelector('audio.video-tile__remote-audio');
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.className = 'video-tile__remote-audio';
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', '');
    audioEl.style.display = 'none';
    audioEl.setAttribute('aria-hidden', 'true');
    tile.appendChild(audioEl);
  }
  return audioEl;
}

export function applyStreamToMedia(mediaEl, stream, hasVideo, vol, outputDeviceId, opts = {}) {
  const { isLocal = true, tile = null } = opts;

  if (!isLocal && tile && stream) {
    const vTracks = stream.getVideoTracks?.() ?? [];
    const aTracks = stream.getAudioTracks?.() ?? [];
    /**
     * Split nur von den Tracks abhängig — nicht von hasVideo (UI/Signalisierung).
     * hasVideo kann kurz false sein, obwohl Consumer-Video schon existiert → sonst Audio-only-Zweig
     * und schwarze Kachel (Video-Spur wird verworfen).
     */
    const wantSplit = vTracks.length > 0 && aTracks.length > 0;

    if (wantSplit) {
      const audioEl = ensureRemoteAudioElement(tile);
      mediaEl.muted = true;
      mediaEl.srcObject = new MediaStream(vTracks);
      audioEl.volume = Math.min(1, vol / 100);
      audioEl.srcObject = new MediaStream(aTracks);
      if (outputDeviceId && audioEl.setSinkId) audioEl.setSinkId(outputDeviceId).catch(() => {});
      const tryPlay = () => {
        audioEl.play?.().catch(() => {});
        mediaEl.play?.().catch(() => {});
      };
      tryPlay();
      /* Consumer-Video startet oft kurz als muted — erstes Frame nach unmute */
      for (const tr of vTracks) {
        tr.addEventListener('unmute', tryPlay, { once: true });
      }
      return;
    }
    /* Kein Split: ein Element — verstecktes Audio nicht doppelt abspielen */
    const hidden = tile.querySelector('audio.video-tile__remote-audio');
    if (hidden) {
      hidden.srcObject = null;
      hidden.remove();
    }
  }

  if (!mediaEl.muted) mediaEl.volume = Math.min(1, vol / 100);

  const vCount = stream?.getVideoTracks?.()?.length ?? 0;
  const showVideo = Boolean(hasVideo || vCount > 0);
  const targetStream = showVideo
    ? stream
    : (stream ? new MediaStream(stream.getAudioTracks?.() ?? []) : null);

  if (mediaEl.srcObject !== targetStream || (showVideo && targetStream)) {
    if (mediaEl.srcObject === targetStream && showVideo) {
      mediaEl.srcObject = null;
    }
    mediaEl.srcObject = targetStream;
  }

  if (outputDeviceId && mediaEl.setSinkId) mediaEl.setSinkId(outputDeviceId).catch(() => {});
  mediaEl.play?.().catch(() => {});
}
