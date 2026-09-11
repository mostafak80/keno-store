/**
 * Keno Store — WhatsApp Ordering Engine & Clipboard Utilities
 * Solves single-service and multi-item cart ordering,
 * generates unique order tracking IDs, and handles clipboard fallbacks.
 */
(function (root) {
  'use strict';

  const KenoOrder = {
    /**
     * Generates a unique, short order reference code (e.g. KENO-8421).
     */
    generateOrderCode() {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      return `KENO-${randomNum}`;
    },

    /**
     * Normalizes a phone number to international WhatsApp format without leading + or 00.
     * @param {string} phone
     * @returns {string} Clean digits
     */
    cleanWhatsAppNumber(phone) {
      if (!phone) return '';
      let cleaned = String(phone).replace(/[^\d]/g, '');
      if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
      }
      // Handle Egyptian local format 010... -> 2010... (11 digits starting with 01)
      if (/^01[0125]\d{8}$/.test(cleaned)) {
        cleaned = '2' + cleaned;
      }
      return cleaned;
    },

    /**
     * Validates whether a WhatsApp number contains a plausible international length.
     * @param {string} phone
     * @returns {boolean}
     */
    isValidWhatsAppNumber(phone) {
      const cleaned = this.cleanWhatsAppNumber(phone);
      return Boolean(cleaned && cleaned.length >= 8 && cleaned.length <= 16);
    },

    /**
     * Builds structured WhatsApp order message for a single service & plan.
     */
    buildOrderText(catalog, service, plan, options = {}) {
      const storeName = catalog?.settings?.storeName || 'Keno Store';
      const orderCode = options.orderCode || this.generateOrderCode();

      const serviceName = service?.name || 'خدمة رقمية';
      const planName = plan ? plan.label : (options.quoteDetails && options.quoteDetails.trim() ? options.quoteDetails.trim() : 'خدمة حسب الطلب');
      const totalNum = plan ? Number(plan.price) : 0;
      const totalFormatted = plan ? `${totalNum.toLocaleString('en-US')} جنيه` : 'حسب المواصفات';

      let customerAccount = (options.customerAccount && options.customerAccount.trim())
        ? options.customerAccount.trim()
        : 'سيتم تزويدها في المحادثة';
      if (options.orderNote && options.orderNote.trim()) {
        customerAccount += `\n📝 ملاحظات إضافية: ${options.orderNote.trim()}`;
      }

      const pm = options.paymentMethod;
      const paymentInfo = pm ? `${pm.name}${pm.number ? ` (${pm.number})` : ''}` : 'فودافون كاش / إنستاباي';

      const lines = [
        `مرحبًا ${storeName} 👋`,
        'أرغب في تأكيد طلب جديد عبر الموقع:',
        '',
        `📌 الخدمة: ${serviceName}`,
        `📦 الباقة: ${planName}`,
        `💰 الإجمالي: ${totalFormatted}`,
        '',
        '👤 بيانات العميل والشحن:',
        customerAccount,
        '',
        `💳 طريقة الدفع: ${paymentInfo}`,
        `🔖 كود الطلب: ${orderCode}`,
        '',
        '----------------------------',
        '⚡ سيتم إرسال صورة إيصال التحويل في المحادثة لتأكيد وتنفيذ الطلب فورًا.'
      ];

      return lines.join('\n').normalize('NFC');
    },

    /**
     * Builds structured WhatsApp order message for multiple cart items.
     */
    buildCartOrderText(catalog, cartItems, options = {}) {
      const storeName = catalog?.settings?.storeName || 'Keno Store';
      const orderCode = options.orderCode || this.generateOrderCode();

      let grandTotal = 0;
      const itemsList = (cartItems || []).map((item, index) => {
        const itemPrice = Number(item.plan?.price || 0);
        const qty = Number(item.quantity || 1);
        const itemTotal = itemPrice * qty;
        grandTotal += itemTotal;
        const srvName = item.service?.name || 'خدمة رقمية';
        const plnLabel = item.plan?.label || 'باقة';
        if (qty > 1) {
          return `${index + 1}. ${srvName} — ${plnLabel} (${qty} × ${itemPrice.toLocaleString('en-US')} ج.م = ${itemTotal.toLocaleString('en-US')} ج.م)`;
        }
        return `${index + 1}. ${srvName} — ${plnLabel} (${itemPrice.toLocaleString('en-US')} ج.م)`;
      });

      const totalFormatted = `${Number(grandTotal).toLocaleString('en-US')} ج.م`;

      let customerAccount = (options.customerAccount && options.customerAccount.trim())
        ? options.customerAccount.trim()
        : 'غير محدد (سيتم تزويده في المحادثة)';
      if (options.orderNote && options.orderNote.trim()) {
        customerAccount += `\nملاحظة: ${options.orderNote.trim()}`;
      }

      const pm = options.paymentMethod;
      const paymentInfo = pm ? `${pm.name}${pm.number ? ` (${pm.number})` : ''}` : 'فودافون كاش / إنستاباي';

      const lines = [
        `مرحبًا ${storeName}`,
        '',
        'طلب سلة جديد',
        '',
        `رقم الطلب: ${orderCode}`,
        '',
        'المنتجات المطلوبة:',
        itemsList.join('\n'),
        '',
        `إجمالي الطلب: ${totalFormatted}`,
        '',
        `طريقة الدفع: ${paymentInfo}`,
        '',
        'بيانات الحساب / الشحن:',
        customerAccount,
        '',
        'ملاحظة: سيتم إرسال صورة إثبات التحويل هنا في المحادثة.',
        '',
        'برجاء تأكيد الطلب والبدء في التنفيذ.'
      ];

      return lines.join('\n').normalize('NFC');
    },

    /**
     * Formats WhatsApp URL safely with NFC normalization and standard encodeURIComponent.
     * @param {string} phone
     * @param {string} text
     * @returns {string} https://wa.me/ URL
     */
    formatWhatsAppUrl(phone, text) {
      const whatsappNumber = this.cleanWhatsAppNumber(phone);
      if (!this.isValidWhatsAppNumber(whatsappNumber)) {
        throw new Error('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
      }
      const normalizedText = String(text || '').normalize('NFC');
      const encodedText = encodeURIComponent(normalizedText);
      return `https://wa.me/${whatsappNumber}?text=${encodedText}`;
    },

    /**
     * Builds the complete wa.me URL for a single order.
     */
    buildOrderUrl(catalog, serviceId, planId, options = {}) {
      const service = catalog?.services?.find(s => s.id === serviceId && s.visible);
      if (!service) throw new Error('الخدمة غير متاحة حاليًا.');

      const plan = service.plans?.find(p => p.id === planId && p.available) || null;
      if (service.plans?.length > 0 && !plan) {
        throw new Error('يرجى اختيار باقة متاحة أولًا.');
      }

      const orderText = this.buildOrderText(catalog, service, plan, options);
      return this.formatWhatsAppUrl(catalog?.settings?.whatsapp, orderText);
    },

    /**
     * Builds the complete wa.me URL for cart multi-item checkout.
     */
    buildCartOrderUrl(catalog, cartItems, options = {}) {
      if (!cartItems || cartItems.length === 0) {
        throw new Error('سلة الطلبات فارغة.');
      }

      const orderText = this.buildCartOrderText(catalog, cartItems, options);
      return this.formatWhatsAppUrl(catalog?.settings?.whatsapp, orderText);
    },

    /**
     * Opens WhatsApp safely across mobile browsers (Android Chrome, iPhone Safari)
     * and desktop browsers without triggering popup blockers.
     * @param {string} url - Valid https://wa.me/ URL
     * @returns {boolean} Success status
     */
    openWhatsApp(url) {
      if (!url || typeof url !== 'string' || !url.startsWith('https://wa.me/')) {
        return false;
      }

      try {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth <= 768);
        if (isMobile) {
          // On mobile, window.location.href seamlessly opens the WhatsApp native app without popup blockers
          window.location.href = url;
        } else {
          // On desktop, open in a new tab; fallback to location.href if popup blocked
          const newTab = window.open(url, '_blank', 'noopener,noreferrer');
          if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
            window.location.href = url;
          }
        }
        return true;
      } catch (err) {
        console.error('Failed to open WhatsApp:', err);
        try {
          window.location.href = url;
          return true;
        } catch (_) {
          return false;
        }
      }
    },

    /**
     * Copies text to clipboard with modern API and reliable legacy fallback.
     */
    async copyToClipboard(text) {
      if (!text) return false;
      const normalized = String(text).normalize('NFC');
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(normalized);
          return true;
        }
      } catch (_) {}

      try {
        const textarea = document.createElement('textarea');
        textarea.value = normalized;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        textarea.remove();
        return successful;
      } catch (_) {
        return false;
      }
    }
  };

  /**
   * Keno Store — Orders & Receipts Storage Registry
   * Uses modern browser IndexedDB with transparent fallback to localStorage.
   */
  const KenoOrderStore = {
    DB_NAME: 'keno_orders_db',
    DB_VERSION: 1,
    STORE_NAME: 'orders',
    FALLBACK_KEY: 'keno_orders_history',

    _getDB() {
      if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
      return new Promise(resolve => {
        try {
          const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
          request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(this.STORE_NAME)) {
              const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    },

    async saveOrder(order) {
      if (!order || !order.id) return false;
      const db = await this._getDB();
      if (db) {
        return new Promise(resolve => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.put(order);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(this._saveFallback(order));
          } catch (_) {
            resolve(this._saveFallback(order));
          }
        });
      }
      return this._saveFallback(order);
    },

    async getOrders() {
      const db = await this._getDB();
      if (db) {
        return new Promise(resolve => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
              const list = request.result || [];
              list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
              resolve(list);
            };
            request.onerror = () => resolve(this._getFallback());
          } catch (_) {
            resolve(this._getFallback());
          }
        });
      }
      return this._getFallback();
    },

    async getOrder(id) {
      const db = await this._getDB();
      if (db) {
        return new Promise(resolve => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(this._getOrderFallback(id));
          } catch (_) {
            resolve(this._getOrderFallback(id));
          }
        });
      }
      return this._getOrderFallback(id);
    },

    async updateOrderStatus(id, newStatus) {
      const order = await this.getOrder(id);
      if (!order) return false;
      order.status = newStatus;
      order.updatedAt = Date.now();
      return this.saveOrder(order);
    },

    async deleteOrder(id) {
      const db = await this._getDB();
      if (db) {
        return new Promise(resolve => {
          try {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => {
              this._deleteFallback(id);
              resolve(true);
            };
            tx.onerror = () => {
              this._deleteFallback(id);
              resolve(false);
            };
          } catch (_) {
            this._deleteFallback(id);
            resolve(true);
          }
        });
      }
      return this._deleteFallback(id);
    },

    async clearOrders() {
      const db = await this._getDB();
      if (db) {
        try {
          const tx = db.transaction(this.STORE_NAME, 'readwrite');
          tx.objectStore(this.STORE_NAME).clear();
        } catch (_) {}
      }
      try {
        localStorage.removeItem(this.FALLBACK_KEY);
      } catch (_) {}
      return true;
    },

    _saveFallback(order) {
      try {
        const list = this._getFallback();
        const idx = list.findIndex(o => o.id === order.id);
        if (idx >= 0) list[idx] = order;
        else list.unshift(order);
        const trimmed = list.slice(0, 30);
        localStorage.setItem(this.FALLBACK_KEY, JSON.stringify(trimmed));
        return true;
      } catch (_) {
        return false;
      }
    },

    _getFallback() {
      try {
        const raw = localStorage.getItem(this.FALLBACK_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    },

    _getOrderFallback(id) {
      return this._getFallback().find(o => o.id === id) || null;
    },

    _deleteFallback(id) {
      try {
        const list = this._getFallback().filter(o => o.id !== id);
        localStorage.setItem(this.FALLBACK_KEY, JSON.stringify(list));
        return true;
      } catch (_) {
        return false;
      }
    }
  };

  root.KenoOrder = KenoOrder;
  root.KenoOrderStore = KenoOrderStore;
})(typeof window !== 'undefined' ? window : this);
