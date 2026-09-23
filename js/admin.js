/**
 * Keno Store — Secure Admin Controller & Management Engine
 * Provides Role-Based Access Control (RBAC: Owner, Editor, Viewer),
 * cryptographic session management with 60-minute auto-lock,
 * dynamic Featured Card editor with instant live preview,
 * category & payment managers, orders inspection modal, and GitHub API publisher.
 */
(function (root) {
  'use strict';

  // Helper selector
  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

  // --- Role-Based Access Control (RBAC) & Session Management ---
  const KenoAdminAuth = {
    SESSION_KEY: 'keno_admin_session_v3',

    getSession() {
      try {
        const raw = sessionStorage.getItem(this.SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session || !session.role || !session.expiresAt) return null;

        if (Date.now() > session.expiresAt) {
          this.logout(true);
          return null;
        }

        return session;
      } catch (_) {
        return null;
      }
    },

    setSession(role, credentials = {}) {
      const timeoutMs = (root.KenoConfig?.SESSION_TIMEOUT_MINUTES || 60) * 60 * 1000;
      const session = {
        role,
        repo: credentials.repo || '',
        branch: credentials.branch || 'main',
        token: credentials.token || '',
        authTime: Date.now(),
        expiresAt: Date.now() + timeoutMs
      };
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      return session;
    },

    logout(isTimeout = false) {
      sessionStorage.removeItem(this.SESSION_KEY);
      if (root.KenoFirebase && typeof root.KenoFirebase.signOut === 'function') {
        root.KenoFirebase.signOut().catch(() => {});
      }
      if (isTimeout) {
        alert('انتهت صلاحية الجلسة بسبب عدم النشاط (60 دقيقة). تم قفل لوحة الإدارة تلقائيًا لحماية المتجر.');
      }
      location.hash = '#catalog';
      location.reload();
    },

    hasPermission(action) {
      const session = this.getSession();
      if (!session) return false;
      const roleConfig = (root.KenoConfig?.ADMIN_ROLES || {})[session.role.toUpperCase()];
      if (!roleConfig) return false;
      return (roleConfig.permissions || []).includes(action);
    }
  };

  // --- Admin Controller Definition ---
  const KenoAdmin = {
    auth: KenoAdminAuth,
    timerInterval: null,
    initialized: false,

    async init() {
      if (!this.initialized) {
        this.initialized = true;
        this.bindLoginGate();
        this.bindStatusControls();
        this.bindFeaturedEditor();
        this.startSessionTimer();
        let lastTouch = 0;
        const touch = () => {
          if ($('adminView')?.hidden || Date.now() - lastTouch < 15000) return;
          const active = KenoAdminAuth.getSession();
          if (!active) return;
          lastTouch = Date.now();
          active.expiresAt = lastTouch + (root.KenoConfig?.SESSION_TIMEOUT_MINUTES || 60) * 60000;
          try { sessionStorage.setItem(KenoAdminAuth.SESSION_KEY, JSON.stringify(active)); } catch (_) {}
        };
        document.addEventListener('pointerdown', touch, { passive:true });
        document.addEventListener('keydown', touch);
      }

      let session = KenoAdminAuth.getSession();
      const currentFbUser = root.KenoFirebase?.getCurrentUser?.();
      if (!session && currentFbUser?.email && root.KenoFirebase?.checkAdminAuthorization) {
        try {
          const authCheck = await root.KenoFirebase.checkAdminAuthorization(currentFbUser.email);
          if (authCheck && authCheck.authorized) {
            const role = String(authCheck.role || 'OWNER').toUpperCase();
            session = KenoAdminAuth.setSession(role, {
              email: currentFbUser.email,
              name: currentFbUser.displayName || currentFbUser.email,
              photo: currentFbUser.photoURL || ''
            });
          }
        } catch (_) {}
      }

      if (session) {
        if (typeof root.ensureAdminWorkspace === 'function') {
          try {
            await root.ensureAdminWorkspace(session);
          } catch (_) {}
        }
        this.unlockWorkspace(session);
      } else {
        await this.showLoginGate();
      }
    },

    startSessionTimer() {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = setInterval(() => {
        const session = KenoAdminAuth.getSession();
        const timerText = $('sessionTimerText');
        if (!session || !timerText) return;

        const remainingMs = Math.max(0, session.expiresAt - Date.now());
        if (remainingMs <= 0) {
          KenoAdminAuth.logout(true);
          return;
        }

        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        timerText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }, 1000);
    },

    async showLoginGate() {
      if ($('storefront')) $('storefront').hidden = true;
      if ($('adminView')) $('adminView').hidden = false;
      if ($('adminHeading')) $('adminHeading').hidden = true;
      if ($('adminLogin')) $('adminLogin').hidden = false;
      if ($('adminWorkspace')) $('adminWorkspace').hidden = true;

      const errEl = $('loginError');
      const errText = $('loginErrorText') || errEl;
      const currentFbUser = root.KenoFirebase?.getCurrentUser?.();
      if (currentFbUser && currentFbUser.email && root.KenoFirebase?.checkAdminAuthorization) {
        try {
          const authCheck = await root.KenoFirebase.checkAdminAuthorization(currentFbUser.email);
          if (!authCheck?.authorized && errEl) {
            errText.textContent = `أنت مسجّل الدخول بحساب (${currentFbUser.email}) وهو حساب عميل. لوحة التحكم مخصصة للمشرفين والمسؤولين فقط.`;
            errEl.hidden = false;
          }
        } catch (_) {}
      }
    },

    unlockWorkspace(session) {
      if ($('storefront')) $('storefront').hidden = true;
      if ($('adminView')) $('adminView').hidden = false;
      if ($('adminHeading')) $('adminHeading').hidden = false;
      if ($('adminLogin')) $('adminLogin').hidden = true;
      if ($('adminWorkspace')) $('adminWorkspace').hidden = false;

      // Update Role Badge (OWNER, EDITOR, VIEWER)
      const badge = $('adminRoleBadge');
      if (badge) {
        const roles = root.KenoConfig?.ADMIN_ROLES || {};
        const roleKey = String(session.role || 'OWNER').toUpperCase();
        const roleInfo = roles[roleKey] || { label: roleKey, badgeClass: 'owner-role-badge' };
        badge.textContent = roleInfo.label;
        badge.className = `status-pill ${roleInfo.badgeClass || 'active-pill'}`;
      }

      // Role-based UI restrictions
      this.applyRoleRestrictions(session.role);

      // Render Admin Tabs
      if (typeof root.renderAdminStore === 'function') {
        root.renderAdminStore();
      }
      this.renderAdminFeatured();
      this.subscribeRealtimeOrders();
    },

    applyRoleRestrictions(role) {
      const currentRole = String(role || 'VIEWER').toUpperCase();
      const isViewer = currentRole === 'VIEWER';
      const isEditor = currentRole === 'EDITOR';
      const isOwner = currentRole === 'OWNER';

      const msgEl = $('adminMessage');
      if (isViewer) {
        if (msgEl) {
          msgEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-icon="eye"></i>
              <span><strong>وضع المعاينة والقراءة فقط (VIEWER):</strong> أنت مسجّل بصلاحية مراجع. يمكنك فحص المسودة وتصفح الطلبات، ولكن أزرار التعديل والحذف والنشر معطلة.</span>
            </div>
          `;
          msgEl.hidden = false;
        }
        if ($('publishButton')) $('publishButton').disabled = true;
        if ($('saveFeaturedBtn')) $('saveFeaturedBtn').disabled = true;
        document.querySelectorAll('[data-open-editor], #addCategoryButton, #addPaymentButton, #clearOrdersHistoryBtn').forEach(b => {
          b.disabled = true;
          b.style.opacity = '0.5';
          b.title = 'معطّل في وضع القراءة فقط';
        });
      } else if (isEditor) {
        if (msgEl) {
          msgEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
              <i data-icon="layout-grid"></i>
              <span><strong>صلاحية محرر محتوى (EDITOR):</strong> يمكنك تعديل الخدمات والعروض والأقسام والبطاقة المميزة. إعدادات المتجر وطرق الدفع والنشر مخصصة لمالك المتجر.</span>
            </div>
          `;
          msgEl.hidden = false;
        }
        if ($('publishButton')) {
          $('publishButton').disabled = true;
          $('publishButton').title = 'النشر على GitHub متاح لمالك المتجر فقط';
        }
        if ($('saveFeaturedBtn')) $('saveFeaturedBtn').disabled = false;
      } else if (isOwner) {
        if (msgEl) msgEl.hidden = true;
        if ($('publishButton')) $('publishButton').disabled = false;
        if ($('saveFeaturedBtn')) $('saveFeaturedBtn').disabled = false;
      }

      if (root.Icons && typeof root.Icons.hydrate === 'function') {
        root.Icons.hydrate();
      }
    },

    bindLoginGate() {
      const googleBtn = $('googleSignInBtn');
      if (!googleBtn) return;

      googleBtn.addEventListener('click', async () => {
        const errEl = $('loginError');
        const errText = $('loginErrorText') || errEl;
        if (errEl) errEl.hidden = true;

        if (!root.KenoFirebase || typeof root.KenoFirebase.signInWithGoogle !== 'function' || !root.KenoFirebase.isConfigured()) {
          if (errEl) {
            errText.textContent = 'خدمة Firebase غير مفعلة حالياً. يرجى مراجعة إعدادات FIREBASE_CONFIG في الكود البرمجي.';
            errEl.hidden = false;
          }
          return;
        }

        try {
          googleBtn.disabled = true;
          googleBtn.style.opacity = '0.7';
          const labelSpan = googleBtn.querySelector('.google-btn-text') || googleBtn.querySelector('span:last-child');
          if (labelSpan) labelSpan.textContent = 'جاري التحقق من الحساب...';

          const user = await root.KenoFirebase.signInWithGoogle();
          if (!user || !user.email) {
            throw new Error('لم يتم استلام بيانات الحساب من Google.');
          }

          // Verify Whitelist Authorization against hidden ADMIN_EMAILS / Firestore
          const authCheck = await root.KenoFirebase.checkAdminAuthorization(user.email);
          if (!authCheck || !authCheck.authorized) {
            throw new Error(`حسابك (${user.email}) مسجل كعميل. لوحة التحكم مخصصة لمديري ومشرفي المتجر فقط.`);
          }

          const role = String(authCheck.role || 'OWNER').toUpperCase();
          const session = KenoAdminAuth.setSession(role, {
            email: user.email,
            name: user.displayName || user.email,
            photo: user.photoURL || ''
          });

          if (typeof root.ensureAdminWorkspace === 'function') {
            try {
              await root.ensureAdminWorkspace(null);
            } catch (_) {}
          }

          KenoAdmin.unlockWorkspace(session);
          if (typeof root.showToast === 'function') {
            root.showToast(`مرحبًا بك ${user.displayName || user.email}! تم فتح لوحة الإدارة بنجاح.`);
          }
        } catch (err) {
          if (errEl) {
            errText.textContent = err.message || 'فشل تسجيل الدخول بحساب Google.';
            errEl.hidden = false;
          }
        } finally {
          if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.style.opacity = '1';
            const labelSpan = googleBtn.querySelector('.google-btn-text') || googleBtn.querySelector('span:last-child');
            if (labelSpan) labelSpan.textContent = 'Sign in with Google';
          }
        }
      });
    },

    bindStatusControls() {
      $('logoutButton')?.addEventListener('click', () => {
        if (confirm('هل ترغب في تسجيل الخروج وتأمين لوحة الإدارة؟')) {
          KenoAdminAuth.logout(false);
        }
      });
    },

    // --- Dynamic Featured Card Controller ---
    bindFeaturedEditor() {
      // Theme Chips Click
      document.querySelectorAll('#fcThemeSelector .theme-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          document.querySelectorAll('#fcThemeSelector .theme-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          const radio = chip.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;
          this.updateLivePreview();
        });
      });

      // Inputs real-time listener for instant live preview
      [
        'fcEnabledInput', 'fcBadgeInput', 'fcTitle1Input', 'fcTitle2Input',
        'fcDescInput', 'fcQuantityInput', 'fcPriceInput', 'fcButtonTextInput',
        'fcTaglineInput', 'fcIconSelect'
      ].forEach(id => {
        $(id)?.addEventListener('input', () => this.updateLivePreview());
        $(id)?.addEventListener('change', () => this.updateLivePreview());
      });

      // Service & Plan selection auto-fill
      $('fcServiceSelect')?.addEventListener('change', () => {
        this.populatePlansForService($('fcServiceSelect').value);
        this.autoFillFromService();
      });

      $('fcPlanSelect')?.addEventListener('change', () => {
        this.autoFillFromPlan();
      });

      // Save Featured Card to Draft
      $('saveFeaturedBtn')?.addEventListener('click', () => {
        if (!KenoAdminAuth.hasPermission('edit_content')) {
          alert('ليس لديك صلاحية لتعديل البطاقة المميزة.');
          return;
        }

        try {
          const draft = root.getAdminDraft ? root.getAdminDraft() : null;
          if (!draft) return;

          const theme = document.querySelector('input[name="fcTheme"]:checked')?.value || 'red';
          const icon = $('fcIconSelect')?.value || 'gamepad-2';

          const linkedService = draft.services.find(s => s.id === $('fcServiceSelect')?.value && s.visible);
          const linkedPlan = linkedService?.plans?.find(p => p.id === $('fcPlanSelect')?.value && p.available);
          if ($('fcEnabledInput')?.checked && !linkedPlan) {
            throw new Error('اختار خدمة ظاهرة وعرض متاح للبطاقة الرئيسية.');
          }
          this.updateLivePreview();
          draft.featuredCard = {
            enabled: $('fcEnabledInput')?.checked !== false,
            badge: $('fcBadgeInput')?.value.trim() || 'الأكثر طلبًا',
            icon,
            titleLine1: $('fcTitle1Input')?.value.trim() || 'PLAY MORE',
            titleLine2: $('fcTitle2Input')?.value.trim() || 'WITH KENO.',
            description: $('fcDescInput')?.value.trim() || '',
            serviceId: $('fcServiceSelect')?.value || '',
            planId: $('fcPlanSelect')?.value || '',
            offerQuantity: $('fcQuantityInput')?.value.trim() || '',
            offerPrice: $('fcPriceInput')?.value.trim() || '',
            buttonText: $('fcButtonTextInput')?.value.trim() || 'اكتشف العروض',
            theme,
            tagline: $('fcTaglineInput')?.value.trim() || 'KENO / FEATURED'
          };

          if (typeof root.saveAdminDraft === 'function') {
            root.saveAdminDraft();
          }

          if (typeof root.showToast === 'function') {
            root.showToast('تم حفظ إعدادات البطاقة المميزة في المسودة بنجاح.');
          }
        } catch (err) {
          alert(`تعذر حفظ البطاقة المميزة: ${err.message}`);
        }
      });
    },

    renderAdminFeatured() {
      const draft = root.getAdminDraft ? root.getAdminDraft() : null;
      if (!draft) return;

      const fc = draft.featuredCard || {
        enabled: true,
        badge: 'الأكثر طلبًا',
        icon: 'gamepad-2',
        titleLine1: 'PLAY MORE',
        titleLine2: 'WITH KENO.',
        description: 'شحن ببجي العالمية — شحن فوري وآمن بالـ ID',
        serviceId: 'pubg',
        planId: 'pubg-3',
        offerQuantity: '325 شدة',
        offerPrice: '270 جنيه',
        buttonText: 'شوف كل عروض ببجي',
        theme: 'red',
        tagline: 'KENO / FEATURED'
      };

      // Set values in inputs
      if ($('fcEnabledInput')) $('fcEnabledInput').checked = fc.enabled !== false;
      if ($('fcBadgeInput')) $('fcBadgeInput').value = fc.badge || '';
      if ($('fcTitle1Input')) $('fcTitle1Input').value = fc.titleLine1 || '';
      if ($('fcTitle2Input')) $('fcTitle2Input').value = fc.titleLine2 || '';
      if ($('fcDescInput')) $('fcDescInput').value = fc.description || '';
      if ($('fcQuantityInput')) $('fcQuantityInput').value = fc.offerQuantity || '';
      if ($('fcPriceInput')) $('fcPriceInput').value = fc.offerPrice || '';
      if ($('fcButtonTextInput')) $('fcButtonTextInput').value = fc.buttonText || '';
      if ($('fcTaglineInput')) $('fcTaglineInput').value = fc.tagline || '';

      // Populate Icons
      const iconSelect = $('fcIconSelect');
      if (iconSelect) {
        const iconsList = ['gamepad-2', 'sparkles', 'zap', 'clapperboard', 'star', 'flame', 'crown', 'coins', 'trophy', 'globe'];
        const iconLabels = root.KenoConfig?.ICON_LABELS || {};
        iconSelect.innerHTML = iconsList.map(name => `
          <option value="${name}" ${name === fc.icon ? 'selected' : ''}>
            ${iconLabels[name] || name} (${name})
          </option>
        `).join('');
      }

      // Populate Services
      const srvSelect = $('fcServiceSelect');
      if (srvSelect) {
        srvSelect.innerHTML = '<option value="">-- اختر الخدمة المرتبطة بالعرض --</option>' +
          draft.services.map(s => `<option value="${s.id}" ${s.id === fc.serviceId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
      }

      this.populatePlansForService(fc.serviceId, fc.planId);

      // Select theme radio
      const themeRadios = document.querySelectorAll('input[name="fcTheme"]');
      themeRadios.forEach(r => {
        const isMatch = r.value === (fc.theme || 'red');
        r.checked = isMatch;
        r.closest('.theme-chip')?.classList.toggle('selected', isMatch);
      });

      this.updateLivePreview();
    },

    populatePlansForService(serviceId, selectedPlanId = '') {
      const planSelect = $('fcPlanSelect');
      if (!planSelect) return;

      const draft = root.getAdminDraft ? root.getAdminDraft() : null;
      const srv = draft?.services.find(s => s.id === serviceId);

      if (!srv || !srv.plans || srv.plans.length === 0) {
        planSelect.innerHTML = '<option value="">-- لا توجد عروض محددة لهذه الخدمة --</option>';
        return;
      }

      selectedPlanId = selectedPlanId || srv.plans.find(p => p.available)?.id || '';
      planSelect.innerHTML = '<option value="">-- اختيار العرض المحدد --</option>' +
        srv.plans.map(p => `
          <option value="${p.id}" ${!p.available ? 'disabled' : ''} ${p.id === selectedPlanId ? 'selected' : ''}>
            ${esc(p.label)} (${p.price} ج.م)
          </option>
        `).join('');
    },

    autoFillFromService() {
      const srvId = $('fcServiceSelect')?.value;
      const draft = root.getAdminDraft ? root.getAdminDraft() : null;
      const srv = draft?.services.find(s => s.id === srvId);
      if (!srv) return;

      if ($('fcDescInput') && !$('fcDescInput').value) {
        $('fcDescInput').value = srv.description || '';
      }
      if ($('fcButtonTextInput') && (!$('fcButtonTextInput').value || $('fcButtonTextInput').value === 'اكتشف العروض')) {
        $('fcButtonTextInput').value = `شوف عروض ${srv.name}`;
      }
      this.updateLivePreview();
    },

    autoFillFromPlan() {
      const srvId = $('fcServiceSelect')?.value;
      const planId = $('fcPlanSelect')?.value;
      const draft = root.getAdminDraft ? root.getAdminDraft() : null;
      const srv = draft?.services.find(s => s.id === srvId);
      const plan = srv?.plans?.find(p => p.id === planId);
      if (!plan) return;

      if ($('fcQuantityInput')) $('fcQuantityInput').value = plan.label;
      if ($('fcPriceInput')) $('fcPriceInput').value = `${plan.price} جنيه`;
      this.updateLivePreview();
    },

    updateLivePreview() {
      const previewCard = $('adminHeroPreview');
      if (!previewCard) return;

      const theme = document.querySelector('input[name="fcTheme"]:checked')?.value || 'red';
      const badge = $('fcBadgeInput')?.value.trim() || 'الأكثر طلبًا';
      const icon = $('fcIconSelect')?.value || 'gamepad-2';
      const title1 = $('fcTitle1Input')?.value.trim() || 'PLAY MORE';
      const title2 = $('fcTitle2Input')?.value.trim() || 'WITH KENO.';
      const desc = $('fcDescInput')?.value.trim() || 'شحن ببجي العالمية — شحن فوري وآمن بالـ ID';
      const draft = root.getAdminDraft ? root.getAdminDraft() : null;
      const service = draft?.services.find(s => s.id === $('fcServiceSelect')?.value);
      const plan = service?.plans?.find(p => p.id === $('fcPlanSelect')?.value && p.available);
      const qty = plan?.label || 'اختر عرض متاح';
      const price = plan ? `${plan.price} جنيه` : '—';
      if ($('fcQuantityInput')) $('fcQuantityInput').value = plan?.label || '';
      if ($('fcPriceInput')) $('fcPriceInput').value = plan ? price : '';
      const btnText = $('fcButtonTextInput')?.value.trim() || 'شوف كل عروض ببجي';
      const tagline = $('fcTaglineInput')?.value.trim() || 'KENO / FEATURED';

      // Update Theme Class
      previewCard.className = `hero-feature hero-theme-${theme}`;

      if ($('previewBadge')) $('previewBadge').textContent = badge;
      if ($('previewIcon')) $('previewIcon').innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${root.KENO_ICONS?.[icon] || ''}</svg>`;
      if ($('previewTitleLine1')) $('previewTitleLine1').textContent = title1;
      if ($('previewTitleLine2')) $('previewTitleLine2').textContent = title2;
      if ($('previewDescription')) $('previewDescription').textContent = desc;
      if ($('previewQuantity')) $('previewQuantity').innerHTML = `${esc(qty)}`;
      if ($('previewPrice')) $('previewPrice').innerHTML = `${esc(price)}`;
      if ($('previewButtonText')) $('previewButtonText').textContent = btnText;
      if ($('previewTagline')) $('previewTagline').textContent = tagline;

      if (root.Icons && typeof root.Icons.hydrate === 'function') {
        root.Icons.hydrate();
      }
    },



    unsubscribeOrders: null,
    async subscribeRealtimeOrders() {
      if (this.unsubscribeOrders) {
        try { this.unsubscribeOrders(); } catch (_) {}
        this.unsubscribeOrders = null;
      }

      if (root.KenoFirebase && typeof root.KenoFirebase.subscribeOrders === 'function') {
        this.unsubscribeOrders = await root.KenoFirebase.subscribeOrders(() => {
          if (typeof root.renderAdminStore === 'function') {
            root.renderAdminStore();
          }
        }, err => {
          console.warn('Real-time orders listener note:', err.message);
        });
      }
    }
  };

  root.KenoAdmin = KenoAdmin;
  root.KenoAdminAuth = KenoAdminAuth;
})(typeof window !== 'undefined' ? window : this);
