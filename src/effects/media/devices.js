/**
 * Effect: Media / Background effects.
 * Isolates local stream manipulations from domain logic.
 */

import { getState, patchState } from '../../store/index.js';
import {
  selectLocalStream,
  selectBaseLocalStream,
  selectCameraVideoTrackForEffects,
  selectIsMuted,
  selectIsVideoEnabled,
  selectScreen,
  selectVoipMembers,
  selectMyPeerId,
  selectScreenStreams,
  selectPeerMuteState,
  selectPeerVolume,
  selectBackgroundEffect,
  selectPeerVideoState,
  selectPeerBackgroundEffect,
  selectHostPeer,
  selectViewerConn,
  selectInputDeviceId,
  selectVideoDeviceId,
  selectHasVideoSupport,
  selectFirstLiveDeviceVideoTrackFromStreams,
} from '../../domain/selectors/index.js';
import {
  createBlurredStream,
  createVirtualBackgroundStream,
  isSupported as isBackgroundEffectsSupported,
  BACKGROUND_IMAGES,
} from '../../effects/backgroundEffects.js';
import { getCustomBackgrounds } from '../storage/customBackgroundStorage.js';
import { readDeviceIds, writeDeviceId } from '../storage/deviceStorage.js';
import { DEVICE_STORAGE } from '../../shared/constants.js';
import * as peer from '../network/mediasoupClient.js';
import { startSpeakingIndicator, stopSpeakingIndicator } from '../../speaking-indicator.js';
import { mediaDebugLog, mediaDebugStreamInfo, mediaDebugTrackInfo } from '../../utils/mediaDebug.js';

/** Serielle Ausführung: schnelles mehrfaches Umschalten darf nicht parallel laufen (sonst bricht die Insertable-Streams-Pipe). */
let _applyEffectTail = Promise.resolve();

/**
 * Wendet Hintergrund-Effekte an und aktualisiert den lokalen Stream.
 * (I/O & Side-Effect Schwer - Layer 4)
 * @param {string} effect
 * @param {HTMLElement} app
 * @param {Function} attachRemoteAudio
 * @param {Function} updateVoipParticipants
 * @param {Function} updateEffectTilesSelection
 * @param {Function} getStreamForPeerId
 * @param {Function} getStreamForScreenShare
 * @param {Function} navigate
 */
export function applyEffectToCallStream(
  effect,
  app,
  attachRemoteAudio,
  updateVoipParticipants,
  updateEffectTilesSelection,
  getStreamForPeerId,
  getStreamForScreenShare,
  navigate
) {
  const p = _applyEffectTail.then(() =>
    applyEffectToCallStreamInternal(
      effect,
      app,
      attachRemoteAudio,
      updateVoipParticipants,
      updateEffectTilesSelection,
      getStreamForPeerId,
      getStreamForScreenShare,
      navigate
    )
  );
  _applyEffectTail = p.catch((err) => {
    console.error('[easymeet] applyEffectToCallStream fehlgeschlagen:', err);
    mediaDebugLog('effect:call:promise-reject', {
      message: err?.message,
      name: err?.name,
      stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 8).join('\n') : undefined,
    });
  });
  return p;
}

/** Bevorzugt echte Kamera-Spur (deviceId), sonst jede live-Video-Spur (ohne deviceId in manchen Browsern). */
function firstLiveCameraLikeVideoTrack(stream) {
  const live = [...(stream?.getVideoTracks?.() ?? [])].filter((t) => t && t.readyState === 'live');
  const withDevice = live.find((t) => t.getSettings?.()?.deviceId);
  return withDevice || live[0] || null;
}

/**
 * Keine live-Kamera in State, UI will aber Video → Kamera neu beziehen (z. B. Roh-Spur nach Effekt-Stop in Chromium beendet).
 */
/**
 * Nach kaputtem Effekt-Wechsel: Kamera neu verdrahten und lokale Kachel aktualisieren.
 * (Export für `handleBackgroundEffectChange`, wenn kein Video-Track mehr im State ist.)
 */
export async function recoverCameraAfterEffectLoss(app, attachRemoteAudioFn) {
  await ensureCameraTrackWhenVideoEnabled();
  const peerId = selectMyPeerId(getState());
  const stream = selectLocalStream(getState());
  if (peerId && stream && typeof attachRemoteAudioFn === 'function') {
    attachRemoteAudioFn(peerId, stream, app);
  }
}

async function ensureCameraTrackWhenVideoEnabled() {
  const st = getState();
  if (!selectIsVideoEnabled(st)) return;
  const live = selectFirstLiveDeviceVideoTrackFromStreams(selectBaseLocalStream(st), selectLocalStream(st));
  if (live && live.readyState === 'live') return;

  try {
    const inputId = selectInputDeviceId(st) || undefined;
    const videoId = selectVideoDeviceId(st) || undefined;
    const stream = await peer.getUserMediaResilient(inputId, 'videoOnly', videoId);
    const vt = stream.getVideoTracks?.()?.[0];
    stream.getAudioTracks?.().forEach((t) => t.stop());
    if (!vt || vt.readyState === 'ended') return;

    const audios = [...(selectLocalStream(st)?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== 'ended');
    const repaired = new MediaStream([...audios, vt]);
    vt.enabled = selectIsVideoEnabled(st) ?? true;
    const vDev = vt.getSettings?.()?.deviceId || videoId || null;
    patchState({
      baseLocalStream: new MediaStream([vt]),
      localStream: repaired,
      ...(vDev ? { videoDeviceId: vDev } : {}),
    });
    if (vDev) writeDeviceId(DEVICE_STORAGE.video, vDev);

    const participant = selectHostPeer(getState()) || selectViewerConn(getState());
    try {
      await participant?.updateLocalStream?.(repaired);
    } catch (e) {
      console.warn('[easymeet] updateLocalStream nach Kamera-Neubezug:', e?.message || e);
    }
    mediaDebugLog('effect:camera-reacquired', { track: mediaDebugTrackInfo(vt) });
  } catch (e) {
    console.warn('[easymeet] Kamera neu beziehen (Effekt) fehlgeschlagen:', e?.message || e);
    mediaDebugLog('effect:camera-reacquire-failed', { error: e?.message || String(e) });
  }
}

/** Effekt aus: Audio von local + Roh aus base (Vertrag bei aktivem Effekt), sonst live-Video (Kamera vor Generator). */
function buildMergedStreamAfterEffectOff() {
  const st = getState();
  const local = selectLocalStream(st);
  const base = selectBaseLocalStream(st);
  const audios = [...(local?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== 'ended');
  let raw = firstLiveCameraLikeVideoTrack(base);
  if (!raw) raw = firstLiveCameraLikeVideoTrack(local);
  const tracks = [...audios];
  if (raw && raw.readyState !== 'ended') tracks.push(raw);
  if (!tracks.length) return local ?? null;
  return new MediaStream(tracks);
}

async function applyEffectToCallStreamInternal(
  effect,
  app,
  attachRemoteAudio,
  updateVoipParticipants,
  updateEffectTilesSelection,
  getStreamForPeerId,
  getStreamForScreenShare,
  navigate
) {
  const turningEffectOff = !effect || effect === 'none';

  let s = getState();
  let camTrack = selectCameraVideoTrackForEffects(s);
  mediaDebugLog('effect:call:start', {
    effect,
    turningEffectOff,
    hadStop: Boolean(s.backgroundEffectStop),
    camForPipeline: mediaDebugTrackInfo(camTrack),
    local: mediaDebugStreamInfo(selectLocalStream(s)),
    base: mediaDebugStreamInfo(selectBaseLocalStream(s)),
    videoEnabled: selectIsVideoEnabled(s),
  });
  /* „Kein Hintergrund“ muss auch laufen, wenn die Generator-Spur nach stop() ended ist — sonst kein Merge, Stream kaputt. */
  if (!turningEffectOff && (!camTrack || camTrack.readyState === 'ended')) {
    if (selectIsVideoEnabled(s)) {
      await ensureCameraTrackWhenVideoEnabled();
      s = getState();
      camTrack = selectCameraVideoTrackForEffects(s);
    }
    if (!turningEffectOff && (!camTrack || camTrack.readyState === 'ended')) {
      mediaDebugLog('effect:call:abort', { reason: 'no-cam-for-pipeline', cam: mediaDebugTrackInfo(camTrack) });
      return;
    }
  }

  if (s.backgroundEffectStop) {
    try {
      s.backgroundEffectStop();
    } catch (_) { /* Stream may be locked */ }
    patchState({ backgroundEffectStop: null });
    await new Promise((r) => setTimeout(r, 100));

    /* Generator ist ended, localStream kann noch tote Video-Spur tragen; Roh-Kamera aus base/local suchen
     * und State + Producer kurz auf Roh setzen — sonst selectCameraVideoTrackForEffects / UI hängen. */
    const stRep = getState();
    const device = selectFirstLiveDeviceVideoTrackFromStreams(
      selectBaseLocalStream(stRep),
      selectLocalStream(stRep)
    );
    if (device && device.readyState === 'live') {
      const audios = [...(selectLocalStream(stRep)?.getAudioTracks?.() ?? [])].filter((t) => t && t.readyState !== 'ended');
      const repaired = new MediaStream([...audios, device]);
      patchState({
        baseLocalStream: new MediaStream([device]),
        localStream: repaired,
      });
      const participant = selectHostPeer(getState()) || selectViewerConn(getState());
      try {
        await participant?.updateLocalStream?.(repaired);
      } catch (e) {
        console.warn('[easymeet] updateLocalStream nach Effekt-Stop/Reparatur:', e?.message || e);
      }
    } else if (selectIsVideoEnabled(stRep)) {
      await ensureCameraTrackWhenVideoEnabled();
    }

    mediaDebugLog('effect:after-prev-stop', {
      local: mediaDebugStreamInfo(selectLocalStream(getState())),
      base: mediaDebugStreamInfo(selectBaseLocalStream(getState())),
      cam: mediaDebugTrackInfo(selectCameraVideoTrackForEffects(getState())),
    });
  }

  s = getState();
  camTrack = selectCameraVideoTrackForEffects(s);
  if (!turningEffectOff && (!camTrack || camTrack.readyState === 'ended')) {
    if (selectIsVideoEnabled(s)) {
      await ensureCameraTrackWhenVideoEnabled();
      s = getState();
      camTrack = selectCameraVideoTrackForEffects(s);
    }
    if (!turningEffectOff && (!camTrack || camTrack.readyState === 'ended')) {
      mediaDebugLog('effect:call:abort', { reason: 'no-cam-after-stop', cam: mediaDebugTrackInfo(camTrack) });
      return;
    }
  }

  /* Snapshots vor await: während createBlurredStream bleibt localStream unverändert → Kachel/Producer behalten Roh-Video.
   * Erst danach ein patchState: base = nur Roh, local = Audio + Generator (Roh wandert in base, nie „nur Audio“). */
  const localPre = selectLocalStream(s);
  const audioTracksSnapshot = [...(localPre?.getAudioTracks?.() ?? [])];
  const rawTrackForBase = selectCameraVideoTrackForEffects(s);
  if (!turningEffectOff && (!rawTrackForBase || rawTrackForBase.readyState === 'ended')) {
    mediaDebugLog('effect:call:abort', { reason: 'no-raw-for-base', raw: mediaDebugTrackInfo(rawTrackForBase) });
    return;
  }

  const oldVideoTracks = [...(localPre?.getVideoTracks?.() ?? [])];
  /** Nur Spuren beenden, die nicht mehr in den aktuellen local/base-Streams vorkommen — nie Roh per t!==protect falsch treffen. */
  const stopOldTracks = () => {
    const st = getState();
    const keep = new Set();
    const add = (stream) => {
      stream?.getVideoTracks?.()?.forEach((t) => keep.add(t));
      stream?.getAudioTracks?.()?.forEach((t) => keep.add(t));
    };
    add(selectLocalStream(st));
    add(selectBaseLocalStream(st));
    oldVideoTracks.forEach((t) => {
      if (!t || keep.has(t) || t.readyState === 'ended') return;
      try {
        t.stop();
      } catch (_) {}
    });
  };

  /**
   * baseLocalStream nur neu setzen, wenn Roh noch nicht allein in base liegt (sonst Roh endlos zwischen Streams schieben).
   * Pipeline-Quelle ist immer `raw.clone()` (resolvePipelineSource).
   */
  const patchEffectResult = (processedStream, stop, rawCanonical) => {
    const genTracks = processedStream.getVideoTracks();
    const st = getState();
    const curBase = selectBaseLocalStream(st);
    const baseIsOnlyRaw =
      curBase &&
      (curBase.getAudioTracks?.()?.length ?? 0) === 0 &&
      curBase.getVideoTracks()?.length === 1 &&
      curBase.getVideoTracks()[0] === rawCanonical &&
      rawCanonical.readyState !== 'ended';

    if (baseIsOnlyRaw) {
      patchState({
        localStream: new MediaStream([...audioTracksSnapshot, ...genTracks]),
        backgroundEffectStop: stop,
      });
    } else {
      patchState({
        baseLocalStream: new MediaStream([rawCanonical]),
        localStream: new MediaStream([...audioTracksSnapshot, ...genTracks]),
        backgroundEffectStop: stop,
      });
    }
  };

  /**
   * Immer dedizierter Klon als Pipeline-Quelle (Cleanup stoppt nur den Klon + innere Kette).
   * Base-Stream direkt zu füttern ließ nach blur→anderer-Hintergrund die Roh-Spur in Chromium oft „weg“ /
   * Selector lieferte null (Logs: video-track:ended auf Kachel, no-cam-after-stop).
   */
  const resolvePipelineSource = () => {
    const st = getState();
    const rawLive = selectCameraVideoTrackForEffects(st);
    if (!rawLive || rawLive.readyState === 'ended') return null;
    try {
      return { stream: new MediaStream([rawLive.clone()]), stopSourceCleanup: true, rawCanonical: rawLive };
    } catch (e) {
      console.warn('[easymeet] Kamera-Spur clone für Effekt fehlgeschlagen:', e?.message || e);
      return null;
    }
  };

  try {
    if (effect === 'blur' && isBackgroundEffectsSupported()) {
      const src = resolvePipelineSource();
      if (!src) {
        mediaDebugLog('effect:call:abort', { reason: 'resolve-pipeline-null', branch: 'blur' });
        return;
      }
      const { stream, stop } = await createBlurredStream(src.stream, {
        blurAmount: 15,
        stopSourceVideoTrackOnCleanup: src.stopSourceCleanup,
      });
      patchEffectResult(stream, stop, src.rawCanonical);
    } else if (effect && effect !== 'none' && isBackgroundEffectsSupported()) {
      const customResult = getCustomBackgrounds();
      const allBackgrounds = [...BACKGROUND_IMAGES, ...(customResult.success ? customResult.data : [])];
      const bg = allBackgrounds.find((b) => b.id === effect);
      if (bg?.url) {
        const src = resolvePipelineSource();
        if (!src) {
          mediaDebugLog('effect:call:abort', { reason: 'resolve-pipeline-null', branch: 'virtual-bg', effectId: effect });
          return;
        }
        const { stream, stop } = await createVirtualBackgroundStream(src.stream, bg.url, {
          stopSourceVideoTrackOnCleanup: src.stopSourceCleanup,
        });
        patchEffectResult(stream, stop, src.rawCanonical);
      } else {
        const merged = buildMergedStreamAfterEffectOff();
        mediaDebugLog('effect:patch:merged', { branch: 'unknown-bg-id', merged: mediaDebugStreamInfo(merged) });
        patchState({
          localStream: merged ?? selectLocalStream(getState()),
          baseLocalStream: merged ?? selectBaseLocalStream(getState()),
          backgroundEffectStop: null,
        });
      }
    } else {
      let merged = buildMergedStreamAfterEffectOff();
      const stOff = getState();
      const hasLiveVideo = merged?.getVideoTracks?.()?.some((t) => t && t.readyState === 'live');
      if (selectIsVideoEnabled(stOff) && !hasLiveVideo) {
        await ensureCameraTrackWhenVideoEnabled();
        merged = buildMergedStreamAfterEffectOff();
      }
      mediaDebugLog('effect:patch:merged', { branch: 'effect-off', merged: mediaDebugStreamInfo(merged) });
      patchState({
        localStream: merged ?? selectLocalStream(getState()),
        baseLocalStream: merged ?? selectBaseLocalStream(getState()),
        backgroundEffectStop: null,
      });
    }
    mediaDebugLog('effect:patch:done', {
      local: mediaDebugStreamInfo(selectLocalStream(getState())),
      base: mediaDebugStreamInfo(selectBaseLocalStream(getState())),
    });
  } catch (err) {
    console.error('Hintergrund-Effekt fehlgeschlagen:', err);
    mediaDebugLog('effect:call:error', { message: err?.message, name: err?.name });
    let merged = buildMergedStreamAfterEffectOff();
    const stErr = getState();
    if (selectIsVideoEnabled(stErr) && !merged?.getVideoTracks?.()?.some((t) => t && t.readyState === 'live')) {
      await ensureCameraTrackWhenVideoEnabled();
      merged = buildMergedStreamAfterEffectOff();
    }
    patchState({
      backgroundEffect: 'none',
      localStream: merged ?? selectBaseLocalStream(getState()),
      baseLocalStream: merged ?? selectBaseLocalStream(getState()),
      backgroundEffectStop: null,
    });
    updateEffectTilesSelection(app, 'none');
    stopOldTracks();
    const peerId = selectMyPeerId(getState());
    if (peerId) attachRemoteAudio(peerId, selectLocalStream(getState()), app);
    return;
  }

  s = getState();
  const localStream = selectLocalStream(s);
  if (!localStream) {
    mediaDebugLog('effect:call:abort', { reason: 'no-local-stream-after-patch' });
    return;
  }

  localStream.getAudioTracks().forEach((t) => {
    t.enabled = !selectIsMuted(s);
  });
  localStream.getVideoTracks().forEach((t) => {
    t.enabled = selectIsVideoEnabled(s) ?? true;
  });

  /* Ein Frame Abstand: alte Insertable-Pipe freigeben, bevor Producer/Webcam neu verdrahtet wird (Chromium). */
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const sMedia = getState();
  localStream.getAudioTracks().forEach((t) => {
    t.enabled = !selectIsMuted(sMedia);
  });
  localStream.getVideoTracks().forEach((t) => {
    t.enabled = selectIsVideoEnabled(sMedia) ?? true;
  });

  const participant = selectHostPeer(sMedia) || selectViewerConn(sMedia);
  mediaDebugLog('effect:before-update-local-stream', {
    participant: Boolean(participant),
    stream: mediaDebugStreamInfo(localStream),
  });
  try {
    await participant?.updateLocalStream?.(localStream);
    mediaDebugLog('effect:after-update-local-stream', { ok: true });
  } catch (e) {
    console.warn('[easymeet] updateLocalStream nach Effektwechsel:', e?.message || e);
    mediaDebugLog('effect:after-update-local-stream', { ok: false, error: e?.message || String(e) });
  }

  stopOldTracks();
  mediaDebugLog('effect:after-stop-old-tracks', {
    local: mediaDebugStreamInfo(selectLocalStream(getState())),
    base: mediaDebugStreamInfo(selectBaseLocalStream(getState())),
  });

  const sAfter = getState();
  const peerId = selectMyPeerId(sAfter);
  const streamForUi = selectLocalStream(sAfter) ?? localStream;
  if (peerId) {
    attachRemoteAudio(peerId, streamForUi, app);
    const hostPeer = selectHostPeer(sAfter);
    if (hostPeer) hostPeer.broadcastBackgroundEffect?.(peerId, effect);
    else selectViewerConn(sAfter)?.sendBackgroundEffect?.(effect);
  }

  const sUi = getState();
  if (selectScreen(sUi) === 'room-view') {
    /* Kein navigate('room-view'): Full-Re-Render bricht Settings-Vorschau + Effekt-Pipeline; VoIP-Update reicht. */
    updateVoipParticipants(
      app,
      selectVoipMembers(sUi),
      selectMyPeerId(sUi),
      selectIsMuted(sUi),
      selectScreenStreams(sUi),
      getStreamForPeerId,
      getStreamForScreenShare,
      selectPeerMuteState(sUi),
      selectPeerVolume(sUi),
      selectBackgroundEffect(sUi),
      selectPeerVideoState(sUi),
      selectIsVideoEnabled(sUi),
      selectPeerBackgroundEffect(sUi)
    );
  }
  updateEffectTilesSelection(app, selectBackgroundEffect(sUi) ?? effect);
  const previewVideo = app.querySelector('#effect-preview-video');
  const settingsModal = app.querySelector('#settings-modal');
  if (previewVideo && settingsModal && !settingsModal.hasAttribute('hidden')) {
    previewVideo.srcObject = null;
    previewVideo.srcObject = selectLocalStream(getState());
    previewVideo.play?.().catch(() => {});
  }
}

/**
 * Re-acquires audio stream when device was switched/removed (e.g. headset change).
 * (I/O & Side-Effect Schwer - Layer 4)
 */
export async function reacquireAudioStreamIfNeeded(app, attachRemoteAudio, setupAudioTrackEndedHandler) {
  const s = getState();
  if (selectScreen(s) !== 'room-view' || !selectLocalStream(s)) return;
  if (selectIsMuted(s)) return; // No audio track needed when muted

  const audioTrack = selectLocalStream(s)?.getAudioTracks?.()[0];
  if (!audioTrack) return;
  if (audioTrack.readyState !== 'ended') {
    const deviceId = audioTrack.getSettings?.()?.deviceId;
    if (deviceId) {
      const { inputs } = await peer.getAudioDevices().catch(() => ({ inputs: [] }));
      if (inputs.some((d) => d.deviceId === deviceId)) return; // Device still present
    } else return;
  }

  try {
    const { inputs } = await peer.getAudioDevices().catch(() => ({ inputs: [] }));
    const inputDeviceId = selectInputDeviceId(s);
    const newDeviceId = inputDeviceId && inputs.some((d) => d.deviceId === inputDeviceId)
      ? inputDeviceId
      : (inputs[0]?.deviceId ?? undefined);
    const newStream = await peer.getUserMediaResilient(
      newDeviceId,
      selectHasVideoSupport(s) ?? false,
      selectVideoDeviceId(s) || undefined
    );
    const newAudioTrack = newStream.getAudioTracks?.()[0];
    const newVideoTrack = newStream.getVideoTracks?.()[0];
    if (!newAudioTrack) return;
    const videoTrack = selectLocalStream(s)?.getVideoTracks?.()[0];
    const tracks = [newAudioTrack];
    if (newVideoTrack) {
      newVideoTrack.enabled = selectIsVideoEnabled(s) ?? false;
      tracks.push(newVideoTrack);
    } else if (videoTrack && videoTrack.readyState !== 'ended') {
      tracks.push(videoTrack);
    }
    const oldStream = selectLocalStream(s);
    const newLocalStream = new MediaStream(tracks);
    newLocalStream.getAudioTracks().forEach((t) => { t.enabled = !selectIsMuted(s); });
    const savedInputDeviceId = newAudioTrack.getSettings?.()?.deviceId || newDeviceId || null;
    patchState({ localStream: newLocalStream, baseLocalStream: newLocalStream, inputDeviceId: savedInputDeviceId });
    if (savedInputDeviceId) writeDeviceId(DEVICE_STORAGE.input, savedInputDeviceId);
    oldStream.getTracks().forEach((t) => {
      if (t === videoTrack && !newVideoTrack) return;
      t.stop();
    });
    selectHostPeer(s)?.updateLocalStream?.(newLocalStream);
    selectViewerConn(s)?.updateLocalStream?.(newLocalStream);
    const peerId = selectMyPeerId(s);
    if (peerId) attachRemoteAudio(peerId, newLocalStream);
    if (selectScreen(s) === 'room-view' && peerId) {
      stopSpeakingIndicator(peerId);
      startSpeakingIndicator(peerId, newLocalStream, app);
    }
    setupAudioTrackEndedHandler(newAudioTrack);
  } catch (err) {
    console.warn('Audio re-acquisition after device change failed:', err);
  }
}
