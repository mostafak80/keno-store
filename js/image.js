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
     * Compresses and resizes an image file to fit within TARGET_WIDTH x TARGET_HEIGHT.
     * Generates an optimized WebP or JPEG Data URL (< 35 KB).
     * @param {File} file
     * @returns {Promise<string>} Data URL of compressed image
     */
    async compressAndResize(file) {
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('تعذّر قراءة ملف الصورة.'));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error('الملف ليس صورة صالحة أو تالف.'));
          img.onload = () => {
            try {
              let width = img.naturalWidth || img.width;
              let height = img.naturalHeight || img.height;

              // Calculate bounding box preserving aspect ratio
              if (width > TARGET_WIDTH || height > TARGET_HEIGHT) {
                const ratio = Math.min(TARGET_WIDTH / width, TARGET_HEIGHT / height);
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

              // Smooth downscaling
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, width, height);

              // Try WebP first, fallback to JPEG
              let dataUrl = canvas.toDataURL('image/webp', COMPRESSION_QUALITY);
              if (!dataUrl.startsWith('data:image/webp')) {
                dataUrl = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
              }

              // Safety check: ensure compressed data URL is compact (< 60 KB)
              if (dataUrl.length > 80000) {
                // Secondary pass with higher compression if still large
                dataUrl = canvas.toDataURL('image/jpeg', 0.65);
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
