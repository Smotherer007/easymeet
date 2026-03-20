import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import { getCustomBackgrounds } from './storage/customBackgroundStorage.js';
import { categoryMaskToImageData, drawPersonWithMask, drawBlurBackground } from './backgroundEffectsHelpers.js';

let imageSegmenter = null;

async function getImageSegmenter() {
  if (imageSegmenter) return imageSegmenter;

  const wasmPath = new URL('/mediapipe/wasm', window.location.origin).href;
  const vision = await FilesetResolver.forVisionTasks(wasmPath);

  imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: new URL('/mediapipe/models/selfie_multiclass_256x256.tflite', window.location.origin).href,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });

  return imageSegmenter;
}

/**
 * Preloads the MediaPipe model in the background (blur/virtual background).
 * Should be called early so opening settings does not require waiting.
 */
export function preloadBackgroundEffectsModel() {
  if (!isInsertableStreamsSupported()) return;
  getImageSegmenter().catch(() => {});
}

/**
 * Preloads all background images in the background (browser cache).
 * Should be called early so selecting a background does not require waiting.
 */
export function preloadBackgroundImages() {
  const urls = BACKGROUND_IMAGES.map((bg) =>
    bg.url.startsWith('/') ? new URL(bg.url, window.location.origin).href : bg.url
  );
  const customResult = getCustomBackgrounds();
  const customUrls = customResult.success ? customResult.data.map((bg) => bg.url) : [];
  [...urls, ...customUrls].forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

/**
 * Checks whether Insertable Streams are supported.
 */
export function isInsertableStreamsSupported() {
  return (
    typeof MediaStreamTrackProcessor !== 'undefined' &&
    typeof MediaStreamTrackGenerator !== 'undefined'
  );
}

/**
 * Creates a stream with background blur via Insertable Streams.
 * @param {MediaStream} sourceStream
 * @param {Object} options
 * @param {number} [options.blurAmount=15]
 * @returns {Promise<{ stream: MediaStream; stop: () => void }>}
 */
export async function createBlurredStream(sourceStream, options = {}) {
  const { blurAmount = 15 } = options;
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track');
  const clonedTrack = videoTrack.clone();

  const segmenter = await getImageSegmenter();
  const canvas = new OffscreenCanvas(640, 480);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const blurCanvas = new OffscreenCanvas(640, 480);
  const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
  const personCanvas = new OffscreenCanvas(640, 480);
  const personCtx = personCanvas.getContext('2d', { willReadFrequently: true });
  const maskCanvas = new OffscreenCanvas(640, 480);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

  let lastMaskImageData = null;
  let segmentTimestamp = 0;
  let frameCount = 0;
  const SEGMENT_EVERY_N_FRAMES = 3; // Segment every Nth frame to reduce load

  const trackProcessor = new MediaStreamTrackProcessor({ track: clonedTrack });
  const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });

  let stopped = false;
  let isProcessingAI = false;

  const transformer = new TransformStream({
    async transform(videoFrame, controller) {
      if (stopped) { videoFrame.close(); return; }
      const w = videoFrame.displayWidth || videoFrame.width;
      const h = videoFrame.displayHeight || videoFrame.height;
      if (w <= 0 || h <= 0) {
        videoFrame.close();
        return;
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        blurCanvas.width = w;
        blurCanvas.height = h;
        personCanvas.width = w;
        personCanvas.height = h;
        maskCanvas.width = w;
        maskCanvas.height = h;
      }
      
      const ts = videoFrame.timestamp;
      frameCount += 1;

      try {
        const shouldSegment = !isProcessingAI && (frameCount % SEGMENT_EVERY_N_FRAMES === 0);
        if (shouldSegment) {
          isProcessingAI = true;
          segmentTimestamp = Math.max(segmentTimestamp + 1, Math.floor(performance.now()));
          
          blurCtx.drawImage(videoFrame, 0, 0, w, h);
          const iData = blurCtx.getImageData(0, 0, w, h);
          
          segmenter.segmentForVideo(iData, segmentTimestamp, (result) => {
            if (stopped) return;
            if (result.categoryMask) {
              const maskArray = result.categoryMask.getAsUint8Array();
              const mw = result.categoryMask.width;
              const mh = result.categoryMask.height;
              
              if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
                maskCanvas.width = mw;
                maskCanvas.height = mh;
              }
              
              if (!lastMaskImageData || lastMaskImageData.width !== mw || lastMaskImageData.height !== mh) {
                lastMaskImageData = new ImageData(mw, mh);
              }
              const data = lastMaskImageData.data;
              for (let i = 0; i < maskArray.length; i++) {
                const alpha = (maskArray[i] === 0) ? 0 : 255;
                const c = i * 4;
                data[c] = 255;
                data[c + 1] = 255;
                data[c + 2] = 255;
                data[c + 3] = alpha;
              }
            }
            isProcessingAI = false;
          });
        }

        if (!lastMaskImageData) {
          ctx.save();
          ctx.drawImage(videoFrame, 0, 0, w, h);
          ctx.restore();
          
          videoFrame.close();
          controller.enqueue(new VideoFrame(canvas, { timestamp: ts }));
          return;
        }

        ctx.save();
        ctx.clearRect(0, 0, w, h);

        drawBlurBackground(blurCtx, videoFrame, w, h, blurAmount);
        drawPersonWithMask(personCtx, maskCtx, maskCanvas, videoFrame, lastMaskImageData, w, h);

        // Draw both layers (blur background + person) onto the final canvas.
        ctx.save();
        ctx.drawImage(blurCanvas, 0, 0, w, h);
        ctx.drawImage(personCanvas, 0, 0, w, h);
        ctx.restore();

        ctx.restore();

        const newFrame = new VideoFrame(canvas, { timestamp: ts });
        controller.enqueue(newFrame);
        videoFrame.close();
      } catch (err) {
        console.warn('Background blur frame error:', err);
        videoFrame.close();
      }
    },
  });

  const pipeAbort = new AbortController();
  void trackProcessor.readable
    .pipeThrough(transformer)
    .pipeTo(trackGenerator.writable, { signal: pipeAbort.signal })
    .catch(() => { /* aborted or track ended */ });

  const processedStream = new MediaStream();
  processedStream.addTrack(trackGenerator);

  return {
    stream: processedStream,
    stop: () => {
      stopped = true;
      clonedTrack.stop();
      pipeAbort.abort();
    },
  };
}

/**
 * Creates a stream with virtual background (image).
 * @param {MediaStream} sourceStream
 * @param {string} imageUrl - URL of the background image
 * @returns {Promise<{ stream: MediaStream; stop: () => void }>}
 */
export async function createVirtualBackgroundStream(sourceStream, imageUrl) {
  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track');
  const clonedTrack = videoTrack.clone();

  const bgImage = new Image();
  bgImage.crossOrigin = 'anonymous';
  const fullUrl = imageUrl.startsWith('/') ? new URL(imageUrl, window.location.origin).href : imageUrl;
  await new Promise((resolve, reject) => {
    bgImage.onload = resolve;
    bgImage.onerror = () => reject(new Error('Background image could not be loaded'));
    bgImage.src = fullUrl;
  });

  const segmenter = await getImageSegmenter();
  const canvas = new OffscreenCanvas(640, 480);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const personCanvas = new OffscreenCanvas(640, 480);
  const personCtx = personCanvas.getContext('2d', { willReadFrequently: true });
  const tempCtx = new OffscreenCanvas(640, 480).getContext('2d', { willReadFrequently: true });
  const maskCanvas = new OffscreenCanvas(640, 480);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

  let lastMaskImageData = null;
  let segmentTimestamp = 0;
  let frameCount = 0;
  const SEGMENT_EVERY_N_FRAMES = 3;

  const trackProcessor = new MediaStreamTrackProcessor({ track: clonedTrack });
  const trackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });

  let stopped = false;
  let isProcessingAI = false;

  const transformer = new TransformStream({
    async transform(videoFrame, controller) {
      if (stopped) { videoFrame.close(); return; }
      const w = videoFrame.displayWidth || videoFrame.width;
      const h = videoFrame.displayHeight || videoFrame.height;
      if (w <= 0 || h <= 0) {
        videoFrame.close();
        return;
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        personCanvas.width = w;
        personCanvas.height = h;
        tempCtx.canvas.width = w;
        tempCtx.canvas.height = h;
        maskCanvas.width = w;
        maskCanvas.height = h;
      }
      
      const ts = videoFrame.timestamp;
      frameCount += 1;

      try {
        const shouldSegment = !isProcessingAI && (frameCount % SEGMENT_EVERY_N_FRAMES === 0);
        if (shouldSegment) {
          isProcessingAI = true;
          segmentTimestamp = Math.max(segmentTimestamp + 1, Math.floor(performance.now()));
          tempCtx.drawImage(videoFrame, 0, 0, w, h);
          const iData = tempCtx.getImageData(0, 0, w, h);

          segmenter.segmentForVideo(iData, segmentTimestamp, (result) => {
            if (stopped) return;
            const newMask = categoryMaskToImageData(result);
            if (newMask) {
              if (maskCanvas.width !== newMask.width || maskCanvas.height !== newMask.height) {
                maskCanvas.width = newMask.width;
                maskCanvas.height = newMask.height;
              }
              lastMaskImageData = newMask;
            }
            isProcessingAI = false;
          });
        }

        if (!lastMaskImageData) {
          ctx.save();
          ctx.drawImage(videoFrame, 0, 0, w, h);
          ctx.restore();

          videoFrame.close();
          controller.enqueue(new VideoFrame(canvas, { timestamp: ts }));
          return;
        }

        ctx.save();
        ctx.clearRect(0, 0, w, h);
        
        ctx.drawImage(bgImage, 0, 0, w, h);
        drawPersonWithMask(personCtx, maskCtx, maskCanvas, videoFrame, lastMaskImageData, w, h);

        // Draw the segmented person over the background.
        ctx.save();
        ctx.drawImage(personCanvas, 0, 0, w, h);
        ctx.restore();

        ctx.restore();

        controller.enqueue(new VideoFrame(canvas, { timestamp: ts }));
        videoFrame.close();
      } catch (err) {
        console.warn('Virtual background frame error:', err);
        videoFrame.close();
      }
    },
  });

  const pipeAbort = new AbortController();
  void trackProcessor.readable
    .pipeThrough(transformer)
    .pipeTo(trackGenerator.writable, { signal: pipeAbort.signal })
    .catch(() => { /* aborted or track ended */ });

  const processedStream = new MediaStream();
  processedStream.addTrack(trackGenerator);

  return {
    stream: processedStream,
    stop: () => {
      stopped = true;
      clonedTrack.stop();
      pipeAbort.abort();
    },
  };
}

/** Funny background images (tactiq.io/learn/funny-ms-teams-background) */
export const BACKGROUND_IMAGES = [
  { id: 'the-it-crowd-office', url: '/backgrounds/the-it-crowd-office.png', labelKey: 'backgroundItCrowdOffice' },
  { id: 'super-mario-world', url: '/backgrounds/super-mario-world.png', labelKey: 'backgroundSuperMarioWorld' },
  { id: 'inside-out-control-room', url: '/backgrounds/inside-out-control-room.png', labelKey: 'backgroundInsideOutControlRoom' },
  { id: 'the-matrix-code', url: '/backgrounds/the-matrix-code.jpg', labelKey: 'backgroundMatrixCode' },
  { id: 'jurassic-park-jungle', url: '/backgrounds/jurassic-park-jungle.png', labelKey: 'backgroundJurassicPark' },
  { id: 'pulp-fiction-coffee-scene', url: '/backgrounds/pulp-fiction-coffee-scene.png', labelKey: 'backgroundPulpFiction' },
  { id: 'blues-clues-living-room', url: '/backgrounds/blues-clues-living-room.png', labelKey: 'backgroundBluesClues' },
  { id: 'breaking-bad-rv-interior', url: '/backgrounds/breaking-bad-rv-interior.png', labelKey: 'backgroundBreakingBad' },
  { id: 'finding-nemo-underwater-home', url: '/backgrounds/finding-nemo-underwater-home.png', labelKey: 'backgroundFindingNemo' },
  { id: 'the-simpsons-couch', url: '/backgrounds/the-simpsons-couch.png', labelKey: 'backgroundSimpsonsCouch' },
  { id: 'the-office-michael-scott', url: '/backgrounds/the-office-michael-scott.png', labelKey: 'backgroundOfficeMichaelScott' },
  { id: 'et-bike-basket', url: '/backgrounds/et-bike-basket.png', labelKey: 'backgroundEtBikeBasket' },
  { id: 'family-guy-stewie-bedroom', url: '/backgrounds/family-guy-stewie-bedroom.png', labelKey: 'backgroundFamilyGuyStewie' },
  { id: 'white-house-briefing-room', url: '/backgrounds/white-house-briefing-room.png', labelKey: 'backgroundWhiteHouseBriefing' },
  { id: 'modern-family-living-room', url: '/backgrounds/modern-family-living-room.png', labelKey: 'backgroundModernFamily' },
  { id: 'baby-yoda-mandalorian', url: '/backgrounds/baby-yoda-mandalorian.png', labelKey: 'backgroundBabyYoda' },
  { id: 'indiana-jones-boulder', url: '/backgrounds/indiana-jones-boulder.png', labelKey: 'backgroundIndianaJones' },
  { id: 'distracted-boyfriend-meme', url: '/backgrounds/distracted-boyfriend-meme.png', labelKey: 'backgroundDistractedBoyfriend' },
  { id: 'bobs-burgers-restaurant', url: '/backgrounds/bobs-burgers-restaurant.png', labelKey: 'backgroundBobsBurgers' },
  { id: 'skyrim', url: '/backgrounds/skyrim.png', labelKey: 'backgroundSkyrim' },
  { id: '2001-space-odyssey-hallway', url: '/backgrounds/2001-space-odyssey-hallway.jpg', labelKey: 'background2001SpaceOdyssey' },
  { id: 'stranger-things-scoops-ahoy', url: '/backgrounds/stranger-things-scoops-ahoy.jpg', labelKey: 'backgroundStrangerThings' },
  { id: 'cosmopolitan-magazine-cover', url: '/backgrounds/cosmopolitan-magazine-cover.png', labelKey: 'backgroundCosmopolitan' },
  { id: 'mgm-logo', url: '/backgrounds/mgm-logo.png', labelKey: 'backgroundMgmLogo' },
  { id: 'team-sonic-racing', url: '/backgrounds/team-sonic-racing.png', labelKey: 'backgroundTeamSonicRacing' },
];

/**
 * Checks whether background effects are available.
 */
export function isSupported() {
  return isInsertableStreamsSupported();
}
