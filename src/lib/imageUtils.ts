/**
 * Image compression and Firebase Storage upload utilities
 * for plant photo diary, knowledge articles, and community works.
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Compress an image (data URL) to target max dimension and quality.
 * Returns a Blob ready for upload.
 */
export async function compressImage(
  dataUrl: string,
  maxDimension = 1200,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

/**
 * Generate a thumbnail from a data URL.
 */
export async function createThumbnail(
  dataUrl: string,
  maxDimension = 300,
  quality = 0.6
): Promise<Blob> {
  return compressImage(dataUrl, maxDimension, quality);
}

/**
 * Upload an image to Firebase Storage and return the download URL.
 * @param path Storage path, e.g. "plant_diaries/userId/plantId/photo_123.jpg"
 * @param dataUrl The base64 data URL of the image
 * @param makeThumbnail Whether to also upload a thumbnail
 * @returns Object with url (and optionally thumbnailUrl)
 */
export async function uploadImage(
  path: string,
  dataUrl: string,
  makeThumbnail = true
): Promise<{ url: string; thumbnailUrl?: string }> {
  // Compress and upload main image
  const blob = await compressImage(dataUrl, 1200, 0.8);
  const mainRef = ref(storage, path);
  await uploadBytes(mainRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(mainRef);

  let thumbnailUrl: string | undefined;
  if (makeThumbnail) {
    const thumbBlob = await createThumbnail(dataUrl, 300, 0.6);
    const thumbPath = path.replace(/(\.[^.]+)$/, '_thumb$1');
    const thumbRef = ref(storage, thumbPath);
    await uploadBytes(thumbRef, thumbBlob, { contentType: 'image/jpeg' });
    thumbnailUrl = await getDownloadURL(thumbRef);
  }

  return { url, thumbnailUrl };
}

/**
 * Upload multiple images in parallel.
 * Returns array of { url, thumbnailUrl } in the same order.
 */
export async function uploadImages(
  basePath: string,
  dataUrls: string[]
): Promise<{ url: string; thumbnailUrl?: string }[]> {
  const timestamp = Date.now();
  return Promise.all(
    dataUrls.map((dataUrl, i) =>
      uploadImage(`${basePath}/photo_${timestamp}_${i}.jpg`, dataUrl)
    )
  );
}

/**
 * Convert a data URL to a displayable image src.
 * If it's already a URL (https://), returns as-is.
 */
export function toImageSrc(urlOrDataUrl: string): string {
  return urlOrDataUrl;
}
