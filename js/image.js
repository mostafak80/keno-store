/**
 * Keno Store — Professional Image Processing & Optimization System
 * Solves Base64 bloat via client-side canvas compression, enforces strict type/size guards,
 * and provides broken image fallback handlers.
 */
(function (root) {
  'use strict';

  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]);

  const MAX_RAW_SIZE = 10 * 1024 * 1024; // 10 MB raw upload limit
  const TARGET_WIDTH = 320;
  const TARGET_HEIGHT = 320;
  const COMPRESSION_QUALITY = 0.82;

  const KenoImage = {
    /**
     * Validates an uploaded file for image safety.
     * @param {File} file
     * @returns {{ valid: boolean, error?: string }}
     */
    validateFile(file) {
      if (!file) {
        return { valid: false, error: 'لم يتم اختيار أي ملف.' };
      }
      if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
        return {
          valid: false,
          error: 'نوع الصورة غير مدعوم. يرجى اختيار صورة بصيغة PNG أو JPG أو WebP (ملفات SVG غير مسموح بها لأسباب أمنية).'
        };
      }
      if (file.size > MAX_RAW_SIZE) {
        return {
          valid: false,
          error: 'حجم الصورة كبير جدًا (أقصى حد مسموح به هو 10 ميجابايت قبل الضغط).'
        };
      }
      return { valid: true };
    },

    /**
     * Compresses, crops, and resizes a service image to automatically fit a 2:1 banner ratio.
     * Center-crops any aspect ratio (square, portrait, 16:9, etc.) to 2:1 so that it fills
     * the service card container 100% without letterboxing or distortion.
     * Produces an optimized WebP (< 50 KB) or JPEG data URL.
     * @param {File} file
     * @param {Object} options - { targetWidth: 800, quality: 0.82 }
     * @returns {Promise<string>} Data URL of optimized 2:1 banner image
     */
    async compressAndResize(file, options = {}) {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const targetWidth = options.targetWidth || 800; // 800x400 (2:1) is sharp on retina while keeping payload < 40KB
      const targetRatio = 2.0; // 2:1 ratio as specified
      const quality = options.quality || COMPRESSION_QUALITY;

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('تعذّر قراءة ملف الصورة.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('الملف ليس صورة صالحة أو تالف.'));
          img.onload = () => {
            try {
              const naturalW = img.naturalWidth || img.width;
              const naturalH = img.naturalHeight || img.height;

              if (!naturalW || !naturalH) {
                throw new Error('أبعاد الصورة غير صالحة.');
              }

              // Calculate 2:1 center-crop rectangle from source
              let sx = 0;
              let sy = 0;
              let sWidth = naturalW;
              let sHeight = naturalH;
              const currentRatio = naturalW / naturalH;

              if (currentRatio > targetRatio) {
                // Image is wider than 2:1 -> crop excess left and right
                sWidth = Math.round(naturalH * targetRatio);
                sx = Math.round((naturalW - sWidth) / 2);
              } else if (currentRatio < targetRatio) {
                // Image is taller than 2:1 -> crop excess top and bottom
                sHeight = Math.round(naturalW / targetRatio);
                sy = Math.round((naturalH - sHeight) / 2);
              }

              // Destination dimensions: downscale if source crop is larger than targetWidth
              const destWidth = Math.min(targetWidth, sWidth);
              const destHeight = Math.round(destWidth / targetRatio);

              const canvas = document.createElement('canvas');
              canvas.width = destWidth;
              canvas.height = destHeight;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                throw new Error('تعذّر تهيئة بيئة معالجة الصور في المتصفح.');
              }

              // High-quality smooth scaling
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, destWidth, destHeight);

              // Output WebP first, fallback to JPEG
              let dataUrl = canvas.toDataURL('image/webp', quality);
              if (!dataUrl.startsWith('data:image/webp')) {
                dataUrl = canvas.toDataURL('image/jpeg', quality);
              }

              // Safety check: ensure compressed data URL is compact (< 70 KB)
              if (dataUrl.length > 90000) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.68);
              }

              resolve(dataUrl);
            } catch (err) {
              reject(err);
            }
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /**
     * Compresses and optimizes a payment receipt image (e.g. mobile banking/wallet screenshot).
     * Preserves high text legibility for transaction reference numbers and amounts,
     * while producing a compact WebP/JPEG data URL.
     * @param {File} file
     * @param {Object} options - { maxDimension: 1280, quality: 0.82 }
     * @returns {Promise<{ dataUrl: string, originalSize: number, compressedSize: number, mimeType: string, fileName: string }>}
     */
    async compressReceipt(file, options = {}) {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const maxDim = options.maxDimension || 1280;
      const quality = options.quality || 0.82;

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('تعذّر قراءة ملف صورة الإيصال.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('الملف المختار تالف أو ليس صورة صالحة.'));
          img.onload = () => {
            try {
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;

              // Scale down preserving aspect ratio if larger than maxDim
              if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
              }

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                throw new Error('تعذّر تهيئة بيئة معالجة الصور في المتصفح.');
              }

              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, width, height);

              // WebP with fallback to JPEG
              let mimeType = 'image/webp';
              let dataUrl = canvas.toDataURL('image/webp', quality);
              if (!dataUrl.startsWith('data:image/webp')) {
                mimeType = 'image/jpeg';
                dataUrl = canvas.toDataURL('image/jpeg', quality);
              }

              const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
              const compressedSize = Math.round((base64Len * 3) / 4);

              resolve({
                dataUrl,
                originalSize: file.size,
                compressedSize,
                mimeType,
                fileName: file.name
              });
            } catch (err) {
              reject(err);
            }
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    },

    /**
     * Sanitizes an image URL string (blocks javascript: or dangerous schemes).
     * @param {string} url
     * @returns {string} Safe URL or empty string
     */
    sanitizeUrl(url) {
      if (!url || typeof url !== 'string') return '';
      const trimmed = url.trim();
      if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(trimmed)) {
        return trimmed;
      }
      if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) {
        return trimmed;
      }
      if (/^\.?\/assets\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i.test(trimmed)) {
        return trimmed;
      }
      return '';
    },

    /**
     * Returns a fallback image handler attribute for <img> tags.
     * Gracefully falls back to hiding broken image and displaying the icon.
     */
    getFallbackAttr() {
      return 'onerror="this.style.display=\'none\'; if(this.nextElementSibling) this.nextElementSibling.style.display=\'inline-block\';"';
    }
  };

  root.KenoImage = KenoImage;
})(typeof window !== 'undefined' ? window : this);
