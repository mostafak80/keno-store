/**
 * Keno Store — Firebase Cloud Adapter (Firestore & Authentication)
 * Pure Zero-Build Vanilla ES Module with Graceful Offline / Local Degradation.
 * Handles real-time order creation, Firestore listeners, Google Sign-In, and RBAC whitelist.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'keno_firebase_config_v1';
  const CDN_BASE = 'https://www.gstatic.com/firebasejs/10.12.0';
  const CIPHER_PREFIX = 'enc_v2_';
  const SALT = 'KenoStore#Firebase#SecureKey@2026';

  /**
   * Safe client-side encryption cipher with salt XOR and Base64 wrapping.
   */
  function safeEncrypt(text) {
    try {
      const codeUnits = new Uint16Array(text.length);
      for (let i = 0; i < codeUnits.length; i++) {
        codeUnits[i] = text.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length);
      }
      return CIPHER_PREFIX + btoa(String.fromCharCode(...new Uint8Array(codeUnits.buffer)));
    } catch (_) {
      return text;
    }
  }

  /**
   * Safe client-side decryption cipher.
   */
  function safeDecrypt(enc) {
    try {
      if (typeof enc !== 'string') return enc;
      if (!enc.startsWith(CIPHER_PREFIX)) {
        return enc; // Fallback to raw JSON if stored previously unencrypted
      }
      const raw = atob(enc.slice(CIPHER_PREFIX.length));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i);
      }
      const codeUnits = new Uint16Array(bytes.buffer);
      let result = '';
      for (let i = 0; i < codeUnits.length; i++) {
        result += String.fromCharCode(codeUnits[i] ^ SALT.charCodeAt(i % SALT.length));
      }
      return result;
    } catch (_) {
      return enc;
    }
  }

  let firebaseApp = null;
  let firebaseAuth = null;
  let firestoreDb = null;
  let authModules = null;
  let firestoreModules = null;
  let initPromise = null;

  const KenoFirebase = {
    /**
     * Retrieves embedded Firebase configuration directly from source code.
     * @returns {Object|null}
     */
    getConfig() {
      if (root.KenoConfig?.FIREBASE_CONFIG?.apiKey && root.KenoConfig.FIREBASE_CONFIG.projectId) {
        return root.KenoConfig.FIREBASE_CONFIG;
      }
      return null;
    },

    /**
     * Safely resets or reloads Firebase instance.
     */
    reload() {
      firebaseApp = null;
      firebaseAuth = null;
      firestoreDb = null;
      initPromise = null;
      return this.init();
    },

    /**
     * Checks whether valid Firebase credentials have been configured in code.
     * @returns {boolean}
     */
    isConfigured() {
      const cfg = this.getConfig();
      return Boolean(cfg && cfg.apiKey && cfg.projectId);
    },

    /**
     * Initializes Firebase App, Auth, and Firestore via modern dynamic imports.
     * If offline or unconfigured, resolves gracefully without throwing.
     */
    async init() {
      if (firebaseApp && firestoreDb) {
        return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
      }
      if (initPromise) return initPromise;

      initPromise = (async () => {
        const config = this.getConfig();
        if (!config) {
          return null; // Graceful fallback
        }

        try {
          // Dynamic ESM imports from official Google CDN
          const [appMod, authMod, fsMod] = await Promise.all([
            import(`${CDN_BASE}/firebase-app.js`),
            import(`${CDN_BASE}/firebase-auth.js`),
            import(`${CDN_BASE}/firebase-firestore.js`)
          ]);

          authModules = authMod;
          firestoreModules = fsMod;

          // Initialize or get existing app
          firebaseApp = appMod.getApps().length > 0
            ? appMod.getApp()
            : appMod.initializeApp(config);

          firebaseAuth = authMod.getAuth(firebaseApp);
          firestoreDb = fsMod.getFirestore(firebaseApp);

          console.info('Keno Store: Firebase successfully connected.');
          return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
        } catch (err) {
          console.warn('Keno Store: Firebase initialization skipped or failed, falling back to local storage:', err.message);
          return null;
        }
      })();

      return initPromise;
    },

    /**
     * Signs in admin user with Google Sign-In popup.
     * @returns {Promise<{ user: Object, email: string, displayName: string, photoURL: string }>}
     */
    async signInWithGoogle() {
      const fb = await this.init();
      if (!fb || !authModules) {
        throw new Error('خدمة Firebase غير مفعلة حالياً. يرجى مراجعة إعدادات FIREBASE_CONFIG في الكود البرمجي.');
      }

      const provider = new authModules.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await authModules.signInWithPopup(fb.auth, provider);
        const user = result.user;
        return {
          uid: user.uid,
          email: (user.email || '').toLowerCase().trim(),
          displayName: user.displayName || user.email,
          photoURL: user.photoURL || '',
          idToken: await user.getIdToken()
        };
      } catch (err) {
        if (err.code === 'auth/popup-closed-by-user') {
          throw new Error('تم إلغاء تسجيل الدخول من قبل المستخدم.');
        } else if (err.code === 'auth/unauthorized-domain') {
          throw new Error('هذا النطاق غير مصرح به في Firebase Console. أضف النطاق في Authorized Domains.');
        }
        throw new Error(`تعذّر تسجيل الدخول باستخدام Google: ${err.message}`);
      }
    },

    /**
     * Signs out the current Firebase user.
     */
    async signOut() {
      try {
        if (firebaseAuth && authModules) {
          await authModules.signOut(firebaseAuth);
        }
      } catch (_) {}
    },

    /**
     * Gets current authenticated Firebase user.
     */
    getCurrentUser() {
      return firebaseAuth ? firebaseAuth.currentUser : null;
    },

    /**
     * Checks if an email is authorized in the admin whitelist.
     * Queries the Firestore 'users' collection or falls back to KenoConfig.AUTHORIZED_ADMINS.
     * Roles supported: OWNER, EDITOR, VIEWER.
     * @param {string} email
     * @returns {Promise<{ authorized: boolean, role: 'OWNER'|'EDITOR'|'VIEWER', info?: Object }>}
     */
    async checkAdminAuthorization(email) {
      const normalized = String(email || '').toLowerCase().trim();
      if (!normalized) return { authorized: false, role: 'VIEWER' };

      // 1. Check Cloud Firestore 'users' collection if available
      const fb = await this.init();
      if (fb && firestoreModules) {
        try {
          const docRef = firestoreModules.doc(fb.db, 'users', normalized);
          const snap = await firestoreModules.getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            const rawRole = String(data.role || 'VIEWER').toUpperCase();
            const role = ['OWNER', 'EDITOR', 'VIEWER'].includes(rawRole) ? rawRole : 'VIEWER';
            return {
              authorized: true,
              role,
              info: data
            };
          }
        } catch (e) {
          console.warn('Could not check users in Firestore, falling back to local config:', e);
        }
      }

      // 2. Check local hidden whitelist in KenoConfig
      const adminEmails = (root.KenoConfig?.ADMIN_EMAILS || []).map(e => String(e).toLowerCase().trim());
      const staticAdmins = root.KenoConfig?.AUTHORIZED_ADMINS || {};

      if (adminEmails.includes(normalized) || staticAdmins[normalized]) {
        const adminData = staticAdmins[normalized] || {};
        const rawRole = String(adminData.role || 'OWNER').toUpperCase();
        const role = ['OWNER', 'EDITOR', 'VIEWER'].includes(rawRole) ? rawRole : 'OWNER';
        return {
          authorized: true,
          role,
          info: adminData
        };
      }

      return { authorized: false, role: 'VIEWER' };
    },

    /**
     * Creates a new order in Cloud Firestore 'orders' collection.
     * Transparently saves a backup in local IndexedDB.
     * @param {Object} orderObj
     * @returns {Promise<{ success: boolean, cloud: boolean, orderId: string }>}
     */
    async createOrder(orderObj) {
      if (!orderObj || !orderObj.id) {
        throw new Error('بيانات الطلب غير صالحة.');
      }

      // 1. Save backup to local IndexedDB
      try {
        if (root.KenoOrderStore) {
          await root.KenoOrderStore.saveOrder(orderObj);
        }
      } catch (err) {
        console.warn('Local backup save failed:', err);
      }

      // 2. Save to Cloud Firestore
      const fb = await this.init();
      if (fb && firestoreModules) {
        try {
          const docRef = firestoreModules.doc(fb.db, 'orders', orderObj.id);
          const firestorePayload = {
            id: orderObj.id,
            timestamp: orderObj.timestamp || Date.now(),
            dateStr: orderObj.dateStr || new Date().toLocaleString('ar-EG'),
            type: orderObj.type || 'direct',
            items: orderObj.items || [],
            total: Number(orderObj.total) || 0,
            paymentMethod: orderObj.paymentMethod || '',
            paymentMethodId: orderObj.paymentMethodId || '',
            customerAccount: orderObj.customerAccount || '',
            customerPhone: orderObj.customerPhone || '',
            transferNumber: orderObj.transferNumber || '',
            hasReceipt: Boolean(orderObj.hasReceipt),
            receipt: orderObj.receipt ? {
              dataUrl: orderObj.receipt.dataUrl || '',
              fileName: orderObj.receipt.fileName || 'receipt.jpg',
              size: orderObj.receipt.size || 0
            } : null,
            notes: orderObj.notes || '',
            status: orderObj.status || 'pending',
            createdAt: firestoreModules.serverTimestamp ? firestoreModules.serverTimestamp() : new Date(),
            updatedAt: firestoreModules.serverTimestamp ? firestoreModules.serverTimestamp() : new Date()
          };

          await firestoreModules.setDoc(docRef, firestorePayload);
          return { success: true, cloud: true, orderId: orderObj.id };
        } catch (err) {
          console.error('Firestore order write error:', err);
          return { success: true, cloud: false, orderId: orderObj.id, error: err.message };
        }
      }

      return { success: true, cloud: false, orderId: orderObj.id };
    },

    /**
     * Subscribes to real-time orders updates from Firestore,
     * or retrieves from local IndexedDB if Firebase is not connected.
     * @param {Function} onUpdate - callback(ordersArray)
     * @param {Function} onError - callback(error)
     * @returns {Function} Unsubscribe function
     */
    async subscribeOrders(onUpdate, onError) {
      const fb = await this.init();

      if (fb && firestoreModules) {
        try {
          const colRef = firestoreModules.collection(fb.db, 'orders');
          const q = firestoreModules.query(
            colRef,
            firestoreModules.orderBy('timestamp', 'desc')
          );

          const unsubscribe = firestoreModules.onSnapshot(q, snapshot => {
            const orders = [];
            snapshot.forEach(doc => {
              orders.push(doc.data());
            });
            onUpdate(orders);
          }, err => {
            console.error('Firestore snapshot listener error:', err);
            if (onError) onError(err);
            if (root.KenoOrderStore) {
              root.KenoOrderStore.getOrders().then(onUpdate);
            }
          });

          return unsubscribe;
        } catch (err) {
          console.warn('Real-time query failed, loading local orders:', err);
        }
      }

      // Offline / Local Mode Fallback
      if (root.KenoOrderStore) {
        root.KenoOrderStore.getOrders().then(onUpdate);
      } else {
        onUpdate([]);
      }

      return () => {};
    },

    /**
     * Updates an order's status in Cloud Firestore and local IndexedDB.
     * @param {string} orderId 
     * @param {string} newStatus - 'pending' | 'paid' | 'processing' | 'delivered' | 'cancelled'
     * @param {string} adminEmail 
     */
    async updateOrderStatus(orderId, newStatus, adminEmail = '') {
      if (!orderId || !newStatus) return false;

      // 1. Update Cloud Firestore
      const fb = await this.init();
      if (fb && firestoreModules) {
        try {
          const docRef = firestoreModules.doc(fb.db, 'orders', orderId);
          await firestoreModules.updateDoc(docRef, {
            status: newStatus,
            updatedAt: Date.now(),
            updatedBy: adminEmail || 'admin'
          });
        } catch (e) {
          console.warn('Firestore status update failed:', e);
        }
      }

      // 2. Update local IndexedDB
      if (root.KenoOrderStore) {
        try {
          const localOrder = await root.KenoOrderStore.getOrder(orderId);
          if (localOrder) {
            localOrder.status = newStatus;
            localOrder.updatedAt = Date.now();
            await root.KenoOrderStore.saveOrder(localOrder);
          }
        } catch (_) {}
      }

      return true;
    },

    /**
     * Deletes an order from Cloud Firestore and local IndexedDB.
     * @param {string} orderId 
     */
    async deleteOrder(orderId) {
      if (!orderId) return false;

      const fb = await this.init();
      if (fb && firestoreModules) {
        try {
          const docRef = firestoreModules.doc(fb.db, 'orders', orderId);
          await firestoreModules.deleteDoc(docRef);
        } catch (e) {
          console.warn('Firestore delete failed:', e);
        }
      }

      if (root.KenoOrderStore) {
        await root.KenoOrderStore.deleteOrder(orderId);
      }

      return true;
    },

    /**
     * Computes dashboard KPI metrics from an orders list.
     * @param {Array<Object>} orders 
     */
    computeKPIs(orders = []) {
      const list = Array.isArray(orders) ? orders : [];
      let pendingCount = 0;
      let deliveredCount = 0;
      let totalRevenue = 0;
      const serviceCounts = {};

      list.forEach(o => {
        const st = (o.status || 'pending').toLowerCase();
        if (st === 'pending') pendingCount++;
        if (st === 'delivered') deliveredCount++;
        if (st !== 'cancelled') {
          totalRevenue += Number(o.total) || 0;
        }

        // Count services
        if (Array.isArray(o.items)) {
          o.items.forEach(it => {
            const name = it.serviceName || 'خدمة مخصصة';
            serviceCounts[name] = (serviceCounts[name] || 0) + (it.quantity || 1);
          });
        } else if (o.serviceName) {
          serviceCounts[o.serviceName] = (serviceCounts[o.serviceName] || 0) + 1;
        }
      });

      // Find most popular service
      let popularService = '—';
      let maxCount = 0;
      for (const [srv, count] of Object.entries(serviceCounts)) {
        if (count > maxCount) {
          maxCount = count;
          popularService = srv;
        }
      }

      return {
        totalOrders: list.length,
        pendingOrders: pendingCount,
        deliveredOrders: deliveredCount,
        totalRevenue,
        popularService: popularService !== '—' ? `${popularService} (${maxCount})` : '—'
      };
    }
  };

  root.KenoFirebase = KenoFirebase;

  // ========================================================================
  // Catalog Publishing & Live Hydration (Production Publishing Workflow)
  // ========================================================================

  /**
   * Publishes the full catalog data to Firestore doc `settings/catalog`
   * so that visitors see updates instantly without waiting for a deployment.
   * Only authorized admins (OWNER role) can call this successfully due to Firestore rules.
   * @param {Object} catalogData - The full catalog object (services, settings, paymentMethods, etc.)
   * @returns {Promise<{ success: boolean, timestamp: string }>}
   */
  KenoFirebase.publishCatalog = async function (catalogData) {
    const fb = await this.init();
    if (!fb || !firestoreModules) {
      throw new Error('Firebase غير متصل. تعذر نشر الكتالوج.');
    }

    try {
      const docRef = firestoreModules.doc(fb.db, 'settings', 'catalog');
      const payload = {
        data: JSON.parse(JSON.stringify(catalogData)),
        publishedAt: firestoreModules.serverTimestamp ? firestoreModules.serverTimestamp() : new Date(),
        publishedBy: firebaseAuth?.currentUser?.email || 'unknown'
      };
      await firestoreModules.setDoc(docRef, payload);
      return { success: true, timestamp: new Date().toISOString() };
    } catch (err) {
      console.error('Firestore catalog publish error:', err);
      throw new Error('تعذر نشر الكتالوج على Firebase: ' + err.message);
    }
  };

  /**
   * Fetches the latest published catalog from Firestore doc `settings/catalog`.
   * Used by the storefront to hydrate live data on page load.
   * @returns {Promise<Object|null>} The catalog data object, or null if not found.
   */
  KenoFirebase.fetchLiveCatalog = async function () {
    const fb = await this.init();
    if (!fb || !firestoreModules) return null;

    try {
      const docRef = firestoreModules.doc(fb.db, 'settings', 'catalog');
      const snap = await firestoreModules.getDoc(docRef);
      if (snap.exists()) {
        const record = snap.data();
        return record.data || null;
      }
      return null;
    } catch (err) {
      console.warn('Could not fetch live catalog from Firestore:', err);
      return null;
    }
  };

  /**
   * Gets the current authenticated user's Firebase ID token.
   * This token is sent to the Vercel serverless API to prove admin identity.
   * @returns {Promise<string|null>}
   */
  KenoFirebase.getIdToken = async function () {
    try {
      const user = firebaseAuth?.currentUser;
      if (!user) return null;
      return await user.getIdToken(true);
    } catch (_) {
      return null;
    }
  };

})(typeof window !== 'undefined' ? window : this);
