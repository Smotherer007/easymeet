/**
 * Effect: Media / Background effects.
 * Isolates local stream manipulations from domain logic.
 */

import { getState, patchState } from '../../store/index.js';
import {
  selectLocalStream,
  selectBaseLocalStream,
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
export async function applyEffectToCallStream(
  effect,
  app,
  attachRemoteAudio,
  updateVoipParticipants,
  updateEffectTilesSelection,
  getStreamForPeerId,
  getStreamForScreenShare,
  navigate
) {
  const s = getState();
  const videoTrack = selectBaseLocalStream(s)?.getVideoTracks?.()[0];
  if (!videoTrack) return;
  if (s.backgroundEffectStop) {
    try { s.backgroundEffectStop(); } catch (_) { /* Stream may be locked */ }
    patchState({ backgroundEffectStop: null });
    await new Promise((r) => setTimeout(r, 30));
  }
  const oldVideoTracks = selectLocalStream(s)?.getVideoTracks?.() ?? [];
  const baseVideoTrack = selectBaseLocalStream(s)?.getVideoTracks?.()[0];
  const stopOldTracks = () => {
    oldVideoTracks.forEach((t) => { if (t !== baseVideoTrack) t.stop(); });
  };

  try {
    if (effect === 'blur' && isBackgroundEffectsSupported()) {
      const baseStream = selectBaseLocalStream(s);
      const { stream, stop } = await createBlurredStream(baseStream, { blurAmount: 15 });
      const audioTracks = baseStream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      patchState({ localStream: new MediaStream([...audioTracks, ...videoTracks]), backgroundEffectStop: stop });
    } else if (effect && effect !== 'none' && isBackgroundEffectsSupported()) {
      const baseStream = selectBaseLocalStream(s);
      const customResult = getCustomBackgrounds();
      const allBackgrounds = [...BACKGROUND_IMAGES, ...(customResult.success ? customResult.data : [])];
      const bg = allBackgrounds.find((b) => b.id === effect);
      if (bg?.url) {
        const { stream, stop } = await createVirtualBackgroundStream(baseStream, bg.url);
        const audioTracks = baseStream.getAudioTracks();
        const videoTracks = stream.getVideoTracks();
        patchState({ localStream: new MediaStream([...audioTracks, ...videoTracks]), backgroundEffectStop: stop });
      } else {
        patchState({ localStream: baseStream });
      }
    } else {
      patchState({ localStream: selectBaseLocalStream(s) });
    }
  } catch (err) {
    console.error('Hintergrund-Effekt fehlgeschlagen:', err);
    patchState({ backgroundEffect: 'none', localStream: selectBaseLocalStream(s) });
    updateEffectTilesSelection(app, 'none');
    stopOldTracks();
    const peerId = selectMyPeerId(s);
    if (peerId) attachRemoteAudio(peerId, selectLocalStream(getState()));
    return;
  }

  stopOldTracks();
  const localStream = selectLocalStream(getState());
  localStream.getAudioTracks().forEach((t) => { t.enabled = !selectIsMuted(s); });
  localStream.getVideoTracks().forEach((t) => { t.enabled = selectIsVideoEnabled(s) ?? true; });
  selectHostPeer(s)?.updateLocalStream?.(localStream);
  selectViewerConn(s)?.updateLocalStream?.(localStream);
  const peerId = selectMyPeerId(s);
  if (peerId) {
    attachRemoteAudio(peerId, localStream);
    const hostPeer = selectHostPeer(s);
    if (hostPeer) hostPeer.broadcastBackgroundEffect?.(peerId, effect);
    else selectViewerConn(s)?.sendBackgroundEffect?.(effect);
  }
  if (selectScreen(s) === 'room-view') {
    navigate('room-view');
    updateVoipParticipants(app, selectVoipMembers(s), selectMyPeerId(s), selectIsMuted(s), selectScreenStreams(s), getStreamForPeerId, getStreamForScreenShare, selectPeerMuteState(s), selectPeerVolume(s), selectBackgroundEffect(s), selectPeerVideoState(s), selectIsVideoEnabled(s), selectPeerBackgroundEffect(s));
  }
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
