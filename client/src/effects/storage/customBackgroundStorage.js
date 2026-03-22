/**
 * Custom backgrounds – temporary backgrounds in localStorage.
 * Max 5 backgrounds, ~500KB each (respect localStorage limit).
 */

import { ok, err } from '../../shared/result.js';
import { CUSTOM_BACKGROUNDS_STORAGE } from '../../shared/constants.js';

const MAX_CUSTOM_BACKGROUNDS = 5;
const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500KB per image
const MAX_DIMENSION = 640;

/**
 * @returns {import('../../shared/result.js').Result<Array<{ id: string; url: string; label: string }>>}
 */
export function getCustomBackgrounds() {
  try {
    const raw = localStorage.getItem(CUSTOM_BACKGROUNDS_STORAGE);
    if (!raw) return ok([]);
    const parsed = JSON.parse(raw);
    return ok(Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return err('STORAGE', 'Custom backgrounds could not be read', e);
  }
}

/**
 * @param {Array<{ id: string; url: string; label: string }>} list
 * @returns {import('../../shared/result.js').Result<void>}
 */
function saveCustomBackgrounds(list) {
  try {
    localStorage.setItem(CUSTOM_BACKGROUNDS_STORAGE, JSON.stringify(list));
    return ok(undefined);
  } catch (e) {
    return err('STORAGE', 'Custom backgrounds could not be saved', e);
  }
}

/**
 * Compresses image via canvas (max 640px, JPEG 0.8).
 * @param {File} file
 * @returns {Promise<import('../../shared/result.js').Result<string>>}
 */
async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(err('IMAGE', 'Canvas not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      if (dataUrl.length > MAX_IMAGE_SIZE_BYTES * 1.4) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      }
      resolve(ok(dataUrl));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(err('IMAGE', 'Image could not be loaded'));
    };
    img.src = url;
  });
}

/**
 * @param {File} file
 * @param {string} [label]
 * @returns {Promise<import('../../shared/result.js').Result<{ id: string; url: string; label: string }>>}
 */
export async function addCustomBackground(file, label) {
  const listResult = getCustomBackgrounds();
  if (!listResult.success) return listResult;
  const list = listResult.data;
  if (list.length >= MAX_CUSTOM_BACKGROUNDS) {
    return err('VALIDATION', 'Maximum 5 custom backgrounds allowed');
  }
  const compressResult = await compressImage(file);
  if (!compressResult.success) return compressResult;
  const dataUrl = compressResult.data;
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    url: dataUrl,
    label: label || file.name || 'Eigener Hintergrund',
  };
  list.push(entry);
  const saveResult = saveCustomBackgrounds(list);
  if (!saveResult.success) return saveResult;
  return ok(entry);
}

/**
 * @param {string} id
 * @returns {import('../../shared/result.js').Result<void>}
 */
export function removeCustomBackground(id) {
  const listResult = getCustomBackgrounds();
  if (!listResult.success) return listResult;
  const list = listResult.data.filter((b) => b.id !== id);
  return saveCustomBackgrounds(list);
}
