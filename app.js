/**
 * Keno Store — Main Application & Storefront Controller
 * Integrates modular subsystems: Config, Image, Order, GitHub, CatalogParser, and Search.
 * Implements high-performance storefront, accessible dialogs, and a full-featured admin experience.
 */
(function () {
  'use strict';

  // Ensure dependencies are loaded
  const Config = window.KenoConfig || {};
  const ImageUtils = window.KenoImage || {};
  const OrderUtils = window.KenoOrder || {};
  const GitHubClientFactory = window.KenoGitHub || {};
  const CatalogParser = window.KenoCatalogParser || {};
  const SearchEngine = window.KenoSearch || {};

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const money = n => Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const icon = name => {
    const icons = window.KENO_ICONS || {};
    const svgInner = icons[name] || icons['globe'] || '';
    return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${svgInner}</svg>`;
  };

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      const iconName = el.dataset.icon;
      el.outerHTML = icon(iconName);
    });
  }

  // --- Initial Catalog Loading ---
  let live;
  try {
    live = CatalogParser.validate(window.KENO_CATALOG);
  } catch (error) {
    console.error('Fatal: Failed to parse initial catalog:', error);
    const grid = $('serviceGrid');
    if (grid) {
      grid.innerHTML = '<div class="empty-state"><h3>تعذّر تحميل كتالوج الخدمات</h3><p>يرجى التأكد من وجود ملف assets/catalog.js بصيغة صحيحة.</p></div>';
    }
    hydrateIcons();
    return;
  }

  // --- Application State ---
  let preview = false;
  let draft = null;
  let baseData = null;
  let adminOpen = false;
  let client = null;
  let sha = null;
  let activeRepo = '';
  let activeBranch = '';

  let category = 'all';
  let query = '';
  let sort = 'featured';

  let selectedService = null;
  let selectedPlan = null;
  let editingServiceId = null;
  let editingCategoryId = null;
  let editingPaymentMethodId = null;
  let dialogSelectedPaymentId = null;
  let cartSelectedPaymentId = null;

  let editorDirty = false;
  let settingsDirty = false;
  let categoryDirty = false;
  let paymentDirty = false;
  let publishing = false;
  let toastTimer = null;
  let activeServicesView = 'services'; // 'services' or 'master-plans'
  let masterPlanSearchQuery = '';
  let masterPlanCatFilter = 'all';
  let masterPlanSrvFilter = 'all';
  let masterPlanStatusFilter = 'all';

  const viewData = () => (preview && draft ? draft : live);

  // --- Storage & Session Helpers ---
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (_) { return false; }
  }
  function draftKey() {
    return 'keno.admin.draft.v2:' + (activeRepo || location.host + location.pathname) + ':' + (activeBranch || 'local');
  }
  function isDirty() {
    return Boolean(draft && baseData && JSON.stringify(draft) !== JSON.stringify(baseData));
  }
  function saveDraft() {
    if (!draft) return;
    const saved = storageSet(draftKey(), JSON.stringify({
      data: draft,
      base: baseData,
      sha,
      repo: activeRepo,
      branch: activeBranch,
      timestamp: Date.now()
    }));
    if (!saved) {
      showAdminMessage('المتصفح لا يسمح بحفظ المسودة تلقائيًا. يُرجى تنزيل نسخة JSON احتياطية قبل إغلاق الصفحة.');
    }
    updateAdminStatus();
  }

  // --- UI Feedback & Modals ---
  function toast(message) {
    clearTimeout(toastTimer);
    const toastEl = $('toast');
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 4200);
  }

  function showAdminMessage(message) {
    const el = $('adminMessage');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function closeDialog(id) {
    const el = $(id);
    if (el && typeof el.close === 'function') el.close();
  }

  let confirmResolver = null;
  function confirmAction(title, message, label = 'تأكيد') {
    if (confirmResolver) return Promise.resolve(false);
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = message;
    $('confirmAccept').textContent = label;
    $('confirmDialog').showModal();
    return new Promise(resolve => { confirmResolver = resolve; });
  }

  function resolveConfirm(value) {
    $('confirmDialog').close();
    const done = confirmResolver;
    confirmResolver = null;
    done?.(value);
  }

  $('confirmAccept')?.addEventListener('click', () => resolveConfirm(true));
  $('confirmCancel')?.addEventListener('click', () => resolveConfirm(false));
  $('confirmDialog')?.addEventListener('cancel', event => {
    event.preventDefault();
    resolveConfirm(false);
  });

  // --- Clipboard Action Helpers ---
  async function copyPaymentText(text, label = 'القيمة') {
    if (!text) return false;
    const success = await OrderUtils.copyToClipboard(text);
    if (success) {
      toast(`تم نسخ ${label}: ${text}`);
    } else {
      toast(`${label}: ${text}`);
    }
    return success;
  }

  async function copyVodafoneNumber() {
    const data = viewData();
    const pm = (data.paymentMethods || []).find(m => (m.id === 'vodafone-cash' || m.id.includes('vodafone')) && m.enabled);
    const phone = pm?.number || data.settings?.paymentPhone || '01064806213';
    await copyPaymentText(phone, 'رقم فودافون كاش');
  }

  async function copyInstapayAddress() {
    const data = viewData();
    const pm = (data.paymentMethods || []).find(m => (m.id === 'instapay' || m.id.includes('insta')) && m.enabled);
    const instapay = pm?.number || data.settings?.instapay;
    if (!instapay) {
      toast('طريقة الدفع عبر إنستاباي غير مفعلة حاليًا.');
      return;
    }
    await copyPaymentText(instapay, 'عنوان إنستاباي');
  }

  document.querySelectorAll('.copy-vodafone-quick').forEach(btn => {
    btn.addEventListener('click', copyVodafoneNumber);
  });

  document.querySelectorAll('.copy-instapay-quick').forEach(btn => {
    btn.addEventListener('click', copyInstapayAddress);
  });

  // --- Dynamic Customer Payment Methods Rendering (Professional Selector) ---
  function renderPaymentMethodsList(containerEl, currentSelectedId, radioName) {
    if (!containerEl) return null;
    const data = viewData();
    const enabledMethods = (data.paymentMethods || []).filter(pm => pm.enabled);

    if (enabledMethods.length === 0) {
      containerEl.innerHTML = `
        <div class="field-hint" style="padding: 14px; background: #f8fafc; border-radius: var(--radius-md); border: 1px dashed var(--line); text-align: center;">
          سيتم التنسيق وتحديد طريقة الدفع المناسبة معك مباشرة عبر محادثة واتساب.
        </div>
      `;
      return null;
    }

    const selectedId = enabledMethods.some(pm => pm.id === currentSelectedId)
      ? currentSelectedId
      : enabledMethods[0].id;

    containerEl.innerHTML = enabledMethods.map(pm => {
      const isSelected = pm.id === selectedId;
      const subtitle = pm.id === 'vodafone' ? 'محفظة كاش إلكترونية' : (pm.id === 'instapay' ? 'تحويل بنكي ولحظي' : (pm.id === 'telda' ? 'بطاقة وتطبيق تيلدا' : 'تحويل مباشر'));
      return `
        <div class="payment-card ${isSelected ? 'selected' : ''}" data-pm-id="${esc(pm.id)}">
          <div class="payment-card-header">
            <div class="payment-card-main">
              <span class="custom-radio ${isSelected ? 'checked' : ''}" aria-hidden="true"></span>
              <input type="radio" name="${esc(radioName)}" value="${esc(pm.id)}" ${isSelected ? 'checked' : ''} style="display:none;">
              <div class="payment-icon-wrap">
                ${icon(pm.icon || 'wallet-cards')}
              </div>
              <div class="payment-info-title">
                <strong>${esc(pm.name)}</strong>
                <span class="payment-sub">${subtitle}</span>
              </div>
            </div>
            ${pm.number ? `<span class="payment-quick-tag" dir="ltr">${esc(pm.number)}</span>` : ''}
          </div>

          <div class="payment-details-drawer ${isSelected ? 'open' : ''}">
            <div class="payment-drawer-content">
              ${pm.number ? `
                <div class="drawer-field">
                  <span class="drawer-label">رقم التحويل / المحفظة:</span>
                  <div class="drawer-val-group">
                    <code class="drawer-val" dir="ltr">${esc(pm.number)}</code>
                    <button type="button" class="drawer-copy-btn" data-copy-type="number" data-value="${esc(pm.number)}" title="نسخ رقم التحويل">
                      ${icon('copy')}
                      <span>نسخ الرقم</span>
                    </button>
                  </div>
                </div>
              ` : ''}

              ${pm.accountName ? `
                <div class="drawer-field">
                  <span class="drawer-label">اسم صاحب الحساب / المعرف:</span>
                  <div class="drawer-val-group">
                    <code class="drawer-val">${esc(pm.accountName)}</code>
                    <button type="button" class="drawer-copy-btn" data-copy-type="account" data-value="${esc(pm.accountName)}" title="نسخ اسم الحساب">
                      ${icon('copy')}
                      <span>نسخ الاسم</span>
                    </button>
                  </div>
                </div>
              ` : ''}

              ${pm.link ? `
                <div class="drawer-field">
                  <span class="drawer-label">رابط الدفع المباشر:</span>
                  <div class="drawer-val-group">
                    <button type="button" class="drawer-copy-btn" data-copy-type="link" data-value="${esc(pm.link)}" title="نسخ رابط الدفع">
                      ${icon('copy')}
                      <span>نسخ الرابط</span>
                    </button>
                    <a href="${esc(pm.link)}" target="_blank" rel="noopener noreferrer" class="drawer-link-btn" title="فتح رابط الدفع في نافذة جديدة">
                      ${icon('external-link')}
                      <span>فتح الرابط</span>
                    </a>
                  </div>
                </div>
              ` : ''}

              ${pm.description ? `
                <div class="drawer-desc">${esc(pm.description)}</div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    return selectedId;
  }

  function setupPaymentListListeners(containerEl, onSelectionChange) {
    if (!containerEl) return;
    containerEl.addEventListener('click', async event => {
      const copyBtn = event.target.closest('[data-copy-type]');
      if (copyBtn) {
        event.stopPropagation();
        event.preventDefault();
        const type = copyBtn.dataset.copyType;
        const val = copyBtn.dataset.value;
        const label = type === 'number' ? 'رقم التحويل' : (type === 'account' ? 'اسم صاحب الحساب' : 'رابط الدفع');
        await copyPaymentText(val, label);
        const originalHtml = copyBtn.innerHTML;
        copyBtn.innerHTML = `${icon('check')} <span>تم النسخ!</span>`;
        setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 1800);
        return;
      }

      const linkBtn = event.target.closest('.drawer-link-btn');
      if (linkBtn) {
        event.stopPropagation();
        return;
      }

      const card = event.target.closest('.payment-card');
      if (card) {
        const pmId = card.dataset.pmId;
        containerEl.querySelectorAll('.payment-card').forEach(c => {
          const isThis = c.dataset.pmId === pmId;
          c.classList.toggle('selected', isThis);
          const radioSpan = c.querySelector('.custom-radio');
          if (radioSpan) radioSpan.classList.toggle('checked', isThis);
          const drawer = c.querySelector('.payment-details-drawer');
          if (drawer) drawer.classList.toggle('open', isThis);
        });
        if (typeof onSelectionChange === 'function') {
          onSelectionChange(pmId);
        }
      }
    });
  }

  setupPaymentListListeners($('dialogPaymentMethods'), id => {
    dialogSelectedPaymentId = id;
  });

  setupPaymentListListeners($('cartPaymentMethods'), id => {
    cartSelectedPaymentId = id;
  });

  // --- Trust & Testimonials Dynamic Rendering ---
  function renderTrustAndTestimonials() {
    const trustGrid = $('trustGrid');
    if (trustGrid && (!trustGrid.children.length || trustGrid.dataset.rendered !== 'true')) {
      const badges = Config.TRUST_BADGES || [];
      trustGrid.innerHTML = badges.map(b => `
        <div class="trust-card">
          <div class="trust-icon">${icon(b.icon)}</div>
          <div class="trust-info">
            <h3>${esc(b.title)}</h3>
            <p>${esc(b.desc)}</p>
          </div>
        </div>
      `).join('');
      trustGrid.dataset.rendered = 'true';
    }

    const testGrid = $('testimonialsGrid');
    if (testGrid && (!testGrid.children.length || testGrid.dataset.rendered !== 'true')) {
      const testimonials = Config.TESTIMONIALS || [];
      testGrid.innerHTML = testimonials.map(t => {
        const starCount = Math.min(5, Math.max(1, t.rating || 5));
        const starsHtml = Array.from({ length: starCount }, () => icon('star')).join('');
        return `
          <article class="testimonial-card">
            <div class="testimonial-header">
              <div class="testimonial-stars" aria-label="تقييم ${starCount} من 5 نجوم">
                ${starsHtml}
              </div>
              <span class="testimonial-date">${esc(t.date)}</span>
            </div>
            <p class="testimonial-comment">"${esc(t.comment)}"</p>
            <div class="testimonial-author">
              <div class="author-meta">
                <strong>${esc(t.name)}</strong>
                <span class="verified-tag">${icon('check-check')} مشترٍ موثق</span>
              </div>
              <span class="service-tag">${esc(t.service)}</span>
            </div>
          </article>
        `;
      }).join('');
      testGrid.dataset.rendered = 'true';
    }
  }

  // --- Storefront Rendering ---
  function renderStore() {
    const data = viewData();
    const s = data.settings;

    // Header & Announcements
    if ($('announcementText')) $('announcementText').textContent = s.announcement;
    if ($('announcementPhone')) $('announcementPhone').textContent = s.paymentPhone;
    if ($('announcementHours')) $('announcementHours').textContent = s.workingHours || 'متاحون يوميًا من 10 ص حتى 2 ص';
    if ($('footerTagline')) $('footerTagline').textContent = s.tagline;
    if ($('footerStoreName')) $('footerStoreName').textContent = s.storeName;
    if ($('faqPayment')) $('faqPayment').textContent = s.paymentPhone;
    if ($('currentYear')) $('currentYear').textContent = new Date().getFullYear();

    // InstaPay quick copy visibility in hero and footer: strictly respects enabled flag
    const instapayMethod = (data.paymentMethods || []).find(m => (m.id === 'instapay' || m.id.includes('insta')) && m.enabled);
    const hasInsta = Boolean(instapayMethod);
    if ($('heroInstaBtn')) $('heroInstaBtn').hidden = !hasInsta;
    if ($('footerInstaBtn')) $('footerInstaBtn').hidden = !hasInsta;

    const visibleServices = data.services.filter(srv => srv.visible);
    if ($('serviceCount')) $('serviceCount').textContent = visibleServices.length;

    // Social media links (Facebook, Instagram, TikTok, Telegram)
    const showFb = Boolean(s.facebook && s.facebookEnabled !== false);
    const showIg = Boolean(s.instagram && s.instagramEnabled !== false);
    const showTiktok = Boolean(s.tiktok && s.tiktokEnabled !== false);
    const showTelegram = Boolean(s.telegram && s.telegramEnabled !== false);

    if ($('facebookLink')) {
      $('facebookLink').hidden = !showFb;
      if (showFb) $('facebookLink').href = s.facebook;
    }
    if ($('instagramLink')) {
      $('instagramLink').hidden = !showIg;
      if (showIg) $('instagramLink').href = s.instagram;
    }
    if ($('tiktokLink')) {
      $('tiktokLink').hidden = !showTiktok;
      if (showTiktok) $('tiktokLink').href = s.tiktok;
    }
    if ($('telegramLink')) {
      $('telegramLink').hidden = !showTelegram;
      if (showTelegram) $('telegramLink').href = s.telegram;
    }
    if ($('footerSocialLinks')) {
      $('footerSocialLinks').hidden = !showFb && !showIg && !showTiktok && !showTelegram;
    }

    document.title = `${s.storeName} | ${s.tagline}`;

    // Ensure selected category is valid
    if (!data.categories.some(c => c.id === category)) {
      category = 'all';
    }

    // Render Category Navigation Tabs with dynamic badges
    const allTab = { id: 'all', name: 'كل الخدمات', icon: 'layout-grid', count: visibleServices.length };
    const categoryTabs = [
      allTab,
      ...data.categories.map(c => ({
        ...c,
        count: visibleServices.filter(srv => srv.category === c.id).length
      }))
    ];

    $('categoryTabs').innerHTML = categoryTabs.map(c => `
      <button type="button" data-category="${esc(c.id)}" aria-pressed="${c.id === category}">
        ${icon(c.icon)}
        <span>${esc(c.name)}</span>
        <span class="category-count">${c.count}</span>
      </button>
    `).join('');

  // --- Dynamic Featured Card Rendering ---
  function renderFeaturedCard(cardData, visibleServices) {
    const heroFeatureEl = $('heroFeature');
    if (!heroFeatureEl) return;

    const isEnabled = cardData ? cardData.enabled !== false : true;
    if (!isEnabled) {
      heroFeatureEl.hidden = true;
      document.querySelector('.hero')?.classList.add('hero-without-feature');
      return;
    }

    heroFeatureEl.hidden = false;
    document.querySelector('.hero')?.classList.remove('hero-without-feature');

    // Theme classes
    const theme = cardData?.theme || 'red';
    heroFeatureEl.classList.remove('hero-theme-red', 'hero-theme-purple', 'hero-theme-blue', 'hero-theme-emerald', 'hero-theme-amber', 'hero-theme-dark');
    heroFeatureEl.classList.add(`hero-theme-${theme}`);

    // Resolve target service and plan
    const targetService = cardData?.serviceId
      ? visibleServices.find(srv => srv.id === cardData.serviceId)
      : (visibleServices.find(srv => srv.id === 'pubg') || visibleServices.find(srv => srv.featured));

    const targetPlan = (targetService && cardData?.planId)
      ? targetService.plans?.find(p => p.id === cardData.planId)
      : (targetService?.plans?.find(p => p.id === 'pubg-3' && p.available) || targetService?.plans?.find(p => p.available));

    // Badge
    if ($('heroBadge')) {
      $('heroBadge').textContent = cardData?.badge || 'الأكثر طلبًا';
    }

    // Icon / Image
    if ($('heroIcon')) {
      const iconVal = cardData?.icon || 'gamepad-2';
      if (iconVal.startsWith('http://') || iconVal.startsWith('https://') || iconVal.startsWith('data:') || iconVal.startsWith('./') || iconVal.startsWith('/')) {
        $('heroIcon').innerHTML = `<img src="${esc(iconVal)}" alt="أيقونة العرض" style="width:24px;height:24px;object-fit:contain;">`;
      } else {
        $('heroIcon').innerHTML = icon(iconVal);
      }
    }

    // Titles
    if ($('heroTitleLine1')) {
      $('heroTitleLine1').textContent = cardData?.titleLine1 || 'PLAY MORE';
    }
    if ($('heroTitleLine2')) {
      $('heroTitleLine2').textContent = cardData?.titleLine2 || 'WITH KENO.';
    }

    // Description
    if ($('heroDescription')) {
      $('heroDescription').textContent = cardData?.description || (targetService ? targetService.description : 'شحن فوري ومضمون مع كينو.');
    }

    // Offer Quantity
    if ($('heroQuantity')) {
      const qVal = String(cardData?.offerQuantity || (targetPlan ? targetPlan.label : '325 شدة')).trim();
      const match = qVal.match(/^(\d+[\d.,]*)\s*(.*)$/);
      if (match) {
        $('heroQuantity').innerHTML = `${esc(match[1])} <small>${esc(match[2] || 'شدة')}</small>`;
      } else {
        $('heroQuantity').innerHTML = esc(qVal);
      }
    }

    // Offer Price
    if ($('heroPrice')) {
      const pVal = String(cardData?.offerPrice !== undefined && cardData?.offerPrice !== '' ? cardData.offerPrice : (targetPlan ? money(targetPlan.price) + ' جنيه' : '270 جنيه')).trim();
      const match = pVal.match(/^(\d+[\d.,]*)\s*(.*)$/);
      if (match) {
        $('heroPrice').innerHTML = `${esc(match[1])} <small>${esc(match[2] || 'جنيه')}</small>`;
      } else {
        $('heroPrice').innerHTML = esc(pVal);
      }
    }

    // Action button
    const heroBtn = $('heroActionButton') || heroFeatureEl.querySelector('[data-open-service]');
    if (heroBtn) {
      if ($('heroButtonText')) {
        $('heroButtonText').textContent = cardData?.buttonText || 'اطلب العرض الآن';
      }
      const srvId = cardData?.serviceId || targetService?.id;
      const plnId = cardData?.planId || targetPlan?.id;
      if (srvId) {
        heroBtn.dataset.openService = srvId;
        if (plnId) {
          heroBtn.dataset.plan = plnId;
        } else {
          delete heroBtn.dataset.plan;
        }
      }
    }

    // Tagline
    if ($('heroTagline')) {
      $('heroTagline').textContent = cardData?.tagline || 'KENO / FEATURED';
    }
  }

  // Hero Featured Offer (Dynamic from catalog config)
  renderFeaturedCard(data.featuredCard, visibleServices);

    renderTrustAndTestimonials();
    renderGrid();
    renderCart();
  }

  function renderGrid() {
    const data = viewData();
    const services = SearchEngine.filter(data, { query, category, sort });

    if ($('resultsTitle')) {
      $('resultsTitle').textContent = query
        ? 'نتائج البحث'
        : (category === 'all' ? 'كل الخدمات' : (data.categories.find(c => c.id === category)?.name || 'الخدمات'));
    }

    if ($('resultCount')) {
      $('resultCount').textContent = `${services.length} خدمة متاحة`;
    }

    if ($('emptyState')) $('emptyState').hidden = services.length > 0;
    if ($('clearSearch')) $('clearSearch').hidden = !query;

    const grid = $('serviceGrid');
    if (!grid) return;

    grid.innerHTML = services.map(s => {
      const minPrice = SearchEngine.minPrice(s);
      const cat = data.categories.find(c => c.id === s.category);
      const toneClass = `tone-${s.color || 'red'}`;

      const hasImage = Boolean(s.image);
      let visualHtml = '';
      if (hasImage) {
        visualHtml = `
          <img class="service-image" src="${esc(s.image)}" alt="${esc(s.name)}" loading="lazy" decoding="async" ${ImageUtils.getFallbackAttr?.() || ''}>
          <span class="fallback-icon" style="display:none;">${icon(s.icon)}</span>
        `;
      } else {
        visualHtml = `
          ${icon(s.icon)}
          <span class="card-mark" dir="auto">${esc(s.mark || 'KENO')}</span>
        `;
      }

      // Check for lowest price plan with discount
      let priceDisplayHtml = '';
      if (minPrice !== null) {
        const minPlan = (s.plans || []).find(p => p.price === minPrice && p.available);
        if (minPlan && minPlan.originalPrice && minPlan.originalPrice > minPrice) {
          const saving = Math.round((minPlan.originalPrice - minPrice) * 100) / 100;
          priceDisplayHtml = `
            <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px;">
              <strong><bdi>${money(minPrice)}</bdi> <small>جنيه</small></strong>
              <del class="original-price">${money(minPlan.originalPrice)}</del>
              <span class="saving-badge">وفر ${money(saving)} ج.م</span>
            </div>
          `;
        } else {
          priceDisplayHtml = `<strong><bdi>${money(minPrice)}</bdi> <small>جنيه</small></strong>`;
        }
      } else {
        priceDisplayHtml = `<strong class="quote-price">${s.plans?.length ? 'غير متاحة حاليًا' : 'حسب الطلب'}</strong>`;
      }

      const isUnavailable = s.available === false || s.status === 'unavailable';
      let badgeHtml = '';
      if (isUnavailable) {
        badgeHtml = '<span class="card-badge unavailable-badge">غير متاح حاليًا</span>';
      } else if (s.badge) {
        badgeHtml = `<span class="card-badge">${esc(s.badge)}</span>`;
      }

      return `
        <article class="service-card ${isUnavailable ? 'is-unavailable' : ''}" data-open-service="${esc(s.id)}" role="button" tabindex="0" aria-label="${esc('عرض وتفاصيل خدمة ' + s.name)}">
          <div class="card-visual ${hasImage ? 'has-image' : toneClass}">
            ${badgeHtml}
            ${visualHtml}
          </div>
          <div class="card-body">
            <div class="card-category">
              <span>${esc(cat?.name || '')}</span>
              ${s.featured ? '<span class="featured-tag">مختارات كينو</span>' : ''}
            </div>
            <h3 dir="auto">${esc(s.name)}</h3>
            <p class="card-description">${esc(s.description)}</p>
            <div class="card-footer">
              <div class="card-price">
                <span>${minPrice === null ? 'السعر' : 'تبدأ من'}</span>
                ${priceDisplayHtml}
              </div>
              <button type="button" class="card-open" data-open-service="${esc(s.id)}" aria-label="${esc('عرض تفاصيل ' + s.name)}">
                <span>${s.plans?.length ? 'الباقات' : 'طلب السعر'}</span>
                ${icon('arrow-left')}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  // --- Filtering & Search Event Handlers ---
  function applyFilters() {
    query = $('searchInput')?.value || '';
    sort = $('sortSelect')?.value || 'featured';
    renderGrid();
  }

  $('searchInput')?.addEventListener('input', applyFilters);
  $('sortSelect')?.addEventListener('change', applyFilters);

  $('categoryTabs')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-category]');
    if (!btn) return;
    category = btn.dataset.category;
    $('categoryTabs').querySelectorAll('button').forEach(el => {
      el.setAttribute('aria-pressed', String(el === btn));
    });
    renderGrid();
  });

  function resetFilters() {
    category = 'all';
    query = '';
    sort = 'featured';
    if ($('searchInput')) $('searchInput').value = '';
    if ($('sortSelect')) $('sortSelect').value = 'featured';
    renderStore();
  }

  $('clearSearch')?.addEventListener('click', () => {
    if ($('searchInput')) {
      $('searchInput').value = '';
      applyFilters();
      $('searchInput').focus();
    }
  });
  $('resetFilters')?.addEventListener('click', resetFilters);

  // --- Order Dialog & Workflow ---
  function openService(idOrService, planId) {
    const data = viewData();
    let service;
    if (typeof idOrService === 'object' && idOrService !== null) {
      service = idOrService;
    } else {
      service = data.services.find(s => s.id === idOrService && (adminOpen || s.visible));
    }
    if (!service) {
      toast('الخدمة غير متاحة حاليًا.');
      return;
    }

    selectedService = service.id;
    selectedPlan = (service.plans || []).some(p => p.id === planId && p.available) ? planId : ((service.plans || []).find(p => p.available)?.id || null);

    const categoryObj = data.categories.find(c => c.id === service.category);
    const categoryName = categoryObj?.name || 'خدمات كينو';

    if ($('serviceDialogTitle')) $('serviceDialogTitle').textContent = service.name;
    if ($('summaryServiceName')) $('summaryServiceName').textContent = service.name;
    if ($('dialogCategory')) $('dialogCategory').textContent = categoryName;
    if ($('dialogDescription')) $('dialogDescription').textContent = service.description || '';

    // Hero Banner for Services with Images or Prominent Visual Fallback
    const bannerContainer = $('serviceDialogBanner');
    if (bannerContainer) {
      if (service.image) {
        bannerContainer.hidden = false;
        bannerContainer.className = 'dialog-service-banner has-image';
        bannerContainer.innerHTML = `<img id="serviceDialogBannerImg" src="${esc(service.image)}" alt="${esc(service.name)}" loading="lazy" decoding="async">`;
      } else {
        bannerContainer.hidden = false;
        const toneClass = `tone-${service.color || 'blue'}`;
        bannerContainer.className = `dialog-service-banner is-fallback ${toneClass}`;
        bannerContainer.innerHTML = `
          <div class="dialog-banner-inner">
            <div class="banner-fallback-icon">${icon(service.icon || 'sparkles')}</div>
            <div class="banner-fallback-mark">${esc(service.mark || 'KENO')}</div>
          </div>
        `;
      }
    }

    // Smart contextual prompt for customer account based on category & per-service custom field
    const catId = service.category || '';
    const badgeEl = $('accountFieldBadge');
    const descEl = $('accountFieldDesc');
    const accountInput = $('customerAccount');
    if (service.accountFieldLabel || service.accountFieldPlaceholder) {
      if (badgeEl) { badgeEl.textContent = 'مطلوب للتنفيذ'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = service.accountFieldDesc || `يرجى إدخال ${service.accountFieldLabel || 'البيانات المطلوبة'}`;
      if (accountInput) accountInput.placeholder = service.accountFieldPlaceholder || 'أدخل البيانات المطلوبة هنا...';
    } else if (catId === 'games') {
      if (badgeEl) { badgeEl.textContent = 'مطلوب للشحن الفوري'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل معرف اللاعب (Player ID) الخاص بك للشحن التلقائي فوراً.';
      if (accountInput) accountInput.placeholder = 'مثال: PUBG ID أو Free Fire Player ID أو معرف اللعبة';
    } else if (catId === 'entertainment') {
      if (badgeEl) { badgeEl.textContent = 'مطلوب لتفعيل الاشتراك'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل البريد الإلكتروني أو الحساب المطلوب تفعيل الباقة عليه.';
      if (accountInput) accountInput.placeholder = 'example@gmail.com أو اسم الحساب';
    } else if (catId === 'ai') {
      if (badgeEl) { badgeEl.textContent = 'مطلوب لتفعيل الحساب'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل البريد الإلكتروني لتفعيل اشتراك الذكاء الاصطناعي (ChatGPT / Claude / إلخ).';
      if (accountInput) accountInput.placeholder = 'your-email@gmail.com';
    } else if (catId === 'apps') {
      if (badgeEl) { badgeEl.textContent = 'مطلوب للتفعيل'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل البريد الإلكتروني أو بيانات الحساب المراد تفعيل التطبيق عليه.';
      if (accountInput) accountInput.placeholder = 'البريد الإلكتروني أو رقم الهاتف المسجل';
    } else if (catId === 'payments') {
      if (badgeEl) { badgeEl.textContent = 'بيانات التحويل'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل رقم المحفظة أو الحساب البنكي أو عنوان InstaPay المراد التحويل له.';
      if (accountInput) accountInput.placeholder = '01xxxxxxxxx أو عنوان إنستاباي';
    } else if (catId === 'marketing') {
      if (badgeEl) { badgeEl.textContent = 'تفاصيل الطلب'; badgeEl.className = 'account-badge-pill'; }
      if (descEl) descEl.textContent = 'أدخل رابط الصفحة أو تفاصيل الحملة الإعلانية أو التصميم المطلوب بدقة.';
      if (accountInput) accountInput.placeholder = 'رابط الصفحة أو المنشور أو وصف الطلب';
    } else if (catId === 'social') {
      if (badgeEl) { badgeEl.textContent = 'رابط الحساب / الصفحة'; badgeEl.className = 'account-badge-pill required-pill'; }
      if (descEl) descEl.textContent = 'أدخل رابط الحساب أو القناة أو المنشور المراد تزويده.';
      if (accountInput) accountInput.placeholder = 'https://instagram.com/username أو رابط الحساب';
    } else {
      if (badgeEl) { badgeEl.textContent = 'مطلوب للتنفيذ'; badgeEl.className = 'account-badge-pill'; }
      if (descEl) descEl.textContent = 'اكتب رقم الهاتف أو المعرف المراد شحنه أو تقديم الخدمة له.';
      if (accountInput) accountInput.placeholder = 'معرف الحساب أو رقم الهاتف أو الرابط';
    }

    // Service terms/notes
    const notesContainer = $('serviceNotes');
    if (notesContainer) {
      notesContainer.hidden = !service.notes || service.notes.length === 0;
      notesContainer.innerHTML = '<div class="service-notes-header"><i data-icon="alert-circle"></i><span>تنبيهات وملاحظات الخدمة</span></div><ul>' + (service.notes || []).map(n => `<li>${esc(n)}</li>`).join('') + '</ul>';
    }

    // Plan selector groups
    const groups = [...new Set((service.plans || []).map(p => p.group || 'الباقات المتاحة'))];
    const planGroupsContainer = $('planGroups');
    if (planGroupsContainer) {
      if (service.plans.length > 0) {
        planGroupsContainer.innerHTML = groups.map(group => {
          const groupPlans = service.plans.filter(p => (p.group || 'الباقات المتاحة') === group);
          return `
          <fieldset class="plan-group">
            <legend><i data-icon="sparkles"></i> ${esc(group)}</legend>
            <div class="plan-grid">
              ${groupPlans.map(p => {
                const isSelected = selectedPlan === p.id;
                const hasDiscount = p.originalPrice && p.originalPrice > p.price;
                const savings = hasDiscount ? Math.round(p.originalPrice - p.price) : 0;
                const discountPct = hasDiscount ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
                return `
                <label class="plan-option ${isSelected ? 'selected' : ''} ${hasDiscount ? 'has-discount' : ''}" data-plan-id="${esc(p.id)}">
                  <input type="radio" name="customer-plan" value="${esc(p.id)}" ${isSelected ? 'checked' : ''} ${!p.available ? 'disabled' : ''}>
                  <div class="plan-card-top">
                    <span class="plan-label">${esc(p.label)}</span>
                    ${hasDiscount ? `<span class="plan-discount-tag">وفر ${savings} ج.م (${discountPct}%)</span>` : ''}
                  </div>
                  <div class="plan-price-row">
                    <span class="plan-price"><bdi>${money(p.price)}</bdi> <small>جنيه</small></span>
                    ${hasDiscount ? `<del class="plan-old-price"><bdi>${money(p.originalPrice)}</bdi></del>` : ''}
                  </div>
                  ${p.note ? `<span class="plan-note">${esc(p.note)}</span>` : ''}
                  ${!p.available ? '<span class="plan-note out-of-stock">غير متاحة حاليًا</span>' : ''}
                </label>
              `;
              }).join('')}
            </div>
          </fieldset>
        `;
        }).join('');
      } else {
        planGroupsContainer.innerHTML = `
          <div class="custom-quote-notice">
            <i data-icon="message-square"></i>
            <span>هذه الخدمة تتطلب تسعيراً مخصصاً؛ اكتب مواصفاتك واطلب فوراً عبر واتساب.</span>
          </div>
        `;
      }
    }

    // On-demand quote inputs
    if ($('quoteFields')) $('quoteFields').hidden = service.plans.length > 0;
    if ($('quoteDetails')) $('quoteDetails').value = '';
    if ($('customerAccount')) $('customerAccount').value = '';
    if ($('orderNote')) $('orderNote').value = '';
    if ($('transferNumber')) $('transferNumber').value = '';

    // Render dynamic enabled payment methods
    dialogSelectedPaymentId = renderPaymentMethodsList($('dialogPaymentMethods'), dialogSelectedPaymentId, 'dialog-payment');

    updateSelectedPlan();
    if (window.Icons && typeof window.Icons.hydrate === 'function') {
      window.Icons.hydrate();
    }
    $('serviceDialog').showModal();
  }

  function updateSelectedPlan() {
    const service = viewData().services.find(s => s.id === selectedService);
    if (!service) return;

    const plan = service.plans.find(p => p.id === selectedPlan && p.available);
    const planName = plan
      ? plan.label
      : (service.plans.length ? 'اختار الباقة المناسبة' : 'سعر حسب مواصفات طلبك');
    const priceText = plan ? `${money(plan.price)} جنيه` : (service.plans.length ? '0 جنيه' : 'حسب المواصفات');

    // Update Dialog footer labels
    if ($('selectedPlanLabel')) $('selectedPlanLabel').textContent = planName;
    if ($('summaryPlanLabel')) $('summaryPlanLabel').textContent = planName;
    if ($('selectedPrice')) $('selectedPrice').textContent = priceText;
    if ($('footerDisplayPrice')) $('footerDisplayPrice').textContent = priceText;

    // Update discounts & savings badges
    const origPriceEl = $('selectedOriginalPrice');
    const savingsBadgeEl = $('summarySavingsBadge');
    if (plan && plan.originalPrice && plan.originalPrice > plan.price) {
      const diff = Math.round(plan.originalPrice - plan.price);
      if (origPriceEl) {
        origPriceEl.hidden = false;
        origPriceEl.textContent = `${money(plan.originalPrice)} ج.م`;
      }
      if (savingsBadgeEl) {
        savingsBadgeEl.hidden = false;
        savingsBadgeEl.textContent = `وفرت ${diff} ج.م 🔥`;
      }
    } else {
      if (origPriceEl) origPriceEl.hidden = true;
      if (savingsBadgeEl) savingsBadgeEl.hidden = true;
    }

    // Disable buttons if service is marked unavailable or service has plans but no available plan is selected
    const isUnavailable = service.available === false || service.status === 'unavailable';
    const isDisabled = isUnavailable || (service.plans.length > 0 && !plan);
    if ($('orderButton')) {
      $('orderButton').disabled = isDisabled;
      if (isUnavailable) {
        $('orderButton').textContent = 'الخدمة غير متاحة حالياً';
      } else {
        $('orderButton').textContent = 'اطلب الآن عبر واتساب';
      }
    }
    if ($('addToCartBtn')) {
      $('addToCartBtn').disabled = isDisabled;
      $('addToCartBtn').hidden = isUnavailable;
    }
  }

  $('planGroups')?.addEventListener('change', event => {
    if (event.target.name === 'customer-plan') {
      selectedPlan = event.target.value;
      $('planGroups').querySelectorAll('.plan-option').forEach(opt => {
        const inp = opt.querySelector('input');
        opt.classList.toggle('selected', inp?.checked);
      });
      updateSelectedPlan();
    }
  });

  // Realtime visual feedback for Customer Account field
  $('customerAccount')?.addEventListener('input', () => {
    const val = $('customerAccount').value.trim();
    const badge = $('accountFieldBadge');
    if (!badge) return;
    if (val.length > 2) {
      badge.textContent = 'تم الإدخال ✓';
      badge.className = 'account-badge-pill completed-pill';
    } else {
      const service = viewData().services.find(s => s.id === selectedService);
      const catId = service?.category || '';
      badge.textContent = (catId === 'games' ? 'مطلوب للشحن الفوري' : (catId === 'subscriptions' ? 'مطلوب لتفعيل الاشتراك' : 'مطلوب للتنفيذ'));
      badge.className = 'account-badge-pill required-pill';
    }
  });

  // --- Receipt Image Processing & Upload Helper ---
  function initReceiptUpload(dropzoneEl, fileInputEl, previewCardEl, previewImgEl, nameEl, sizeEl, removeBtnEl, changeBtnEl, onFileCompressed, onFileRemoved) {
    if (!dropzoneEl || !fileInputEl) return;

    dropzoneEl.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      fileInputEl.click();
    });

    ['dragenter', 'dragover'].forEach(evName => {
      dropzoneEl.addEventListener(evName, e => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(evName => {
      dropzoneEl.addEventListener(evName, e => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.remove('drag-over');
      });
    });

    dropzoneEl.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      const file = dt?.files?.[0];
      if (file) handleFile(file);
    });

    fileInputEl.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });

    changeBtnEl?.addEventListener('click', () => {
      fileInputEl.click();
    });

    removeBtnEl?.addEventListener('click', () => {
      fileInputEl.value = '';
      if (previewCardEl) previewCardEl.hidden = true;
      if (dropzoneEl) dropzoneEl.hidden = false;
      if (typeof onFileRemoved === 'function') onFileRemoved();
    });

    async function handleFile(file) {
      const loadingEl = dropzoneEl.querySelector('.dropzone-loading');
      const promptEl = dropzoneEl.querySelector('.dropzone-inner');
      try {
        if (loadingEl) loadingEl.hidden = false;
        if (promptEl) promptEl.hidden = true;

        const result = await KenoImage.compressReceipt(file);
        if (previewImgEl) previewImgEl.src = result.dataUrl;
        if (nameEl) nameEl.textContent = result.fileName;
        if (sizeEl) sizeEl.textContent = `${Math.round(result.compressedSize / 1024)} KB (مضغوطة)`;
        if (previewCardEl) previewCardEl.hidden = false;
        dropzoneEl.hidden = true;

        if (typeof onFileCompressed === 'function') onFileCompressed(result);
        toast('تم فحص وضغط صورة إيصال التحويل بنجاح.');
      } catch (err) {
        toast(err.message || 'حدث خطأ أثناء فحص وضغط صورة الإيصال.');
      } finally {
        if (loadingEl) loadingEl.hidden = true;
        if (promptEl) promptEl.hidden = false;
      }
    }
  }

  async function updateOrdersBadgeCount() {
    try {
      let orders = [];
      if (window.KenoFirebase && typeof window.KenoFirebase.getOrders === 'function') {
        orders = await window.KenoFirebase.getOrders();
      } else {
        orders = await KenoOrderStore.getOrders();
      }
      const count = orders.length;
      const badge = $('adminOrdersBadge');
      if (badge) {
        badge.textContent = count;
        badge.hidden = count === 0;
      }
    } catch (_) {}
  }

  function getOrderOptionsFromDialog() {
    const data = viewData();
    const pm = (data.paymentMethods || []).find(m => m.id === dialogSelectedPaymentId && m.enabled) || null;
    return {
      quoteDetails: $('quoteDetails')?.value.trim() || '',
      customerAccount: $('customerAccount')?.value.trim() || '',
      paymentMethod: pm,
      hasTransferred: Boolean($('transferNumber')?.value.trim().length > 0),
      hasReceipt: false,
      receipt: null,
      transferNumber: $('transferNumber')?.value.trim() || '',
      orderNote: $('orderNote')?.value.trim() || ''
    };
  }

  // Instant 1-Click WhatsApp Order
  $('orderButton')?.addEventListener('click', async () => {
    try {
      const data = viewData();
      const service = data.services.find(s => s.id === selectedService);
      const plan = service?.plans.find(p => p.id === selectedPlan) || null;
      const options = getOrderOptionsFromDialog();
      const orderCode = OrderUtils.generateOrderCode();
      options.orderCode = orderCode;

      // Save order record to KenoOrderStore
      const orderObj = {
        id: orderCode,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString('ar-EG'),
        type: 'single',
        items: [{
          serviceName: service?.name || '',
          planLabel: plan?.label || options.quoteDetails || 'خدمة حسب الطلب',
          quantity: 1,
          price: plan?.price || 0
        }],
        total: plan?.price || 0,
        paymentMethod: options.paymentMethod ? options.paymentMethod.name + (options.paymentMethod.number ? ` (${options.paymentMethod.number})` : '') : 'فودافون كاش / إنستاباي',
        paymentMethodId: options.paymentMethod?.id || '',
        customerAccount: options.customerAccount,
        transferNumber: options.transferNumber,
        hasReceipt: options.hasReceipt,
        receipt: options.receipt,
        notes: options.orderNote,
        status: 'pending'
      };

      // 1. Validate WhatsApp number exists and is valid
      const storePhone = data?.settings?.whatsapp;
      if (!OrderUtils.isValidWhatsAppNumber(storePhone)) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      // 2. Generate and validate WhatsApp URL synchronously before opening to prevent popup blocking
      let url = '';
      try {
        url = OrderUtils.buildOrderUrl(data, selectedService, selectedPlan, options);
      } catch (_) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      if (!url || typeof url !== 'string' || !url.startsWith('https://wa.me/')) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      // 3. Save order record to KenoOrderStore / Firebase in the background (prevents gesture expiration)
      (async () => {
        try {
          if (window.KenoFirebase && typeof window.KenoFirebase.createOrder === 'function') {
            await window.KenoFirebase.createOrder(orderObj);
          } else {
            await KenoOrderStore.saveOrder(orderObj);
          }
          updateOrdersBadgeCount();
        } catch (_) {}
      })();

      // 4. Open WhatsApp immediately with 1-click
      const opened = OrderUtils.openWhatsApp(url);
      if (!opened) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      closeDialog('serviceDialog');
      toast(`تم تجهيز طلبك ${orderCode}. جاري فتح واتساب...`);
    } catch (error) {
      console.error('Order error:', error);
      toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
    }
  });

  // Copy Single Order Details
  $('copyOrderButton')?.addEventListener('click', async () => {
    try {
      const data = viewData();
      const service = data.services.find(s => s.id === selectedService);
      if (!service) return;
      const plan = service.plans.find(p => p.id === selectedPlan) || null;
      const options = getOrderOptionsFromDialog();
      const text = OrderUtils.buildOrderText(data, service, plan, options);
      const success = await OrderUtils.copyToClipboard(text);
      if (success) {
        toast('تم نسخ تفاصيل الطلب بنجاح. يمكنك لصقها في واتساب الآن.');
      }
    } catch (error) {
      toast(error.message);
    }
  });

  // Share Service Direct Deep Link
  $('shareServiceBtn')?.addEventListener('click', async () => {
    if (!selectedService) return;
    const url = `${location.origin}${location.pathname}#service/${selectedService}${selectedPlan ? '/' + selectedPlan : ''}`;
    const success = await OrderUtils.copyToClipboard(url);
    if (success) {
      toast('تم نسخ رابط الخدمة المباشر بنجاح 🔗');
    } else {
      toast(`رابط الخدمة: ${url}`);
    }
  });

  // --- Multi-Item Cart Manager (سلة الطلبات المجمعة) ---
  const CART_STORAGE_KEY = 'keno.cart.v1';

  function getCartItems() {
    try {
      const raw = storageGet(CART_STORAGE_KEY);
      const list = JSON.parse(raw || '[]');
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveCartItems(items) {
    storageSet(CART_STORAGE_KEY, JSON.stringify(items));
    renderCart();
  }

  function addToCart(serviceId, planId, quantity = 1) {
    const data = viewData();
    const service = data.services.find(s => s.id === serviceId && s.visible);
    if (!service) {
      toast('الخدمة غير متوفرة حاليًا.');
      return;
    }

    const plan = service.plans.find(p => p.id === planId && p.available);
    if (!plan && service.plans.length > 0) {
      toast('يرجى اختيار باقة متاحة أولًا.');
      return;
    }

    const items = getCartItems();
    const existing = items.find(it => it.serviceId === serviceId && it.planId === planId);

    if (existing) {
      existing.quantity = Math.min(99, (existing.quantity || 1) + quantity);
    } else {
      items.push({
        serviceId,
        planId: plan ? plan.id : null,
        quantity: Math.max(1, quantity),
        addedAt: Date.now()
      });
    }

    saveCartItems(items);
    toast(`تمت إضافة "${plan ? plan.label : service.name}" إلى سلة الطلبات 🛒`);
  }

  function removeFromCart(index) {
    const items = getCartItems();
    if (index >= 0 && index < items.length) {
      items.splice(index, 1);
      saveCartItems(items);
      toast('تمت إزالة المنتج من السلة.');
    }
  }

  function updateCartQuantity(index, delta) {
    const items = getCartItems();
    if (index >= 0 && index < items.length) {
      const newQty = (items[index].quantity || 1) + delta;
      if (newQty <= 0) {
        removeFromCart(index);
      } else {
        items[index].quantity = Math.min(99, newQty);
        saveCartItems(items);
      }
    }
  }

  function clearCart() {
    saveCartItems([]);
    toast('تم تفريغ سلة الطلبات.');
  }

  function openCart() {
    if ($('cartDrawer')) $('cartDrawer').hidden = false;
    if ($('cartBackdrop')) $('cartBackdrop').hidden = false;
    renderCart();
  }

  function closeCart() {
    if ($('cartDrawer')) $('cartDrawer').hidden = true;
    if ($('cartBackdrop')) $('cartBackdrop').hidden = true;
  }

  function renderCart() {
    const data = viewData();
    const rawItems = getCartItems();

    // Map cart items against active catalog
    const validItems = [];
    rawItems.forEach(it => {
      const srv = data.services.find(s => s.id === it.serviceId && s.visible);
      if (srv) {
        const pln = srv.plans.find(p => p.id === it.planId && p.available);
        if (pln || srv.plans.length === 0) {
          validItems.push({
            ...it,
            service: srv,
            plan: pln || { id: null, label: 'خدمة حسب الطلب', price: 0 }
          });
        }
      }
    });

    const totalCount = validItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const grandTotal = validItems.reduce((acc, it) => acc + ((it.plan?.price || 0) * (it.quantity || 1)), 0);

    // Update Badges
    const countBadges = [$('cartCountBadge'), $('mobileCartBadge')];
    countBadges.forEach(badge => {
      if (badge) {
        badge.textContent = totalCount;
        badge.hidden = totalCount === 0;
      }
    });

    if ($('cartItemsCount')) $('cartItemsCount').textContent = totalCount;
    if ($('cartGrandTotal')) $('cartGrandTotal').textContent = `${money(grandTotal)} ج.م`;

    const emptyEl = $('cartEmptyState');
    const footerEl = $('cartFooter');
    const listEl = $('cartItemsList');
    const stepperBar = $('checkoutStepperBar');

    if (validItems.length === 0) {
      currentCheckoutStep = 1;
      cartUploadedReceipt = null;
      if (emptyEl) emptyEl.hidden = false;
      if (footerEl) footerEl.hidden = true;
      if (stepperBar) stepperBar.hidden = true;
      if (listEl) listEl.innerHTML = '';
      for (let s = 1; s <= 5; s++) {
        const panel = $(`checkoutStep${s}`);
        if (panel) panel.hidden = s !== 1;
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (footerEl) footerEl.hidden = false;
    if (stepperBar) stepperBar.hidden = false;

    if (listEl) {
      listEl.innerHTML = validItems.map((item, idx) => {
        const itemTotal = (item.plan.price || 0) * item.quantity;
        return `
          <div class="cart-item-card">
            <div class="cart-item-info">
              <div class="cart-item-title">${esc(item.service.name)}</div>
              <div class="cart-item-plan">${esc(item.plan.label)}</div>
              <div class="cart-item-price">${money(itemTotal)} ج.م <small style="color:var(--muted);font-weight:normal;">(${money(item.plan.price)} × ${item.quantity})</small></div>
            </div>
            <div class="cart-item-controls">
              <button type="button" class="cart-qty-btn" data-cart-action="dec" data-cart-index="${idx}" aria-label="تقليل الكمية">−</button>
              <span class="cart-qty-val">${item.quantity}</span>
              <button type="button" class="cart-qty-btn" data-cart-action="inc" data-cart-index="${idx}" aria-label="زيادة الكمية">+</button>
              <button type="button" class="cart-item-remove" data-cart-action="remove" data-cart-index="${idx}" aria-label="حذف">${icon('trash-2')}</button>
            </div>
          </div>
        `;
      }).join('');
    }

    setCheckoutStep(currentCheckoutStep);
  }

  // --- 4-Step Guided Checkout Controller ---
  let currentCheckoutStep = 1;

  function setCheckoutStep(step) {
    const rawItems = getCartItems();
    if (rawItems.length === 0 && step > 1) {
      step = 1;
    }
    currentCheckoutStep = Math.max(1, Math.min(4, step));

    // Update Progress Stepper Bar
    if ($('checkoutStepperBar')) {
      $('checkoutStepperBar').hidden = rawItems.length === 0;
    }
    const fillPercent = ((currentCheckoutStep - 0.5) / 3.5) * 100;
    if ($('stepperProgressFill')) {
      $('stepperProgressFill').style.width = `${Math.max(20, fillPercent)}%`;
    }

    // Update Step Indicators & Panels
    for (let s = 1; s <= 4; s++) {
      const ind = $(`stepIndicator${s}`);
      const panel = $(`checkoutStep${s}`);
      if (ind) {
        ind.classList.toggle('active', s === currentCheckoutStep);
        ind.classList.toggle('completed', s < currentCheckoutStep);
      }
      if (panel) {
        panel.hidden = s !== currentCheckoutStep;
      }
    }

    // Step-Specific Preparation
    if (currentCheckoutStep === 3) {
      cartSelectedPaymentId = renderPaymentMethodsList($('cartPaymentMethods'), cartSelectedPaymentId, 'cart-payment');
    } else if (currentCheckoutStep === 4) {
      renderInvoiceSummary();
    }

    // Update Stepper Navigation Buttons
    const prevBtn = $('cartPrevStepBtn');
    const nextBtn = $('cartNextStepBtn');
    const submitBtn = $('cartSubmitOrderBtn');
    const subActions = $('cartSubActions');

    if (prevBtn) prevBtn.hidden = currentCheckoutStep === 1;

    if (nextBtn && submitBtn) {
      if (currentCheckoutStep === 4) {
        nextBtn.hidden = true;
        submitBtn.hidden = false;
      } else {
        nextBtn.hidden = false;
        submitBtn.hidden = true;
        const labels = {
          1: 'متابعة للبيانات',
          2: 'متابعة لاختيار وسيلة الدفع',
          3: 'مراجعة وتأكيد الطلب'
        };
        const textSpan = nextBtn.querySelector('span');
        if (textSpan) textSpan.textContent = labels[currentCheckoutStep] || 'متابعة';
      }
    }

    if (subActions) {
      subActions.hidden = currentCheckoutStep !== 1;
    }

    if ($('cartBody')) $('cartBody').scrollTop = 0;
  }

  function renderInvoiceSummary() {
    const data = viewData();
    const rawItems = getCartItems();
    const validItems = [];
    rawItems.forEach(it => {
      const srv = data.services.find(s => s.id === it.serviceId && s.visible);
      if (srv) {
        const pln = srv.plans.find(p => p.id === it.planId && p.available);
        if (pln || srv.plans.length === 0) {
          validItems.push({
            service: srv,
            plan: pln || { id: null, label: 'خدمة حسب الطلب', price: 0 },
            quantity: it.quantity || 1
          });
        }
      }
    });

    const grandTotal = validItems.reduce((acc, it) => acc + ((it.plan?.price || 0) * it.quantity), 0);
    const pm = (data.paymentMethods || []).find(m => m.id === cartSelectedPaymentId && m.enabled);

    if ($('invoiceOrderCode')) {
      if (!$('invoiceOrderCode').dataset.code) {
        $('invoiceOrderCode').dataset.code = OrderUtils.generateOrderCode();
      }
      $('invoiceOrderCode').textContent = $('invoiceOrderCode').dataset.code;
    }

    if ($('invoiceDate')) {
      $('invoiceDate').textContent = new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    if ($('invoiceItemsSummary')) {
      $('invoiceItemsSummary').innerHTML = validItems.map(it => `
        <div class="invoice-item-row">
          <div class="invoice-item-name">
            <strong>${esc(it.service.name)}</strong>
            <span>${esc(it.plan.label)} (${it.quantity} × ${money(it.plan.price)} ج.م)</span>
          </div>
          <span class="invoice-item-price">${money((it.plan.price || 0) * it.quantity)} ج.م</span>
        </div>
      `).join('');
    }

    if ($('invoicePaymentName')) {
      $('invoicePaymentName').textContent = pm ? pm.name + (pm.number ? ` (${pm.number})` : '') : 'فودافون كاش / إنستاباي';
    }

    const accVal = $('cartCustomerAccount')?.value.trim();
    if ($('invoiceAccountRow')) {
      $('invoiceAccountRow').hidden = !accVal;
      if ($('invoiceAccountVal')) $('invoiceAccountVal').textContent = accVal || '';
    }

    if ($('invoiceReceiptStatus')) {
      $('invoiceReceiptStatus').className = 'status-pill active-pill';
      $('invoiceReceiptStatus').textContent = 'يُرسل في شات واتساب 💬';
    }

    if ($('invoiceTotalAmount')) {
      $('invoiceTotalAmount').textContent = `${money(grandTotal)} ج.م`;
    }
  }

  // Stepper Next Button
  $('cartNextStepBtn')?.addEventListener('click', () => {
    const rawItems = getCartItems();
    if (rawItems.length === 0) {
      toast('سلة الطلبات فارغة.');
      return;
    }

    if (currentCheckoutStep === 1) {
      setCheckoutStep(2);
    } else if (currentCheckoutStep === 2) {
      const acc = $('cartCustomerAccount')?.value.trim();
      if (!acc) {
        $('cartCustomerAccount')?.focus();
        toast('يرجى إدخال بيانات الحساب أو الـ ID للشحن للمتابعة.');
        return;
      }
      setCheckoutStep(3);
    } else if (currentCheckoutStep === 3) {
      setCheckoutStep(4);
    }
  });

  // Stepper Prev Button
  $('cartPrevStepBtn')?.addEventListener('click', () => {
    if (currentCheckoutStep > 1) {
      setCheckoutStep(currentCheckoutStep - 1);
    }
  });

  // Stepper Header Direct Click
  $('checkoutStepperBar')?.addEventListener('click', event => {
    const ind = event.target.closest('.step-indicator');
    if (!ind) return;
    const targetStep = Number(ind.dataset.step);
    if (targetStep) {
      const rawItems = getCartItems();
      if (rawItems.length === 0) return;
      if (targetStep > 2 && !$('cartCustomerAccount')?.value.trim()) {
        toast('يرجى كتابة بيانات الحساب أولاً.');
        setCheckoutStep(2);
        return;
      }
      setCheckoutStep(targetStep);
    }
  });

  // Add to Cart from Service Dialog
  $('addToCartBtn')?.addEventListener('click', () => {
    if (!selectedService) return;
    addToCart(selectedService, selectedPlan, 1);
    closeDialog('serviceDialog');
    currentCheckoutStep = 1;
    openCart();
  });

  // Cart Drawer Triggers
  $('headerCartBtn')?.addEventListener('click', () => {
    currentCheckoutStep = 1;
    openCart();
  });
  $('mobileCartBtn')?.addEventListener('click', () => {
    currentCheckoutStep = 1;
    openCart();
  });
  $('closeCartBtn')?.addEventListener('click', closeCart);
  $('cartBackdrop')?.addEventListener('click', closeCart);
  $('cartBrowseBtn')?.addEventListener('click', () => {
    closeCart();
    location.hash = '#catalog';
  });

  // Cart Items List Actions (Delegation)
  $('cartItemsList')?.addEventListener('click', event => {
    const btn = event.target.closest('[data-cart-action]');
    if (!btn) return;
    const action = btn.dataset.cartAction;
    const idx = Number(btn.dataset.cartIndex);
    if (action === 'inc') updateCartQuantity(idx, 1);
    else if (action === 'dec') updateCartQuantity(idx, -1);
    else if (action === 'remove') removeFromCart(idx);
  });

  // Cart WhatsApp Order Final Submission
  $('cartSubmitOrderBtn')?.addEventListener('click', async () => {
    try {
      const data = viewData();
      const rawItems = getCartItems();
      const validItems = [];

      rawItems.forEach(it => {
        const srv = data.services.find(s => s.id === it.serviceId && s.visible);
        if (srv) {
          const pln = srv.plans.find(p => p.id === it.planId && p.available);
          if (pln || srv.plans.length === 0) {
            validItems.push({
              service: srv,
              plan: pln || { id: null, label: 'خدمة حسب الطلب', price: 0 },
              quantity: it.quantity || 1
            });
          }
        }
      });

      if (validItems.length === 0) {
        toast('سلة الطلبات فارغة.');
        return;
      }

      const grandTotal = validItems.reduce((acc, it) => acc + ((it.plan?.price || 0) * it.quantity), 0);
      const pm = (data.paymentMethods || []).find(m => m.id === cartSelectedPaymentId && m.enabled) || null;
      const orderCode = $('invoiceOrderCode')?.dataset.code || OrderUtils.generateOrderCode();

      // Save Order Record into KenoOrderStore
      const orderObj = {
        id: orderCode,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString('ar-EG'),
        type: 'cart',
        items: validItems.map(it => ({
          serviceName: it.service.name,
          planLabel: it.plan.label,
          quantity: it.quantity,
          price: it.plan.price
        })),
        total: grandTotal,
        paymentMethod: pm ? pm.name + (pm.number ? ` (${pm.number})` : '') : 'فودافون كاش / إنستاباي',
        paymentMethodId: pm?.id || '',
        customerAccount: $('cartCustomerAccount')?.value.trim() || '',
        customerPhone: $('cartCustomerPhone')?.value.trim() || '',
        transferNumber: $('cartTransferNumber')?.value.trim() || '',
        hasReceipt: false,
        receipt: null,
        notes: $('cartOrderNote')?.value.trim() || '',
        status: 'pending'
      };

      // 1. Validate WhatsApp number exists and is valid
      const storePhone = data?.settings?.whatsapp;
      if (!OrderUtils.isValidWhatsAppNumber(storePhone)) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      // Build WhatsApp URL options
      const options = {
        customerAccount: orderObj.customerAccount,
        paymentMethod: pm,
        transferNumber: orderObj.transferNumber,
        hasReceipt: orderObj.hasReceipt,
        orderNote: orderObj.notes,
        orderCode: orderCode
      };

      // 2. Generate & validate WhatsApp URL synchronously before opening to prevent popup blocking
      let url = '';
      try {
        url = OrderUtils.buildCartOrderUrl(data, validItems, options);
      } catch (_) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      if (!url || typeof url !== 'string' || !url.startsWith('https://wa.me/')) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      // 3. Save order record to KenoOrderStore / Firebase in the background (prevents gesture expiration)
      (async () => {
        try {
          if (window.KenoFirebase && typeof window.KenoFirebase.createOrder === 'function') {
            await window.KenoFirebase.createOrder(orderObj);
          } else {
            await KenoOrderStore.saveOrder(orderObj);
          }
          updateOrdersBadgeCount();
        } catch (_) {}
      })();

      // 4. Open WhatsApp immediately with 1-click
      const opened = OrderUtils.openWhatsApp(url);
      if (!opened) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }

      // Clear cart, reset stepper, close drawer
      saveCartItems([]);
      cartUploadedReceipt = null;
      currentCheckoutStep = 1;
      if ($('invoiceOrderCode')) $('invoiceOrderCode').dataset.code = '';
      closeCart();
      toast(`تم تأكيد طلبك ${orderCode}. جاري فتح واتساب...`);
    } catch (err) {
      console.error('Cart WhatsApp error:', err);
      toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
    }
  });

  // Cart Copy Order Details
  $('cartCopySummaryBtn')?.addEventListener('click', async () => {
    try {
      const data = viewData();
      const rawItems = getCartItems();
      const validItems = [];

      rawItems.forEach(it => {
        const srv = data.services.find(s => s.id === it.serviceId && s.visible);
        if (srv) {
          const pln = srv.plans.find(p => p.id === it.planId && p.available);
          if (pln || srv.plans.length === 0) {
            validItems.push({
              service: srv,
              plan: pln || { id: null, label: 'خدمة حسب الطلب', price: 0 },
              quantity: it.quantity || 1
            });
          }
        }
      });

      if (validItems.length === 0) {
        toast('سلة الطلبات فارغة.');
        return;
      }

      const pm = (data.paymentMethods || []).find(m => m.id === cartSelectedPaymentId && m.enabled) || null;
      const options = {
        customerAccount: $('cartCustomerAccount')?.value.trim() || '',
        paymentMethod: pm,
        transferNumber: $('cartTransferNumber')?.value.trim() || '',
        hasReceipt: !!cartUploadedReceipt,
        orderNote: $('cartOrderNote')?.value.trim() || '',
        orderCode: $('invoiceOrderCode')?.dataset.code || OrderUtils.generateOrderCode()
      };

      const text = OrderUtils.buildCartOrderText(data, validItems, options);
      const success = await OrderUtils.copyToClipboard(text);
      if (success) {
        toast('تم نسخ تفاصيل سلة الطلبات للحافظة بنجاح.');
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // Clear Cart Button
  $('clearCartBtn')?.addEventListener('click', async () => {
    if (await confirmAction('تفريغ السلة؟', 'هل أنت متأكد من حذف جميع العناصر من سلة الطلبات؟', 'تفريغ السلة')) {
      clearCart();
    }
  });

  function contact() {
    try {
      const data = viewData();
      const phone = OrderUtils.cleanWhatsAppNumber(data?.settings?.whatsapp);
      if (!OrderUtils.isValidWhatsAppNumber(phone)) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
        return;
      }
      const storeName = data?.settings?.storeName || 'Keno Store';
      const text = `أهلًا ${storeName}، أود الاستفسار عن الخدمات الرقمية.`.normalize('NFC');
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      const opened = OrderUtils.openWhatsApp(url);
      if (!opened) {
        toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
      }
    } catch (_) {
      toast('تعذر فتح واتساب، يرجى المحاولة مرة أخرى.');
    }
  }

  // --- Routing & Admin View Switching ---
  function inferRepo() {
    const host = location.hostname;
    if (host.endsWith('.github.io')) {
      const owner = host.slice(0, -10);
      const repo = location.pathname.split('/').filter(Boolean)[0];
      return owner + '/' + (repo || owner + '.github.io');
    }
    return '';
  }

  const lastConnection = (() => {
    try { return JSON.parse(storageGet('keno.admin.connection.v2') || 'null'); } catch (_) { return null; }
  })();

  if ($('repoInput')) $('repoInput').value = inferRepo() || lastConnection?.repo || '';
  if ($('branchInput')) $('branchInput').value = lastConnection?.branch || 'main';

  let adminScriptPromise = null;
  function loadAdminScript() {
    if (window.KenoAdmin) return Promise.resolve(window.KenoAdmin);
    if (adminScriptPromise) return adminScriptPromise;
    adminScriptPromise = new Promise((resolve, reject) => {
      const existing = document.getElementById('keno-admin-script');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.KenoAdmin));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.id = 'keno-admin-script';
      script.src = './js/admin.js';
      script.async = true;
      script.onload = () => resolve(window.KenoAdmin);
      script.onerror = err => {
        console.error('Failed to load admin module:', err);
        toast('تعذّر تحميل وحدة الإدارة.');
        reject(err);
      };
      document.body.appendChild(script);
    });
    return adminScriptPromise;
  }

  function route() {
    const hash = location.hash;
    const isAdmin = hash === '#admin' || hash.startsWith('#admin/');
    if ($('storefront')) $('storefront').hidden = isAdmin;
    if ($('adminView')) $('adminView').hidden = !isAdmin;
    document.querySelectorAll('.floating-contact').forEach(el => { el.hidden = isAdmin; });

    if (isAdmin && preview) {
      preview = false;
      document.body.classList.remove('draft-previewing');
      if ($('draftPreviewBar')) $('draftPreviewBar').hidden = true;
      renderStore();
    }

    if (isAdmin) {
      loadAdminScript().then(admin => {
        if (admin && typeof admin.init === 'function') {
          admin.init();
        }
      });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (hash.startsWith('#service/')) {
      // Direct deep link handler (e.g. #service/pubg or #service/pubg/pubg-3)
      const parts = hash.slice('#service/'.length).split('/');
      const srvId = parts[0];
      const planId = parts[1] || null;
      if (srvId) {
        setTimeout(() => openService(srvId, planId), 60);
      }
    }
  }

  window.addEventListener('hashchange', route);

  // --- Admin Workspace Session Management ---
  async function startWorkspace(data, newSha, restore = true) {
    baseData = JSON.parse(JSON.stringify(data));
    draft = JSON.parse(JSON.stringify(data));
    sha = newSha;
    adminOpen = true;
    if ($('adminMessage')) $('adminMessage').hidden = true;

    const saved = storageGet(draftKey());
    if (restore && saved) {
      try {
        const record = JSON.parse(saved);
        const previous = CatalogParser.validate(record.data);
        const sameBase = record.sha === newSha && (newSha !== null || JSON.stringify(record.base) === JSON.stringify(data));

        if (sameBase && JSON.stringify(previous) !== JSON.stringify(data)) {
          if (await confirmAction('يوجد مسودة محفوظة مسبقًا', 'هل ترغب في استعادة آخر تعديلات غير منشورة تم حفظها في هذا المتصفح؟', 'استعادة المسودة')) {
            draft = previous;
          }
        } else if (!sameBase && JSON.stringify(previous) !== JSON.stringify(data)) {
          downloadFile('keno-previous-draft.json', JSON.stringify(previous, null, 2), 'application/json');
          showAdminMessage('المسودة السابقة مبنية على نسخة مختلفة من المتجر. تم تنزيلها تلقائيًا كنسخة احتياطية وبدأنا من النسخة الأحدث.');
        }
      } catch (_) {
        showAdminMessage('تعذّر استعادة المسودة السابقة. تم تحميل أحدث نسخة متوفرة.');
      }
    }

    if ($('adminLogin')) $('adminLogin').hidden = true;
    if ($('adminWorkspace')) $('adminWorkspace').hidden = false;
    renderAdmin();
    saveDraft();
  }

  // --- Admin Bridge Interface for js/admin.js ---
  window.getAdminDraft = () => draft || live;
  window.saveAdminDraft = () => {
    saveDraft();
    renderStore();
    renderAdmin();
  };
  window.renderAdminStore = () => {
    if (!draft) {
      startWorkspace(live, null).then(() => renderAdmin());
    } else {
      renderAdmin();
    }
  };
  window.ensureAdminWorkspace = async (creds = null) => {
    if (draft && !creds?.token) return draft;
    if (creds?.token && creds?.repo) {
      try {
        const candidate = GitHubClientFactory.createGitHubClient(window.fetch.bind(window), creds.repo, creds.branch || 'main', creds.token);
        const remote = await candidate.load();
        client?.clear();
        client = candidate;
        activeRepo = creds.repo;
        activeBranch = creds.branch || 'main';
        storageSet('keno.admin.connection.v2', JSON.stringify({ repo: creds.repo, branch: creds.branch || 'main' }));
        await startWorkspace(remote.data, remote.sha);
        showAdminMessage('تم الاتصال بـ GitHub وتحميل أحدث نسخة بنجاح. عدّل كما تشاء، ثم اضغط «نشر التعديلات».');
        return draft;
      } catch (err) {
        console.warn('Could not connect to GitHub:', err);
        throw err;
      }
    }
    await startWorkspace(live, null);
    return draft;
  };
  window.showToast = msg => toast(msg);
  window.getStoreCatalog = () => viewData();

  function updateAdminStatus() {
    if ($('connectionStatus')) {
      $('connectionStatus').textContent = client
        ? `متصل بـ GitHub: ${activeRepo} (${activeBranch})`
        : 'تحرير مسودة محلية — غير متصل بـ GitHub';
    }
    if ($('draftStatus')) {
      $('draftStatus').textContent = isDirty()
        ? 'توجد تعديلات محفوظة في المسودة ولم تُنشر بعد.'
        : 'المسودة متطابقة مع النسخة المحملة.';
    }
    if ($('publishButton')) $('publishButton').disabled = publishing || !isDirty();
    if ($('logoutButton')) $('logoutButton').disabled = publishing;
    if ($('connectFromDraft')) $('connectFromDraft').hidden = Boolean(client);
    if ($('reloadRemote')) $('reloadRemote').hidden = !client;
  }

  function renderAdmin() {
    if (!draft) return;

    if ($('adminServiceCount')) $('adminServiceCount').textContent = draft.services.length;
    if ($('adminPlanCount')) $('adminPlanCount').textContent = draft.services.reduce((acc, s) => acc + s.plans.length, 0);
    if ($('adminVisibleCount')) $('adminVisibleCount').textContent = draft.services.filter(s => s.visible).length;
    if ($('adminQuoteCount')) $('adminQuoteCount').textContent = draft.services.filter(s => !s.plans.length).length;

    updateAdminStatus();
    renderAdminTable();
    renderAdminCategories();
    renderAdminPayments();
    renderAdminOrders();
    updateOrdersBadgeCount();
    if (activeServicesView === 'master-plans') {
      renderMasterPlansTable();
    }

    // Populate Settings Form
    if (!settingsDirty && $('settingsForm')) {
      const form = $('settingsForm');
      for (const field of ['storeName', 'tagline', 'whatsapp', 'paymentPhone', 'instapay', 'workingHours', 'facebook', 'instagram', 'tiktok', 'telegram', 'announcement']) {
        if (form.elements[field]) {
          form.elements[field].value = draft.settings[field] || '';
        }
      }
      if (form.elements.facebookEnabled) {
        form.elements.facebookEnabled.checked = draft.settings.facebookEnabled !== false;
      }
      if (form.elements.instagramEnabled) {
        form.elements.instagramEnabled.checked = draft.settings.instagramEnabled !== false;
      }
      if (form.elements.tiktokEnabled) {
        form.elements.tiktokEnabled.checked = draft.settings.tiktokEnabled !== false;
      }
      if (form.elements.telegramEnabled) {
        form.elements.telegramEnabled.checked = draft.settings.telegramEnabled !== false;
      }
    }

    // Populate Category Filter dropdown in Services Tab
    const catFilter = $('adminCategoryFilter');
    if (catFilter) {
      const currentVal = catFilter.value;
      catFilter.innerHTML = '<option value="all">كل الأقسام</option>' +
        draft.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      catFilter.value = draft.categories.some(c => c.id === currentVal) ? currentVal : 'all';
    }
  }

  // --- Admin Services Table ---
  function renderAdminTable() {
    if (!draft) return;
    const searchVal = SearchEngine.normalize($('adminSearch')?.value || '');
    const catFilterVal = $('adminCategoryFilter')?.value || 'all';
    const statusFilterVal = $('adminStatusFilter')?.value || 'all';

    const services = draft.services.filter(s => {
      const matchesCategory = catFilterVal === 'all' || s.category === catFilterVal;
      if (!matchesCategory) return false;

      if (statusFilterVal === 'visible' && !s.visible) return false;
      if (statusFilterVal === 'hidden' && s.visible) return false;
      if (statusFilterVal === 'featured' && !s.featured) return false;

      if (!searchVal) return true;
      const searchTarget = SearchEngine.normalize(`${s.name} ${s.mark} ${s.aliases || ''}`);
      return searchTarget.includes(searchVal);
    });

    const tbody = $('adminTableBody');
    if (!tbody) return;

    if (services.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="centered">لا توجد خدمات مطابقة للبحث أو التصفية الحالية.</td></tr>';
      return;
    }

    tbody.innerHTML = services.map((s, idx) => {
      const minPrice = SearchEngine.minPrice(s);
      const cat = draft.categories.find(c => c.id === s.category);
      const isFirst = idx === 0;
      const isLast = idx === services.length - 1;
      const badgeHtml = s.badge ? `<span class="status-pill featured-status" style="font-size:0.68rem;padding:2px 7px;">${esc(s.badge)}</span>` : '';

      const isHidden = !s.visible || s.status === 'hidden';
      const isUnavailable = !isHidden && (s.available === false || s.status === 'unavailable');

      let statusBadge = '';
      if (isHidden) {
        statusBadge = `<button type="button" class="status-pill clickable hidden-status" data-toggle-status="${esc(s.id)}" title="انقر للتبديل: مخفية -> نشطة">مخفية</button>`;
      } else if (isUnavailable) {
        statusBadge = `<button type="button" class="status-pill clickable warning-status" data-toggle-status="${esc(s.id)}" title="انقر للتبديل: غير متاحة -> مخفية">غير متاحة</button>`;
      } else {
        statusBadge = `<button type="button" class="status-pill clickable active-pill" data-toggle-status="${esc(s.id)}" title="انقر للتبديل: نشطة -> غير متاحة">نشطة ومتاحة</button>`;
      }

      return `
        <tr>
          <td>
            <strong>${esc(s.name)}</strong>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
              <small class="field-hint" style="margin:0;">${esc(s.mark || '')}</small>
              ${badgeHtml}
            </div>
          </td>
          <td>${esc(cat?.name || s.category)}</td>
          <td>${s.plans.length} باقة</td>
          <td>${minPrice !== null ? `${money(minPrice)} ج.م` : (s.plans.length ? 'غير متاحة' : 'حسب الطلب')}</td>
          <td>
            <div class="button-row" style="gap:4px;flex-wrap:wrap;">
              ${statusBadge}
              <button type="button" class="status-pill clickable ${s.featured ? 'featured-status' : 'dimmed-status'}" data-toggle-featured="${esc(s.id)}" title="انقر لتمييز الخدمة في المختارات">
                ${s.featured ? 'مميزة ★' : 'عادية'}
              </button>
            </div>
          </td>
          <td>
            <div class="reorder-btn-group">
              <button type="button" class="icon-btn tiny" data-move-service="${esc(s.id)}" data-dir="up" title="تقديم للأعلى" ${isFirst ? 'disabled' : ''}>
                ${icon('arrow-up-left')}
              </button>
              <button type="button" class="icon-btn tiny" data-move-service="${esc(s.id)}" data-dir="down" title="تأخير للأسفل" ${isLast ? 'disabled' : ''}>
                ${icon('arrow-left')}
              </button>
            </div>
          </td>
          <td>
            <div class="button-row">
              <button type="button" class="button button-outline small" data-edit-service="${esc(s.id)}">تعديل</button>
              <button type="button" class="button button-outline small danger-text" data-delete-service="${esc(s.id)}">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  $('adminSearch')?.addEventListener('input', renderAdminTable);
  $('adminCategoryFilter')?.addEventListener('change', renderAdminTable);
  $('adminStatusFilter')?.addEventListener('change', renderAdminTable);

  // Admin Services Table Actions (Delegation)
  $('adminTableBody')?.addEventListener('click', async event => {
    const editBtn = event.target.closest('[data-edit-service]');
    if (editBtn) {
      openEditor(editBtn.dataset.editService);
      return;
    }

    const delBtn = event.target.closest('[data-delete-service]');
    if (delBtn) {
      const srvId = delBtn.dataset.deleteService;
      const service = draft?.services.find(s => s.id === srvId);
      if (!service) return;
      if (await confirmAction('حذف الخدمة؟', `هل أنت متأكد من حذف خدمة «${service.name}» نهائيًا من الكتالوج؟`, 'حذف الخدمة')) {
        draft.services = draft.services.filter(s => s.id !== srvId);
        saveDraft();
        renderAdmin();
        toast('تم حذف الخدمة بنجاح.');
      }
      return;
    }

    const toggleStatusBtn = event.target.closest('[data-toggle-status]');
    if (toggleStatusBtn) {
      const srvId = toggleStatusBtn.dataset.toggleStatus;
      const service = draft?.services.find(s => s.id === srvId);
      if (!service) return;
      // Cycle: visible -> unavailable -> hidden -> visible
      if (service.visible && service.available !== false && service.status !== 'unavailable') {
        service.visible = true;
        service.available = false;
        service.status = 'unavailable';
        toast(`تم تحويل خدمة «${service.name}» إلى غير متاحة حالياً.`);
      } else if (service.visible) {
        service.visible = false;
        service.available = false;
        service.status = 'hidden';
        toast(`تم إخفاء خدمة «${service.name}» من المتجر.`);
      } else {
        service.visible = true;
        service.available = true;
        service.status = 'visible';
        toast(`تم تفعيل خدمة «${service.name}» وإظهارها للزوار.`);
      }
      saveDraft();
      renderAdminTable();
      return;
    }

    const toggleFeaturedBtn = event.target.closest('[data-toggle-featured]');
    if (toggleFeaturedBtn) {
      const srvId = toggleFeaturedBtn.dataset.toggleFeatured;
      const service = draft?.services.find(s => s.id === srvId);
      if (!service) return;
      service.featured = !service.featured;
      saveDraft();
      renderAdminTable();
      toast(service.featured ? `تمت إضافة «${service.name}» إلى المختارات المميزة.` : `تمت إزالة «${service.name}» من المختارات المميزة.`);
      return;
    }

    const moveBtn = event.target.closest('[data-move-service]');
    if (moveBtn) {
      const srvId = moveBtn.dataset.moveService;
      const dir = moveBtn.dataset.dir;
      const idx = draft?.services.findIndex(s => s.id === srvId);
      if (idx === undefined || idx === -1) return;
      const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < draft.services.length) {
        const temp = draft.services[idx];
        draft.services[idx] = draft.services[targetIdx];
        draft.services[targetIdx] = temp;
        saveDraft();
        renderAdminTable();
      }
      return;
    }
  });

  // --- Admin Tab Switching ---
  const tabButtons = [...document.querySelectorAll('[data-admin-tab]')];
  function switchTab(button) {
    if (settingsDirty && typeof saveSettingsDraft === 'function') {
      saveSettingsDraft(true);
    }
    tabButtons.forEach(b => {
      const active = b === button;
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
      const panel = $(b.dataset.adminTab);
      if (panel) panel.hidden = !active;
    });
    if (button.dataset.adminTab === 'adminOrders') {
      renderAdminOrders();
    }
  }

  tabButtons.forEach(b => {
    b.addEventListener('click', () => switchTab(b));
    b.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        let i = tabButtons.indexOf(b);
        i = event.key === 'Home' ? 0 : event.key === 'End' ? tabButtons.length - 1 : (i + (event.key === 'ArrowLeft' ? 1 : -1) + tabButtons.length) % tabButtons.length;
        switchTab(tabButtons[i]);
        tabButtons[i].focus();
      }
    });
  });

  // --- Category Management (Phase 3) ---
  function renderAdminCategories() {
    if (!draft) return;
    const tbody = $('adminCategoriesBody');
    if (!tbody) return;

    tbody.innerHTML = draft.categories.map(cat => {
      const count = draft.services.filter(s => s.category === cat.id).length;
      return `
        <tr>
          <td>${icon(cat.icon)}</td>
          <td><strong>${esc(cat.name)}</strong></td>
          <td><code>${esc(cat.id)}</code></td>
          <td>${count} خدمة</td>
          <td>
            <div class="button-row">
              <button type="button" class="button button-outline small" data-edit-cat="${esc(cat.id)}">تعديل</button>
              <button type="button" class="button button-outline small danger-text" data-delete-cat="${esc(cat.id)}">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openCategoryDialog(catId = null) {
    editingCategoryId = catId;
    const existing = draft.categories.find(c => c.id === catId);
    $('categoryDialogTitle').textContent = existing ? 'تعديل قسم' : 'إضافة قسم جديد';

    const idInput = $('catIdInput');
    const nameInput = $('catNameInput');
    const iconSelect = $('catIconSelect');

    idInput.value = existing ? existing.id : '';
    idInput.disabled = Boolean(existing); // Do not rename ID of existing categories to preserve foreign keys
    nameInput.value = existing ? existing.name : '';

    const iconLabels = Config.ICON_LABELS || {};
    iconSelect.innerHTML = Object.entries(iconLabels).map(([val, label]) => `
      <option value="${val}" ${existing?.icon === val ? 'selected' : ''}>${label} (${val})</option>
    `).join('');

    if ($('categoryError')) $('categoryError').hidden = true;
    categoryDirty = false;
    $('categoryDialog').showModal();
  }

  async function requestCategoryClose() {
    if (categoryDirty && !await confirmAction('تغييرات غير محفوظة', 'هل ترغب في إغلاق نافذة القسم وتجاهل التعديلات؟', 'إغلاق وتجاهل')) {
      return;
    }
    categoryDirty = false;
    closeDialog('categoryDialog');
  }

  $('categoryForm')?.addEventListener('input', () => { categoryDirty = true; });
  $('categoryDialog')?.addEventListener('cancel', event => {
    event.preventDefault();
    requestCategoryClose();
  });

  $('addCategoryButton')?.addEventListener('click', () => openCategoryDialog(null));

  $('adminCategoriesBody')?.addEventListener('click', async event => {
    const editBtn = event.target.closest('[data-edit-cat]');
    if (editBtn) {
      openCategoryDialog(editBtn.dataset.editCat);
      return;
    }

    const delBtn = event.target.closest('[data-delete-cat]');
    if (delBtn) {
      const catId = delBtn.dataset.deleteCat;
      const linkedCount = draft.services.filter(s => s.category === catId).length;
      if (linkedCount > 0) {
        toast(`لا يمكن حذف هذا القسم لأنه يحتوي على ${linkedCount} خدمة حاليًا. انقل الخدمات لقسم آخر أولًا.`);
        return;
      }
      if (draft.categories.length <= 1) {
        toast('يجب أن يتبقى قسم واحد على الأقل في المتجر.');
        return;
      }
      if (await confirmAction('حذف القسم؟', 'هل أنت متأكد من حذف هذا القسم من الكتالوج؟', 'حذف القسم')) {
        draft.categories = draft.categories.filter(c => c.id !== catId);
        saveDraft();
        renderAdmin();
        toast('تم حذف القسم بنجاح.');
      }
    }
  });

  $('categoryForm')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!adminOpen || !draft || publishing) return;

    try {
      const id = $('catIdInput').value.trim().toLowerCase();
      const name = $('catNameInput').value.trim();
      const iconVal = $('catIconSelect').value;

      if (!id || !name) throw new Error('يرجى ملء جميع الحقول المطلوبة.');
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error('معرّف القسم يجب أن يتكون من أحرف إنجليزية وأرقام وشرطات فقط.');

      const next = JSON.parse(JSON.stringify(draft));
      if (editingCategoryId) {
        const cat = next.categories.find(c => c.id === editingCategoryId);
        if (cat) {
          cat.name = name;
          cat.icon = iconVal;
        }
      } else {
        if (next.categories.some(c => c.id === id)) {
          throw new Error('معرّف القسم مكرر، يرجى اختيار معرّف آخر.');
        }
        next.categories.push({ id, name, icon: iconVal });
      }

      draft = CatalogParser.validate(next);
      categoryDirty = false;
      saveDraft();
      renderAdmin();
      closeDialog('categoryDialog');
      toast('تم حفظ القسم في المسودة.');
    } catch (err) {
      if ($('categoryError')) {
        $('categoryError').textContent = err.message;
        $('categoryError').hidden = false;
      }
    }
  });

  // --- Payment Methods Management ---
  function renderAdminPayments() {
    if (!draft) return;
    const tbody = $('adminPaymentsBody');
    if (!tbody) return;

    if (!Array.isArray(draft.paymentMethods) || draft.paymentMethods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="centered">لا توجد وسائل دفع مضافة حاليًا. انقر على «إضافة وسيلة دفع» للبدء.</td></tr>';
      return;
    }

    tbody.innerHTML = draft.paymentMethods.map((pm, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === draft.paymentMethods.length - 1;
      const statusHtml = pm.enabled
        ? `<button type="button" class="status-pill visible-status status-btn" data-toggle-pm-status="${esc(pm.id)}" title="انقر للتعطيل">مفعّلة ✓</button>`
        : `<button type="button" class="status-pill hidden-status status-btn" data-toggle-pm-status="${esc(pm.id)}" title="انقر للتفعيل">معطّلة ✕</button>`;

      const linkHtml = pm.link
        ? `<a href="${esc(pm.link)}" target="_blank" rel="noopener noreferrer" class="link-action-btn small" style="padding: 2px 8px; font-size: 0.72rem;">${icon('external-link')} فتح الرابط</a>`
        : '<span class="field-hint">—</span>';

      return `
        <tr>
          <td><span class="payment-icon-badge">${icon(pm.icon || 'wallet-cards')}</span></td>
          <td>
            <strong>${esc(pm.name)}</strong>
            <div class="field-hint" style="font-size:0.75rem;"><code>${esc(pm.id)}</code></div>
          </td>
          <td><strong dir="ltr" style="font-family: monospace;">${esc(pm.number)}</strong></td>
          <td>${esc(pm.accountName || '—')}</td>
          <td>${linkHtml}</td>
          <td>${statusHtml}</td>
          <td>
            <div class="reorder-controls">
              <button type="button" class="reorder-btn" data-move-pm-up="${esc(pm.id)}" ${isFirst ? 'disabled' : ''} title="تقديم للأعلى">▲</button>
              <button type="button" class="reorder-btn" data-move-pm-down="${esc(pm.id)}" ${isLast ? 'disabled' : ''} title="تأخير للأسفل">▼</button>
            </div>
          </td>
          <td>
            <div class="button-row">
              <button type="button" class="button button-outline small" data-edit-pm="${esc(pm.id)}">تعديل</button>
              <button type="button" class="button button-outline small danger-text" data-delete-pm="${esc(pm.id)}">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function openPaymentDialog(pmId = null) {
    editingPaymentMethodId = pmId;
    const existing = (draft?.paymentMethods || []).find(m => m.id === pmId);
    $('paymentDialogTitle').textContent = existing ? 'تعديل وسيلة الدفع' : 'إضافة وسيلة دفع جديدة';

    // Populate Presets dropdown
    const presetSelect = $('paymentTemplateSelect');
    if (presetSelect) {
      const templates = Config.PAYMENT_TEMPLATES || [];
      presetSelect.innerHTML = '<option value="">-- اختيار وسيلة شائعة لتعبئة تلقائية --</option>' +
        templates.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
      presetSelect.value = '';
    }

    $('pmIdInput').value = existing ? existing.id : '';
    $('pmIdInput').disabled = Boolean(existing);
    $('pmNameInput').value = existing ? existing.name : '';
    $('pmNumberInput').value = existing ? existing.number : '';
    $('pmAccountNameInput').value = existing ? (existing.accountName || '') : '';
    $('pmLinkInput').value = existing ? (existing.link || '') : '';
    $('pmDescriptionInput').value = existing ? (existing.description || '') : '';
    $('pmEnabledInput').checked = existing ? existing.enabled : true;

    // Icons dropdown
    const iconSelect = $('pmIconSelect');
    const paymentIcons = ['wallet-cards', 'credit-card', 'smartphone', 'coins', 'shopping-bag', 'globe', 'zap', 'shield-check'];
    const iconLabels = Config.ICON_LABELS || {};
    iconSelect.innerHTML = paymentIcons.map(val => `
      <option value="${val}" ${(existing?.icon || 'wallet-cards') === val ? 'selected' : ''}>
        ${iconLabels[val] || val} (${val})
      </option>
    `).join('');

    if ($('paymentError')) $('paymentError').hidden = true;
    paymentDirty = false;
    $('paymentDialog').showModal();
  }

  async function requestPaymentClose() {
    if (paymentDirty && !await confirmAction('تغييرات غير محفوظة', 'هل ترغب في إغلاق نافذة وسيلة الدفع وتجاهل التعديلات؟', 'إغلاق وتجاهل')) {
      return;
    }
    paymentDirty = false;
    closeDialog('paymentDialog');
  }

  $('paymentForm')?.addEventListener('input', () => { paymentDirty = true; });
  $('paymentDialog')?.addEventListener('cancel', event => {
    event.preventDefault();
    requestPaymentClose();
  });

  $('paymentTemplateSelect')?.addEventListener('change', event => {
    const val = event.target.value;
    if (!val) return;
    const t = (Config.PAYMENT_TEMPLATES || []).find(tmpl => tmpl.id === val);
    if (!t) return;

    if (!editingPaymentMethodId) {
      $('pmIdInput').value = t.id;
    }
    $('pmNameInput').value = t.name;
    $('pmNumberInput').value = t.number;
    $('pmAccountNameInput').value = t.accountName || '';
    $('pmLinkInput').value = t.link || '';
    $('pmDescriptionInput').value = t.description || '';
    $('pmIconSelect').value = t.icon || 'wallet-cards';
    $('pmEnabledInput').checked = t.enabled !== false;
  });

  $('addPaymentButton')?.addEventListener('click', () => openPaymentDialog(null));

  $('adminPaymentsBody')?.addEventListener('click', async event => {
    const toggleBtn = event.target.closest('[data-toggle-pm-status]');
    if (toggleBtn) {
      const pmId = toggleBtn.dataset.togglePmStatus;
      const pm = (draft?.paymentMethods || []).find(m => m.id === pmId);
      if (pm) {
        pm.enabled = !pm.enabled;
        draft = CatalogParser.validate(draft);
        saveDraft();
        renderAdmin();
        toast(pm.enabled ? `تم تفعيل ${pm.name}.` : `تم تعطيل ${pm.name}.`);
      }
      return;
    }

    const moveUpBtn = event.target.closest('[data-move-pm-up]');
    if (moveUpBtn) {
      const pmId = moveUpBtn.dataset.movePmUp;
      const idx = (draft?.paymentMethods || []).findIndex(m => m.id === pmId);
      if (idx > 0) {
        const temp = draft.paymentMethods[idx];
        draft.paymentMethods[idx] = draft.paymentMethods[idx - 1];
        draft.paymentMethods[idx - 1] = temp;
        draft = CatalogParser.validate(draft);
        saveDraft();
        renderAdmin();
        toast('تم تقديم ترتيب وسيلة الدفع.');
      }
      return;
    }

    const moveDownBtn = event.target.closest('[data-move-pm-down]');
    if (moveDownBtn) {
      const pmId = moveDownBtn.dataset.movePmDown;
      const idx = (draft?.paymentMethods || []).findIndex(m => m.id === pmId);
      if (idx >= 0 && idx < (draft?.paymentMethods || []).length - 1) {
        const temp = draft.paymentMethods[idx];
        draft.paymentMethods[idx] = draft.paymentMethods[idx + 1];
        draft.paymentMethods[idx + 1] = temp;
        draft = CatalogParser.validate(draft);
        saveDraft();
        renderAdmin();
        toast('تم تأخير ترتيب وسيلة الدفع.');
      }
      return;
    }

    const editBtn = event.target.closest('[data-edit-pm]');
    if (editBtn) {
      openPaymentDialog(editBtn.dataset.editPm);
      return;
    }

    const delBtn = event.target.closest('[data-delete-pm]');
    if (delBtn) {
      const pmId = delBtn.dataset.deletePm;
      if (draft.paymentMethods.length <= 1) {
        toast('يجب أن تتبقى وسيلة دفع واحدة على الأقل.');
        return;
      }
      const pm = draft.paymentMethods.find(m => m.id === pmId);
      if (await confirmAction('حذف وسيلة الدفع؟', `هل أنت متأكد من حذف "${pm?.name || pmId}" نهائيًا؟`, 'حذف وسيلة الدفع')) {
        draft.paymentMethods = draft.paymentMethods.filter(m => m.id !== pmId);
        draft = CatalogParser.validate(draft);
        saveDraft();
        renderAdmin();
        toast('تم حذف وسيلة الدفع بنجاح.');
      }
    }
  });

  $('paymentForm')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!adminOpen || !draft || publishing) return;

    try {
      const id = $('pmIdInput').value.trim().toLowerCase();
      const name = $('pmNameInput').value.trim();
      const number = $('pmNumberInput').value.trim();
      const accountName = $('pmAccountNameInput').value.trim();
      const link = $('pmLinkInput').value.trim();
      const iconVal = $('pmIconSelect').value;
      const description = $('pmDescriptionInput').value.trim();
      const enabled = $('pmEnabledInput').checked;

      if (!id || !name || !number) {
        throw new Error('يرجى ملء الحقول الإلزامية (اسم الوسيلة، المعرّف، ورقم/حساب الدفع).');
      }
      if (!/^[a-z0-9-]+$/.test(id)) {
        throw new Error('معرّف وسيلة الدفع يجب أن يتكون من أحرف إنجليزية وأرقام وشرطات فقط.');
      }

      const next = JSON.parse(JSON.stringify(draft));
      if (!Array.isArray(next.paymentMethods)) {
        next.paymentMethods = [];
      }

      if (editingPaymentMethodId) {
        const pm = next.paymentMethods.find(m => m.id === editingPaymentMethodId);
        if (pm) {
          pm.name = name;
          pm.number = number;
          pm.accountName = accountName;
          pm.link = link;
          pm.description = description;
          pm.icon = iconVal;
          pm.enabled = enabled;
        }
      } else {
        if (next.paymentMethods.some(m => m.id === id)) {
          throw new Error('معرّف وسيلة الدفع مكرر، يرجى اختيار معرّف آخر.');
        }
        next.paymentMethods.push({
          id,
          name,
          number,
          accountName,
          link,
          description,
          icon: iconVal,
          enabled
        });
      }

      draft = CatalogParser.validate(next);
      paymentDirty = false;
      saveDraft();
      renderAdmin();
      closeDialog('paymentDialog');
      toast('تم حفظ وسيلة الدفع في المسودة بنجاح.');
    } catch (err) {
      if ($('paymentError')) {
        $('paymentError').textContent = err.message;
        $('paymentError').hidden = false;
      }
    }
  });

  // --- Admin Orders & Receipts Management ---
  let activeViewerReceipt = null;

  async function renderAdminOrders() {
    const tbody = $('adminOrdersTableBody');
    const emptyState = $('adminOrdersEmptyState');
    if (!tbody) return;

    try {
      let orders = [];
      if (window.KenoFirebase && typeof window.KenoFirebase.getOrders === 'function') {
        orders = await window.KenoFirebase.getOrders();
      } else {
        orders = await KenoOrderStore.getOrders();
      }
      updateOrdersBadgeCount();

      // Update KPI Cards
      if (window.KenoFirebase && typeof window.KenoFirebase.computeKPIs === 'function') {
        const kpi = window.KenoFirebase.computeKPIs(orders);
        if ($('kpiTotalOrders')) $('kpiTotalOrders').textContent = kpi.totalOrders;
        if ($('kpiPendingOrders')) $('kpiPendingOrders').textContent = kpi.pendingOrders;
        if ($('kpiDeliveredOrders')) $('kpiDeliveredOrders').textContent = kpi.deliveredOrders;
        if ($('kpiRevenue')) $('kpiRevenue').textContent = Number(kpi.revenue).toLocaleString('en-US') + ' ج.م';
        if ($('kpiPopularService')) $('kpiPopularService').textContent = kpi.popularService || '—';
      }

      const searchVal = ($('ordersSearch')?.value || '').trim().toLowerCase();
      const statusFilterVal = $('ordersStatusFilter')?.value || 'all';

      const filtered = orders.filter(o => {
        const orderStatus = o.status || 'pending';
        if (statusFilterVal !== 'all' && orderStatus !== statusFilterVal) {
          return false;
        }
        if (!searchVal) return true;
        const textToSearch = [
          o.id,
          o.customerName,
          o.customerAccount,
          o.customerPhone,
          o.transferNumber,
          o.paymentMethod,
          o.notes,
          (o.items || []).map(it => it.serviceName + ' ' + it.planLabel).join(' '),
          o.serviceName,
          o.planLabel
        ].filter(Boolean).join(' ').toLowerCase();
        return textToSearch.includes(searchVal);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.hidden = false;
        return;
      }

      if (emptyState) emptyState.hidden = true;

      tbody.innerHTML = filtered.map(o => {
        const dateStr = o.dateStr || (o.timestamp ? new Date(o.timestamp).toLocaleString('ar-EG') : '—');

        let itemsHtml = '';
        if (o.items && o.items.length > 0) {
          itemsHtml = o.items.map(it => `
            <div class="order-item-chip">
              <strong>${esc(it.serviceName)}</strong>: ${esc(it.planLabel || 'الخدمة')} ${it.quantity > 1 ? `<span class="quantity-badge">×${it.quantity}</span>` : ''}
            </div>
          `).join('');
        } else if (o.serviceName) {
          itemsHtml = `<div class="order-item-chip"><strong>${esc(o.serviceName)}</strong>: ${esc(o.planLabel || 'الخدمة')}</div>`;
        } else {
          itemsHtml = '<span style="color:var(--muted);">طلب مخصص</span>';
        }

        const accInfo = [];
        if (o.customerName) accInfo.push(`<div><strong>${esc(o.customerName)}</strong></div>`);
        if (o.customerPhone) accInfo.push(`<div><small style="color:var(--muted);">الهاتف:</small> <span dir="ltr">${esc(o.customerPhone)}</span></div>`);
        if (o.customerAccount) accInfo.push(`<div><small style="color:var(--muted);">الحساب:</small> <strong>${esc(o.customerAccount)}</strong></div>`);
        if (o.transferNumber) accInfo.push(`<div><small style="color:var(--muted);">التحويل:</small> <span dir="ltr">${esc(o.transferNumber)}</span></div>`);
        if (o.notes) accInfo.push(`<div><small style="color:var(--muted);">ملاحظة:</small> <em>${esc(o.notes)}</em></div>`);
        const accHtml = accInfo.length > 0 ? accInfo.join('') : '<span style="color:var(--muted);">—</span>';

        const currentStatus = o.status || 'pending';

        let receiptHtml = '';
        if (o.hasReceipt && o.receipt?.dataUrl) {
          receiptHtml = `
            <button type="button" class="receipt-table-preview-btn" data-order-action="view-receipt" data-order-id="${esc(o.id)}" title="فحص الإيصال بالحجم الكامل">
              <img src="${o.receipt.dataUrl}" alt="إيصال" class="receipt-table-thumb" loading="lazy">
              <span>عرض</span>
            </button>
          `;
        } else {
          receiptHtml = `<span class="status-pill draft-pill" style="font-size:0.75rem;">بدون إيصال</span>`;
        }

        return `
          <tr data-order-row="${esc(o.id)}">
            <td>
              <strong class="order-id-badge" dir="ltr">${esc(o.id)}</strong>
              <div style="font-size:0.75rem;color:var(--muted);margin-top:3px;">${esc(dateStr)}</div>
            </td>
            <td><div class="order-acc-cell">${accHtml}</div></td>
            <td><div class="order-items-cell">${itemsHtml}</div></td>
            <td><strong class="order-price">${o.total || 0} ج.م</strong></td>
            <td><span class="status-pill active-pill" style="font-size:0.75rem;">${esc(o.paymentMethod || 'فودافون كاش')}</span></td>
            <td>
              <select class="order-status-select" data-order-action="change-status" data-order-id="${esc(o.id)}" aria-label="تغيير حالة الطلب">
                <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>قيد الانتظار</option>
                <option value="paid" ${currentStatus === 'paid' ? 'selected' : ''}>تم التحويل</option>
                <option value="processing" ${currentStatus === 'processing' ? 'selected' : ''}>جاري التنفيذ</option>
                <option value="delivered" ${currentStatus === 'delivered' ? 'selected' : ''}>تم التسليم</option>
                <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>ملغي</option>
              </select>
            </td>
            <td>${receiptHtml}</td>
            <td>
              <div class="button-row" style="gap:4px;">
                <button type="button" class="icon-btn" data-order-action="view-details" data-order-id="${esc(o.id)}" title="عرض تفاصيل الطلب والحالة">
                  <i data-icon="eye"></i>
                </button>
                ${o.hasReceipt && o.receipt?.dataUrl ? `
                  <button type="button" class="icon-btn" data-order-action="download-receipt" data-order-id="${esc(o.id)}" title="تحميل صورة الإيصال">
                    <i data-icon="download"></i>
                  </button>
                ` : ''}
                <button type="button" class="icon-btn danger-text" data-order-action="delete-order" data-order-id="${esc(o.id)}" title="حذف الطلب">
                  <i data-icon="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      icons();
    } catch (err) {
      console.error('Failed to render orders:', err);
    }
  }

  // Admin Orders Table Interactions (Click & Change)
  $('adminOrders')?.addEventListener('change', async event => {
    const statusSelect = event.target.closest('[data-order-action="change-status"]');
    if (statusSelect) {
      const orderId = statusSelect.dataset.orderId;
      const newStatus = statusSelect.value;
      try {
        if (window.KenoFirebase && typeof window.KenoFirebase.updateOrderStatus === 'function') {
          await window.KenoFirebase.updateOrderStatus(orderId, newStatus);
        } else {
          await KenoOrderStore.updateOrderStatus(orderId, newStatus);
        }
        toast(`تم تحديث حالة الطلب ${orderId} إلى: ${statusSelect.options[statusSelect.selectedIndex]?.text}`);
        await renderAdminOrders();
      } catch (e) {
        toast(`فشل تحديث الحالة: ${e.message}`);
      }
    }
  });

  $('adminOrders')?.addEventListener('click', async event => {
    // View Details Modal
    const detailsBtn = event.target.closest('[data-order-action="view-details"]');
    if (detailsBtn) {
      const orderId = detailsBtn.dataset.orderId;
      let order = null;
      if (window.KenoFirebase && typeof window.KenoFirebase.getOrder === 'function') {
        order = await window.KenoFirebase.getOrder(orderId);
      }
      if (!order) order = await KenoOrderStore.getOrder(orderId);
      if (!order) {
        toast('لم يتم العثور على بيانات الطلب.');
        return;
      }

      if ($('orderModalCode')) $('orderModalCode').textContent = '#' + order.id;
      if ($('orderModalCustomerName')) $('orderModalCustomerName').textContent = order.customerName || 'عميل كينو';
      if ($('orderModalCustomerPhone')) $('orderModalCustomerPhone').textContent = order.customerPhone || '—';
      
      const emailRow = $('orderModalEmailRow');
      if (emailRow) {
        emailRow.hidden = !order.customerEmail;
        if (order.customerEmail) $('orderModalCustomerEmail').textContent = order.customerEmail;
      }

      const accRow = $('orderModalAccountRow');
      if (accRow) {
        accRow.hidden = !order.customerAccount;
        if (order.customerAccount) $('orderModalCustomerAccount').textContent = order.customerAccount;
      }

      const notesRow = $('orderModalNotesRow');
      if (notesRow) {
        notesRow.hidden = !order.notes;
        if (order.notes) $('orderModalCustomerNotes').textContent = order.notes;
      }

      const dateStr = order.dateStr || (order.timestamp ? new Date(order.timestamp).toLocaleString('ar-EG') : '—');
      if ($('orderModalDate')) $('orderModalDate').textContent = dateStr;
      if ($('orderModalPaymentMethod')) $('orderModalPaymentMethod').textContent = order.paymentMethod || '—';
      if ($('orderModalTotalAmount')) $('orderModalTotalAmount').textContent = `${order.total || 0} ج.م`;

      const statusBadge = $('orderModalStatusBadge');
      if (statusBadge) {
        const statuses = root.KenoConfig?.ORDER_STATUSES || {};
        const stInfo = statuses[order.status || 'pending'] || { label: order.status || 'قيد الانتظار', class: 'status-pending' };
        statusBadge.textContent = stInfo.label;
        statusBadge.className = `status-pill ${stInfo.class || 'status-pending'}`;
      }

      const statusSelect = $('orderModalStatusSelect');
      if (statusSelect) {
        statusSelect.value = order.status || 'pending';
        statusSelect.onchange = async () => {
          const newSt = statusSelect.value;
          try {
            if (window.KenoFirebase && typeof window.KenoFirebase.updateOrderStatus === 'function') {
              await window.KenoFirebase.updateOrderStatus(order.id, newSt);
            } else {
              await KenoOrderStore.updateOrderStatus(order.id, newSt);
            }
            order.status = newSt;
            const statuses = root.KenoConfig?.ORDER_STATUSES || {};
            const stInfo = statuses[newSt] || { label: newSt, class: 'status-pending' };
            if (statusBadge) {
              statusBadge.textContent = stInfo.label;
              statusBadge.className = `status-pill ${stInfo.class || 'status-pending'}`;
            }
            toast(`تم تحديث حالة الطلب إلى: ${stInfo.label}`);
            await renderAdminOrders();
          } catch (e) {
            toast(`فشل تحديث الحالة: ${e.message}`);
          }
        };
      }

      // Items Table in Modal
      const itemsTbody = $('orderModalItemsBody');
      if (itemsTbody) {
        if (order.items && order.items.length > 0) {
          itemsTbody.innerHTML = order.items.map(it => `
            <tr>
              <td><strong>${esc(it.serviceName)}</strong></td>
              <td>${esc(it.planLabel || '—')}</td>
              <td>${it.quantity || 1}</td>
              <td><strong>${it.price || 0} ج.م</strong></td>
            </tr>
          `).join('');
        } else {
          itemsTbody.innerHTML = `
            <tr>
              <td><strong>${esc(order.serviceName || 'طلب مخصص')}</strong></td>
              <td>${esc(order.planLabel || '—')}</td>
              <td>1</td>
              <td><strong>${order.total || 0} ج.م</strong></td>
            </tr>
          `;
        }
      }

      // Receipt in Modal
      const receiptPanel = $('orderModalReceiptPanel');
      if (receiptPanel) {
        if (order.hasReceipt && order.receipt?.dataUrl) {
          receiptPanel.hidden = false;
          if ($('orderModalReceiptImg')) {
            $('orderModalReceiptImg').src = order.receipt.dataUrl;
            $('orderModalReceiptImg').onclick = () => {
              activeViewerReceipt = {
                orderId: order.id,
                dataUrl: order.receipt.dataUrl,
                fileName: order.receipt.fileName || `receipt-${order.id}.webp`
              };
              if ($('receiptViewerOrderCode')) $('receiptViewerOrderCode').textContent = order.id;
              if ($('receiptViewerImg')) $('receiptViewerImg').src = order.receipt.dataUrl;
              $('receiptViewerDialog')?.showModal();
            };
          }
          if ($('orderModalViewReceiptFullBtn')) {
            $('orderModalViewReceiptFullBtn').onclick = () => {
              activeViewerReceipt = {
                orderId: order.id,
                dataUrl: order.receipt.dataUrl,
                fileName: order.receipt.fileName || `receipt-${order.id}.webp`
              };
              if ($('receiptViewerOrderCode')) $('receiptViewerOrderCode').textContent = order.id;
              if ($('receiptViewerImg')) $('receiptViewerImg').src = order.receipt.dataUrl;
              $('receiptViewerDialog')?.showModal();
            };
          }
        } else {
          receiptPanel.hidden = true;
        }
      }

      // WhatsApp Customer direct button
      const waBtn = $('orderModalWhatsAppCustomerBtn');
      if (waBtn) {
        const phone = order.customerPhone ? OrderUtils.cleanWhatsAppNumber(order.customerPhone) : '';
        if (phone) {
          waBtn.hidden = false;
          const msg = `مرحبًا بك من متجر Keno Store\nبخصوص طلبك رقم #${order.id}:`.normalize('NFC');
          waBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        } else {
          waBtn.hidden = true;
        }
      }

      // Modal Delete button
      const modalDelBtn = $('orderModalDeleteBtn');
      if (modalDelBtn) {
        modalDelBtn.onclick = async () => {
          if (await confirmAction('حذف الطلب؟', `هل أنت متأكد من حذف الطلب ${order.id}؟`, 'حذف الطلب')) {
            if (window.KenoFirebase && typeof window.KenoFirebase.deleteOrder === 'function') {
              await window.KenoFirebase.deleteOrder(order.id);
            } else {
              await KenoOrderStore.deleteOrder(order.id);
            }
            closeDialog('orderDetailsDialog');
            await renderAdminOrders();
            toast(`تم حذف الطلب ${order.id} بنجاح.`);
          }
        };
      }

      $('orderDetailsDialog')?.showModal();
      icons();
      return;
    }

    const viewBtn = event.target.closest('[data-order-action="view-receipt"]');
    if (viewBtn) {
      const orderId = viewBtn.dataset.orderId;
      let order = null;
      if (window.KenoFirebase && typeof window.KenoFirebase.getOrder === 'function') {
        order = await window.KenoFirebase.getOrder(orderId);
      }
      if (!order) order = await KenoOrderStore.getOrder(orderId);
      if (!order || !order.receipt?.dataUrl) {
        toast('لم يتم العثور على صورة الإيصال.');
        return;
      }

      activeViewerReceipt = {
        orderId: order.id,
        dataUrl: order.receipt.dataUrl,
        fileName: order.receipt.fileName || `receipt-${order.id}.webp`
      };

      if ($('receiptViewerOrderCode')) $('receiptViewerOrderCode').textContent = '#' + order.id;
      if ($('receiptViewerImg')) $('receiptViewerImg').src = order.receipt.dataUrl;

      const metaContainer = $('receiptViewerMeta');
      if (metaContainer) {
        metaContainer.innerHTML = `
          <div class="receipt-meta-grid">
            <div><span class="meta-label">تاريخ الطلب:</span> <strong>${esc(order.dateStr || (order.timestamp ? new Date(order.timestamp).toLocaleString('ar-EG') : '—'))}</strong></div>
            <div><span class="meta-label">إجمالي المبلغ:</span> <strong>${order.total || 0} ج.م</strong></div>
            <div><span class="meta-label">وسيلة الدفع:</span> <strong>${esc(order.paymentMethod || '—')}</strong></div>
            ${order.customerAccount ? `<div><span class="meta-label">الحساب المستلم:</span> <strong>${esc(order.customerAccount)}</strong></div>` : ''}
            ${order.customerPhone ? `<div><span class="meta-label">هاتف العميل:</span> <strong dir="ltr">${esc(order.customerPhone)}</strong></div>` : ''}
            ${order.transferNumber ? `<div><span class="meta-label">رقم التحويل:</span> <strong dir="ltr">${esc(order.transferNumber)}</strong></div>` : ''}
          </div>
        `;
      }

      $('receiptViewerDialog')?.showModal();
      return;
    }

    const downloadBtn = event.target.closest('[data-order-action="download-receipt"]');
    if (downloadBtn) {
      const orderId = downloadBtn.dataset.orderId;
      let order = null;
      if (window.KenoFirebase && typeof window.KenoFirebase.getOrder === 'function') {
        order = await window.KenoFirebase.getOrder(orderId);
      }
      if (!order) order = await KenoOrderStore.getOrder(orderId);
      if (order && order.receipt?.dataUrl) {
        const link = document.createElement('a');
        link.href = order.receipt.dataUrl;
        link.download = order.receipt.fileName || `receipt-${order.id}.webp`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('جاري تنزيل صورة الإيصال...');
      }
      return;
    }

    const delBtn = event.target.closest('[data-order-action="delete-order"]');
    if (delBtn) {
      const orderId = delBtn.dataset.orderId;
      if (await confirmAction('حذف الطلب؟', `هل أنت متأكد من حذف الطلب ${orderId} والإيصال المرفق به؟`, 'حذف الطلب')) {
        if (window.KenoFirebase && typeof window.KenoFirebase.deleteOrder === 'function') {
          await window.KenoFirebase.deleteOrder(orderId);
        } else {
          await KenoOrderStore.deleteOrder(orderId);
        }
        await renderAdminOrders();
        toast(`تم حذف الطلب ${orderId} بنجاح.`);
      }
      return;
    }
  });

  // Status Filter Change Listener
  $('ordersStatusFilter')?.addEventListener('change', () => {
    renderAdminOrders();
  });

  // Download Receipt from Viewer Dialog
  $('downloadReceiptBtn')?.addEventListener('click', () => {
    if (!activeViewerReceipt) return;
    const link = document.createElement('a');
    link.href = activeViewerReceipt.dataUrl;
    link.download = activeViewerReceipt.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast('جاري تنزيل صورة الإيصال...');
  });

  // Clear All Orders
  $('clearOrdersHistoryBtn')?.addEventListener('click', async () => {
    if (await confirmAction('مسح سجل الطلبات بالكامل؟', 'هل أنت متأكد من مسح كافة الطلبات والإيصالات المحفوظة محليًا؟ لن يمكن استرجاعها.', 'مسح السجل بالكامل')) {
      await KenoOrderStore.clearOrders();
      await renderAdminOrders();
      toast('تم مسح سجل الطلبات بالكامل.');
    }
  });

  // Orders Search input listener
  $('ordersSearch')?.addEventListener('input', () => {
    renderAdminOrders();
  });

  // --- Settings Form & Auto-Save ---
  let settingsAutoSaveTimer = null;

  function saveSettingsDraft(silent = false) {
    if (!adminOpen || !draft || publishing) return;
    try {
      const next = JSON.parse(JSON.stringify(draft));
      const form = $('settingsForm');
      if (!form) return;
      for (const field of ['storeName', 'tagline', 'whatsapp', 'paymentPhone', 'instapay', 'workingHours', 'facebook', 'instagram', 'tiktok', 'telegram', 'announcement']) {
        if (form.elements[field]) {
          next.settings[field] = form.elements[field].value.trim();
        }
      }
      next.settings.facebookEnabled = Boolean(form.elements.facebookEnabled?.checked);
      next.settings.instagramEnabled = Boolean(form.elements.instagramEnabled?.checked);
      next.settings.tiktokEnabled = Boolean(form.elements.tiktokEnabled?.checked);
      next.settings.telegramEnabled = Boolean(form.elements.telegramEnabled?.checked);

      // Keep paymentMethods in sync with settingsForm updates
      if (Array.isArray(next.paymentMethods)) {
        const vodafone = next.paymentMethods.find(m => m.id === 'vodafone-cash' || m.id.includes('vodafone'));
        if (vodafone && next.settings.paymentPhone) {
          vodafone.number = next.settings.paymentPhone;
        }
        const insta = next.paymentMethods.find(m => m.id === 'instapay' || m.id.includes('insta'));
        if (insta && next.settings.instapay) {
          insta.number = next.settings.instapay;
        }
      }
      draft = CatalogParser.validate(next);
      settingsDirty = false;
      saveDraft();
      if (!silent) {
        renderAdmin();
        toast('تم حفظ الإعدادات في المسودة بنجاح.');
      }
    } catch (error) {
      if (!silent) showAdminMessage(error.message);
    }
  }

  $('settingsForm')?.addEventListener('input', () => {
    settingsDirty = true;
    clearTimeout(settingsAutoSaveTimer);
    settingsAutoSaveTimer = setTimeout(() => {
      saveSettingsDraft(true);
    }, 700);
  });

  $('settingsForm')?.addEventListener('change', () => {
    settingsDirty = true;
    saveSettingsDraft(true);
  });

  $('settingsForm')?.addEventListener('submit', event => {
    event.preventDefault();
    clearTimeout(settingsAutoSaveTimer);
    saveSettingsDraft(false);
  });

  // --- Service Editor ---
  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // --- Service Editor & Professional Package Management ---
  let currentEditorPlans = [];
  let currentPlanFilterGroup = 'all';
  let currentPlanFilterStatus = 'all';
  let currentPlanSearchQuery = '';
  let editingPlanModalId = null;
  let masterPlanEditingRef = null; // { serviceId, planId } when editing from master table
  let editorInitialSnapshot = '';

  function updateStickyBar() {
    const dot = $('stickyChangeDot');
    const text = $('stickyChangeText');
    if (!dot || !text) return;

    const form = $('serviceForm');
    let unsavedCount = 0;

    let initObj = null;
    try { initObj = JSON.parse(editorInitialSnapshot || '{}'); } catch (_) {}

    if (initObj) {
      if ((form?.elements.name?.value || '') !== (initObj.name || '')) unsavedCount++;
      if ((form?.elements.category?.value || '') !== (initObj.category || '')) unsavedCount++;
      if ((form?.elements.image?.value || '') !== (initObj.image || '')) unsavedCount++;
      if (Boolean(form?.elements.visible?.checked) !== Boolean(initObj.visible)) unsavedCount++;
      if (Boolean(form?.elements.featured?.checked) !== Boolean(initObj.featured)) unsavedCount++;

      const initPlans = initObj.plans || [];
      if (initPlans.length !== currentEditorPlans.length) {
        unsavedCount += Math.abs(currentEditorPlans.length - initPlans.length);
      } else {
        const diffPlans = currentEditorPlans.filter((p, i) => {
          const orig = initPlans[i];
          if (!orig) return true;
          return orig.label !== p.label || orig.price !== p.price || orig.originalPrice !== p.originalPrice || orig.available !== p.available || orig.group !== p.group;
        });
        unsavedCount += diffPlans.length;
      }
    }

    if (editorDirty && unsavedCount === 0) unsavedCount = 1;

    if (unsavedCount > 0) {
      dot.classList.add('dirty');
      let countStr = `${unsavedCount} تعديل غير محفوظ`;
      if (unsavedCount === 1) countStr = 'تعديل واحد غير محفوظ';
      else if (unsavedCount === 2) countStr = 'تعديلان غير محفوظين';
      else if (unsavedCount >= 3 && unsavedCount <= 10) countStr = `${unsavedCount} تعديلات غير محفوظة`;
      text.textContent = countStr;
    } else {
      dot.classList.remove('dirty');
      text.textContent = 'لا توجد تعديلات غير محفوظة';
    }
  }

  function updateImagePreview() {
    const form = $('serviceForm');
    const previewContainer = $('imagePreview');
    if (!form || !previewContainer) return;

    const imgVal = form.elements.image?.value?.trim() || '';
    const badgeVal = form.elements.badge?.value?.trim() || '';

    const promptEl = $('editorDropzonePrompt');

    if (imgVal) {
      if (promptEl) promptEl.hidden = true;
      previewContainer.hidden = false;
      previewContainer.innerHTML = `
        <div class="admin-image-preview-banner">
          <img src="${esc(imgVal)}" alt="معاينة البانر" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'50\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%2394a3b8\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'10\\'>صورة غير صالحة</text></svg>'">
          ${badgeVal ? `<span class="preview-badge-overlay">${esc(badgeVal)}</span>` : ''}
        </div>
        <div class="admin-image-preview-meta">
          <span class="preview-helper-text">
            <i data-icon="check-circle" style="color:#16a34a;width:14px;height:14px;"></i>
            معاينة حية: نسبة 2:1 مطابقة للبطاقة
          </span>
          <button type="button" id="removeImageBtn" class="button button-outline small danger-text">حذف الصورة</button>
        </div>
      `;
      hydrateIcons(previewContainer);
      $('removeImageBtn')?.addEventListener('click', () => {
        form.elements.image.value = '';
        previewContainer.hidden = true;
        previewContainer.innerHTML = '';
        if (promptEl) promptEl.hidden = false;
        editorDirty = true;
        updateStickyBar();
      });
    } else {
      if (promptEl) promptEl.hidden = false;
      previewContainer.hidden = true;
      previewContainer.innerHTML = '';
    }
  }

  function renderEditorPlansTable() {
    const tbody = $('editorPlansTableBody');
    const emptyNotice = $('editorPlansEmptyState');
    const countBadge = $('editorPlanCountBadge');
    if (!tbody) return;

    if (countBadge) {
      countBadge.textContent = `${currentEditorPlans.length} باقة`;
    }

    // Extract unique groups for filter dropdown and datalist
    const groups = [...new Set(currentEditorPlans.map(p => p.group || 'الباقات'))].filter(Boolean);
    const groupFilter = $('editorPlanGroupFilter');
    if (groupFilter) {
      const currentSelected = groupFilter.value;
      groupFilter.innerHTML = '<option value="all">كل المجموعات</option>' +
        groups.map(g => `<option value="${esc(g)}" ${g === currentSelected ? 'selected' : ''}>${esc(g)}</option>`).join('');
    }

    const datalist = $('planGroupDatalist');
    if (datalist) {
      datalist.innerHTML = groups.map(g => `<option value="${esc(g)}">`).join('');
    }

    // Filter plans
    const q = (currentPlanSearchQuery || '').toLowerCase().trim();
    const filtered = currentEditorPlans.filter(p => {
      if (currentPlanFilterGroup !== 'all' && (p.group || 'الباقات') !== currentPlanFilterGroup) return false;
      if (currentPlanFilterStatus === 'active' && !p.available) return false;
      if (currentPlanFilterStatus === 'inactive' && p.available) return false;
      if (q) {
        const matchLabel = (p.label || '').toLowerCase().includes(q);
        const matchNote = (p.note || '').toLowerCase().includes(q);
        const matchGroup = (p.group || '').toLowerCase().includes(q);
        const matchPrice = String(p.price || '').includes(q);
        if (!matchLabel && !matchNote && !matchGroup && !matchPrice) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyNotice) emptyNotice.hidden = false;
      return;
    }

    if (emptyNotice) emptyNotice.hidden = true;

    tbody.innerHTML = filtered.map(p => {
      const hasDiscount = p.originalPrice && p.originalPrice > p.price;
      const savings = hasDiscount ? Math.round(p.originalPrice - p.price) : 0;
      const discountPct = hasDiscount ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

      return `
        <tr data-plan-id="${esc(p.id)}">
          <td data-label="اسم الباقة">
            <div class="plan-col-label">
              <span>${esc(p.label)}</span>
              ${p.note ? `<span class="plan-col-note">${esc(p.note)}</span>` : ''}
            </div>
          </td>
          <td data-label="السعر الحالي">
            <span class="plan-price-num">${money(p.price)}</span>
            <span class="plan-currency">ج.م</span>
          </td>
          <td data-label="قبل الخصم">
            ${hasDiscount ? `
              <span class="plan-old-price-del">${money(p.originalPrice)} ج.م</span>
              <span class="badge-saving">وفر ${savings} (${discountPct}%)</span>
            ` : '<span style="color:#94a3b8;">—</span>'}
          </td>
          <td data-label="المجموعة">
            <span class="group-tag-pill">${esc(p.group || 'الباقات')}</span>
          </td>
          <td data-label="الحالة">
            <span class="plan-status-badge ${p.available ? 'active' : 'inactive'}" data-toggle-plan="${esc(p.id)}" title="اضغط لتبديل حالة التوفر">
              ${p.available ? '✓ متاحة' : '✗ غير متاحة'}
            </span>
          </td>
          <td class="actions-cell">
            <div class="plan-actions-group">
              <button type="button" class="table-action-btn edit-btn" data-edit-plan="${esc(p.id)}" title="تعديل الباقة" aria-label="تعديل الباقة">
                ${icon('edit-3')}
              </button>
              <button type="button" class="table-action-btn duplicate-btn" data-duplicate-plan="${esc(p.id)}" title="تكرار الباقة" aria-label="تكرار الباقة">
                ${icon('copy')}
              </button>
              <button type="button" class="table-action-btn delete-btn" data-delete-plan="${esc(p.id)}" title="حذف الباقة" aria-label="حذف الباقة">
                ${icon('trash-2')}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    hydrateIcons(tbody);
  }

  function openPlanModal(plan, masterRef = null) {
    editingPlanModalId = plan ? plan.id : null;
    masterPlanEditingRef = masterRef; // when editing from master pricing table

    $('planDialogTitle').textContent = plan ? `تعديل باقة: ${plan.label}` : 'إضافة باقة جديدة';
    $('planLabelInput').value = plan?.label || '';
    $('planPriceInput').value = plan?.price !== undefined ? plan.price : '';
    $('planOriginalPriceInput').value = (plan?.originalPrice && plan.originalPrice > 0) ? plan.originalPrice : '';
    $('planGroupInput').value = plan?.group || (currentEditorPlans[0]?.group || 'الباقات');
    $('planNoteInput').value = plan?.note || '';
    $('planAvailableInput').checked = plan ? Boolean(plan.available) : true;

    $('planDialog').showModal();
    $('planLabelInput').focus();
  }

  function openEditor(id) {
    if (!adminOpen || !draft || publishing) return;
    const existing = draft.services.find(s => s.id === id);
    editingServiceId = existing?.id || null;

    const service = existing || {
      id: newId('service'),
      name: '',
      category: draft.categories[0]?.id || 'games',
      description: '',
      mark: 'KENO',
      badge: '',
      icon: 'globe',
      image: '',
      color: 'red',
      visible: true,
      featured: false,
      aliases: '',
      notes: [],
      plans: []
    };

    const form = $('serviceForm');
    $('editorTitle').textContent = existing ? `تعديل خدمة: ${existing.name}` : 'إضافة خدمة جديدة';

    // Categories dropdown
    $('editorCategory').innerHTML = draft.categories.map(c => `
      <option value="${esc(c.id)}" ${service.category === c.id ? 'selected' : ''}>${esc(c.name)}</option>
    `).join('');

    // Icons dropdown
    const iconLabels = Config.ICON_LABELS || {};
    $('editorIcon').innerHTML = Object.entries(iconLabels).map(([val, label]) => `
      <option value="${val}" ${service.icon === val ? 'selected' : ''}>${label}</option>
    `).join('');

    // Colors dropdown
    const colorLabels = Config.COLOR_LABELS || {};
    $('editorColor').innerHTML = Object.entries(colorLabels).map(([val, label]) => `
      <option value="${val}" ${service.color === val ? 'selected' : ''}>${label}</option>
    `).join('');

    for (const field of ['name', 'category', 'description', 'mark', 'badge', 'color', 'icon', 'aliases']) {
      if (form.elements[field]) form.elements[field].value = service[field] || '';
    }

    form.elements.image.value = service.image || '';

    let statusVal = 'visible';
    if (!service.visible || service.status === 'hidden') {
      statusVal = 'hidden';
    } else if (service.available === false || service.status === 'unavailable') {
      statusVal = 'unavailable';
    }
    if (form.elements.serviceStatus) {
      form.elements.serviceStatus.value = statusVal;
    }
    if (form.elements.featured) {
      form.elements.featured.checked = Boolean(service.featured);
    }
    form.elements.notes.value = (service.notes || []).join('\n');

    // Initialize plans state
    currentEditorPlans = (service.plans || []).map(p => ({ ...p }));
    currentPlanFilterGroup = 'all';
    currentPlanFilterStatus = 'all';
    currentPlanSearchQuery = '';
    if ($('editorPlanSearch')) $('editorPlanSearch').value = '';
    if ($('editorPlanGroupFilter')) $('editorPlanGroupFilter').value = 'all';
    if ($('editorPlanStatusFilter')) $('editorPlanStatusFilter').value = 'all';

    // Render 2:1 live image preview
    updateImagePreview();

    // Render compact plans table
    renderEditorPlansTable();

    if ($('editorError')) $('editorError').hidden = true;
    if ($('deleteServiceButton')) $('deleteServiceButton').hidden = !existing;
    if ($('cloneServiceButton')) $('cloneServiceButton').hidden = !existing;

    editorDirty = false;
    editorInitialSnapshot = JSON.stringify({
      name: service.name,
      category: service.category,
      image: service.image,
      visible: service.visible,
      featured: service.featured,
      plans: currentEditorPlans
    });
    updateStickyBar();

    $('editorDialog').showModal();
  }

  $('addServiceButton')?.addEventListener('click', () => openEditor(null));

  // Package Management Event Delegation inside Editor Dialog
  $('editorPlansTableBody')?.addEventListener('click', async event => {
    const toggleBtn = event.target.closest('[data-toggle-plan]');
    if (toggleBtn) {
      const id = toggleBtn.dataset.togglePlan;
      const plan = currentEditorPlans.find(p => p.id === id);
      if (plan) {
        plan.available = !plan.available;
        editorDirty = true;
        renderEditorPlansTable();
        updateStickyBar();
        toast(`تم تحويل باقة "${plan.label}" إلى ${plan.available ? 'متاحة' : 'غير متاحة'}.`);
      }
      return;
    }

    const editBtn = event.target.closest('[data-edit-plan]');
    if (editBtn) {
      const id = editBtn.dataset.editPlan;
      const plan = currentEditorPlans.find(p => p.id === id);
      if (plan) openPlanModal(plan);
      return;
    }

    const dupBtn = event.target.closest('[data-duplicate-plan]');
    if (dupBtn) {
      const id = dupBtn.dataset.duplicatePlan;
      const plan = currentEditorPlans.find(p => p.id === id);
      if (plan) {
        const clone = {
          ...JSON.parse(JSON.stringify(plan)),
          id: newId('plan'),
          label: `${plan.label} (نسخة)`
        };
        currentEditorPlans.push(clone);
        editorDirty = true;
        renderEditorPlansTable();
        updateStickyBar();
        toast(`تم تكرار باقة "${clone.label}".`);
      }
      return;
    }

    const delBtn = event.target.closest('[data-delete-plan]');
    if (delBtn) {
      const id = delBtn.dataset.deletePlan;
      const plan = currentEditorPlans.find(p => p.id === id);
      if (plan) {
        if (await confirmAction('حذف الباقة؟', `هل أنت متأكد من حذف باقة "${plan.label}" نهائيًا؟`, 'حذف الباقة')) {
          currentEditorPlans = currentEditorPlans.filter(p => p.id !== id);
          editorDirty = true;
          renderEditorPlansTable();
          updateStickyBar();
          toast(`تم حذف باقة "${plan.label}".`);
        }
      }
      return;
    }
  });

  // Add Plan Button
  $('addPlanButton')?.addEventListener('click', () => openPlanModal(null));

  // Search & Filter listeners for Service Editor Plans
  $('editorPlanSearch')?.addEventListener('input', event => {
    currentPlanSearchQuery = event.target.value;
    renderEditorPlansTable();
  });
  $('editorPlanGroupFilter')?.addEventListener('change', event => {
    currentPlanFilterGroup = event.target.value;
    renderEditorPlansTable();
  });
  $('editorPlanStatusFilter')?.addEventListener('change', event => {
    currentPlanFilterStatus = event.target.value;
    renderEditorPlansTable();
  });

  // Package Modal (planDialog) Form Submission
  $('planForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const label = $('planLabelInput').value.trim();
    const price = Number($('planPriceInput').value);
    const origVal = $('planOriginalPriceInput').value.trim();
    const originalPrice = origVal ? Number(origVal) : null;
    const group = $('planGroupInput').value.trim() || 'الباقات';
    const note = $('planNoteInput').value.trim();
    const available = $('planAvailableInput').checked;

    if (!label) {
      toast('يرجى كتابة اسم الباقة.');
      return;
    }
    if (isNaN(price) || price <= 0) {
      toast('يرجى كتابة سعر صحيح أكبر من صفر.');
      return;
    }
    if (originalPrice !== null && (isNaN(originalPrice) || originalPrice <= 0)) {
      toast('السعر قبل الخصم يجب أن يكون رقمًا موجبًا.');
      return;
    }

    // If editing from Master Pricing Table
    if (masterPlanEditingRef) {
      const { serviceId, planId } = masterPlanEditingRef;
      const srv = draft.services.find(s => s.id === serviceId);
      if (srv) {
        const pIdx = srv.plans.findIndex(p => p.id === planId);
        if (pIdx !== -1) {
          srv.plans[pIdx] = { ...srv.plans[pIdx], label, price, originalPrice, group, note, available };
          saveDraft();
          renderMasterPlansTable();
          renderAdmin();
          toast(`تم تعديل باقة "${label}" بنجاح.`);
        }
      }
      masterPlanEditingRef = null;
      closeDialog('planDialog');
      return;
    }

    // Editing inside Service Editor
    if (editingPlanModalId) {
      const idx = currentEditorPlans.findIndex(p => p.id === editingPlanModalId);
      if (idx !== -1) {
        currentEditorPlans[idx] = {
          ...currentEditorPlans[idx],
          label,
          price,
          originalPrice,
          group,
          note,
          available
        };
      }
      toast(`تم تعديل باقة "${label}" بنجاح.`);
    } else {
      const newPlan = {
        id: newId('plan'),
        label,
        price,
        originalPrice,
        group,
        note,
        available
      };
      currentEditorPlans.push(newPlan);
      toast(`تمت إضافة باقة "${label}" بنجاح.`);
    }

    editorDirty = true;
    closeDialog('planDialog');
    renderEditorPlansTable();
    updateStickyBar();
  });

  $('cancelPlanBtn')?.addEventListener('click', () => closeDialog('planDialog'));
  $('cancelPlanBtnTop')?.addEventListener('click', () => closeDialog('planDialog'));

  // Service Form Change & Input Listeners
  $('serviceForm')?.addEventListener('input', () => {
    editorDirty = true;
    updateStickyBar();
    updateImagePreview();
  });
  $('serviceForm')?.addEventListener('change', () => {
    editorDirty = true;
    updateStickyBar();
    updateImagePreview();
  });

  // Image Auto-Compression on file upload with 2:1 ratio
  async function processEditorImageFile(file) {
    if (!file) return;
    try {
      toast('جارٍ قص وتوسيط وضغط الصورة للنسبة 2:1 تلقائيًا...');
      const compressedDataUrl = await ImageUtils.compressAndResize(file, { targetWidth: 800 });
      $('editorImage').value = compressedDataUrl;
      updateImagePreview();
      editorDirty = true;
      updateStickyBar();
      toast('تم ضغط الصورة وتحويلها لبانر 2:1 بنجاح.');
    } catch (err) {
      toast('خطأ في معالجة الصورة: ' + err.message);
    }
  }

  $('editorImageFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await processEditorImageFile(file);
  });

  const editorDropzone = $('editorImageDropzone');
  if (editorDropzone) {
    editorDropzone.addEventListener('click', e => {
      if (e.target.closest('button, input')) return;
      $('editorImageFile')?.click();
    });
    ['dragenter', 'dragover'].forEach(evName => {
      editorDropzone.addEventListener(evName, e => {
        e.preventDefault();
        e.stopPropagation();
        editorDropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evName => {
      editorDropzone.addEventListener(evName, e => {
        e.preventDefault();
        e.stopPropagation();
        editorDropzone.classList.remove('drag-over');
      });
    });
    editorDropzone.addEventListener('drop', async e => {
      const file = e.dataTransfer?.files?.[0];
      if (file) await processEditorImageFile(file);
    });
  }

  // Preview Service / Changes Button in Sticky Save Bar
  $('previewServiceBtn')?.addEventListener('click', () => {
    const form = $('serviceForm');
    const tempService = {
      id: editingServiceId || 'preview-temp-service',
      name: form?.elements.name?.value.trim() || 'معاينة الخدمة',
      category: form?.elements.category?.value || 'games',
      description: form?.elements.description?.value.trim() || '',
      mark: form?.elements.mark?.value.trim() || 'KENO',
      badge: form?.elements.badge?.value.trim() || '',
      icon: form?.elements.icon?.value || 'globe',
      color: form?.elements.color?.value || 'red',
      image: form?.elements.image?.value.trim() || '',
      visible: true,
      featured: Boolean(form?.elements.featured?.checked),
      plans: currentEditorPlans.length > 0 ? currentEditorPlans : [
        { id: 'temp-1', label: 'باقة تجريبية للمعاينة', price: 99, group: 'الباقات', available: true }
      ]
    };
    openService(tempService);
  });

  // Service Form Submission (Save All Changes)
  $('serviceForm')?.addEventListener('submit', event => {
    event.preventDefault();
    if (!adminOpen || !draft || publishing) return;

    try {
      const form = $('serviceForm');
      const service = {
        id: editingServiceId || newId('service')
      };

      for (const field of ['name', 'category', 'description', 'mark', 'badge', 'icon', 'color', 'image', 'aliases']) {
        service[field] = form.elements[field]?.value.trim() || '';
      }
      const st = form.elements.serviceStatus?.value || 'visible';
      service.visible = st !== 'hidden';
      service.available = st === 'visible';
      service.status = st;
      service.featured = Boolean(form.elements.featured?.checked);

      service.notes = form.elements.notes.value.split('\n').map(n => n.trim()).filter(Boolean);
      service.plans = JSON.parse(JSON.stringify(currentEditorPlans));

      const next = JSON.parse(JSON.stringify(draft));
      const index = next.services.findIndex(s => s.id === editingServiceId);
      if (index >= 0) {
        next.services[index] = service;
      } else {
        next.services.unshift(service);
      }

      draft = CatalogParser.validate(next);
      editorDirty = false;
      saveDraft();
      renderAdmin();
      renderStore();
      closeDialog('editorDialog');
      toast('تم حفظ الخدمة والباقات في المسودة بنجاح.');
    } catch (error) {
      if ($('editorError')) {
        $('editorError').textContent = error.message;
        $('editorError').hidden = false;
      }
    }
  });

  // Duplicate / Clone Service Button
  $('cloneServiceButton')?.addEventListener('click', async () => {
    if (!editingServiceId || !draft) return;
    if (await confirmAction('نسخ هذه الخدمة كخدمة جديدة؟', 'سيتم إنشاء نسخة مطابقة بمعرّف جديد لتسهيل إضافة خدمات متشابهة.', 'نسخ الخدمة')) {
      const form = $('serviceForm');
      const clonedId = newId('service');
      const service = {
        id: clonedId,
        name: form.elements.name.value.trim() + ' (نسخة)',
        category: form.elements.category.value,
        description: form.elements.description.value.trim(),
        mark: form.elements.mark.value.trim(),
        badge: form.elements.badge?.value.trim() || '',
        icon: form.elements.icon.value,
        color: form.elements.color.value,
        image: form.elements.image.value.trim(),
        aliases: form.elements.aliases?.value.trim() || '',
        visible: false,
        featured: false,
        notes: form.elements.notes.value.split('\n').map(n => n.trim()).filter(Boolean),
        plans: currentEditorPlans.map(p => ({
          ...JSON.parse(JSON.stringify(p)),
          id: newId('plan')
        }))
      };

      const next = JSON.parse(JSON.stringify(draft));
      next.services.unshift(service);
      draft = CatalogParser.validate(next);
      editorDirty = false;
      saveDraft();
      renderAdmin();
      closeDialog('editorDialog');
      toast('تم نسخ الخدمة بنجاح كمسودة جديدة.');
    }
  });

  // Delete Service Button
  $('deleteServiceButton')?.addEventListener('click', async () => {
    if (!editingServiceId || publishing) return;
    if (await confirmAction('حذف الخدمة بالكامل؟', 'ستُحذف الخدمة وجميع باقاتها من المسودة. يمكنك إخفاؤها بدلاً من حذفها بإلغاء «تظهر في المتجر».', 'حذف الخدمة')) {
      draft.services = draft.services.filter(s => s.id !== editingServiceId);
      editorDirty = false;
      saveDraft();
      renderAdmin();
      closeDialog('editorDialog');
      toast('تم حذف الخدمة من المسودة.');
    }
  });

  // --- Master Pricing View (Storewide All Packages & Prices) ---

  function renderMasterPlansTable() {
    const tbody = $('masterPlansTableBody');
    const emptyNotice = $('masterPlansEmptyNotice');
    if (!tbody || !draft) return;

    // Populate Category Filter dropdown
    const catSelect = $('masterPlanCategoryFilter');
    if (catSelect) {
      const currVal = catSelect.value;
      catSelect.innerHTML = '<option value="all">كل الأقسام</option>' +
        (draft.categories || []).map(c => `<option value="${esc(c.id)}" ${c.id === currVal ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    }

    // Populate Service Filter dropdown
    const srvSelect = $('masterPlanServiceFilter');
    if (srvSelect) {
      const srvs = masterPlanCatFilter === 'all'
        ? draft.services
        : draft.services.filter(s => s.category === masterPlanCatFilter);
      const currVal = srvSelect.value;
      srvSelect.innerHTML = '<option value="all">كل الخدمات</option>' +
        srvs.map(s => `<option value="${esc(s.id)}" ${s.id === currVal ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    }

    // Collect all plans with parent service reference
    const allItems = [];
    (draft.services || []).forEach(srv => {
      const cat = (draft.categories || []).find(c => c.id === srv.category)?.name || srv.category;
      (srv.plans || []).forEach(plan => {
        allItems.push({ plan, service: srv, categoryName: cat });
      });
    });

    const q = (masterPlanSearchQuery || '').toLowerCase().trim();
    const filtered = allItems.filter(item => {
      if (masterPlanCatFilter !== 'all' && item.service.category !== masterPlanCatFilter) return false;
      if (masterPlanSrvFilter !== 'all' && item.service.id !== masterPlanSrvFilter) return false;
      if (masterPlanStatusFilter === 'active' && !item.plan.available) return false;
      if (masterPlanStatusFilter === 'inactive' && item.plan.available) return false;
      if (q) {
        const matchLabel = (item.plan.label || '').toLowerCase().includes(q);
        const matchSrv = (item.service.name || '').toLowerCase().includes(q);
        const matchGroup = (item.plan.group || '').toLowerCase().includes(q);
        const matchCat = (item.categoryName || '').toLowerCase().includes(q);
        if (!matchLabel && !matchSrv && !matchGroup && !matchCat) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyNotice) emptyNotice.hidden = false;
      return;
    }

    if (emptyNotice) emptyNotice.hidden = true;

    tbody.innerHTML = filtered.map(item => {
      const p = item.plan;
      const s = item.service;
      const hasDiscount = p.originalPrice && p.originalPrice > p.price;
      const savings = hasDiscount ? Math.round(p.originalPrice - p.price) : 0;
      const discountPct = hasDiscount ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

      return `
        <tr data-service-id="${esc(s.id)}" data-plan-id="${esc(p.id)}">
          <td data-label="اسم الباقة">
            <div class="plan-col-label">
              <span>${esc(p.label)}</span>
              ${p.note ? `<span class="plan-col-note">${esc(p.note)}</span>` : ''}
            </div>
          </td>
          <td data-label="الخدمة">
            <button type="button" class="text-button" data-master-opensrv="${esc(s.id)}" style="font-weight:700;color:var(--ink);text-decoration:underline;">
              ${esc(s.name)}
            </button>
          </td>
          <td data-label="القسم">
            <span class="group-tag-pill">${esc(item.categoryName)}</span>
          </td>
          <td data-label="السعر الحالي">
            <span class="plan-price-num">${money(p.price)}</span>
            <span class="plan-currency">ج.م</span>
          </td>
          <td data-label="قبل الخصم">
            ${hasDiscount ? `
              <span class="plan-old-price-del">${money(p.originalPrice)} ج.م</span>
              <span class="badge-saving">وفر ${savings} (${discountPct}%)</span>
            ` : '<span style="color:#94a3b8;">—</span>'}
          </td>
          <td data-label="المجموعة">
            <span class="group-tag-pill">${esc(p.group || 'الباقات')}</span>
          </td>
          <td data-label="الحالة">
            <span class="plan-status-badge ${p.available ? 'active' : 'inactive'}" data-master-toggle="${esc(s.id)}:${esc(p.id)}" title="اضغط لتبديل التوفر">
              ${p.available ? '✓ متاحة' : '✗ غير متاحة'}
            </span>
          </td>
          <td class="actions-cell">
            <div class="plan-actions-group">
              <button type="button" class="table-action-btn edit-btn" data-master-edit="${esc(s.id)}:${esc(p.id)}" title="تعديل الباقة">
                ${icon('edit-3')}
              </button>
              <button type="button" class="table-action-btn duplicate-btn" data-master-dup="${esc(s.id)}:${esc(p.id)}" title="تكرار الباقة">
                ${icon('copy')}
              </button>
              <button type="button" class="table-action-btn delete-btn" data-master-del="${esc(s.id)}:${esc(p.id)}" title="حذف الباقة">
                ${icon('trash-2')}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    hydrateIcons(tbody);
  }

  // View Switcher Buttons (Services Grid vs Master Pricing Table)
  $('viewServicesBtn')?.addEventListener('click', () => {
    activeServicesView = 'services';
    $('viewServicesBtn')?.classList.add('active');
    $('viewAllPlansBtn')?.classList.remove('active');
    if ($('servicesGridView')) $('servicesGridView').hidden = false;
    if ($('allPlansMasterView')) $('allPlansMasterView').hidden = true;
  });

  $('viewAllPlansBtn')?.addEventListener('click', () => {
    activeServicesView = 'master-plans';
    $('viewAllPlansBtn')?.classList.add('active');
    $('viewServicesBtn')?.classList.remove('active');
    if ($('servicesGridView')) $('servicesGridView').hidden = true;
    if ($('allPlansMasterView')) $('allPlansMasterView').hidden = false;
    renderMasterPlansTable();
  });

  // Master Pricing Table Filter Listeners
  $('masterPlanSearch')?.addEventListener('input', event => {
    masterPlanSearchQuery = event.target.value;
    renderMasterPlansTable();
  });
  $('masterPlanCategoryFilter')?.addEventListener('change', event => {
    masterPlanCatFilter = event.target.value;
    renderMasterPlansTable();
  });
  $('masterPlanServiceFilter')?.addEventListener('change', event => {
    masterPlanSrvFilter = event.target.value;
    renderMasterPlansTable();
  });
  $('masterPlanStatusFilter')?.addEventListener('change', event => {
    masterPlanStatusFilter = event.target.value;
    renderMasterPlansTable();
  });

  // Master Pricing Table Action Delegation
  $('masterPlansTableBody')?.addEventListener('click', async event => {
    const openSrvBtn = event.target.closest('[data-master-opensrv]');
    if (openSrvBtn) {
      openEditor(openSrvBtn.dataset.masterOpensrv);
      return;
    }

    const toggleBtn = event.target.closest('[data-master-toggle]');
    if (toggleBtn) {
      const [srvId, planId] = toggleBtn.dataset.masterToggle.split(':');
      const srv = draft.services.find(s => s.id === srvId);
      const plan = srv?.plans.find(p => p.id === planId);
      if (plan) {
        plan.available = !plan.available;
        saveDraft();
        renderMasterPlansTable();
        toast(`تم تحويل باقة "${plan.label}" إلى ${plan.available ? 'متاحة' : 'غير متاحة'}.`);
      }
      return;
    }

    const editBtn = event.target.closest('[data-master-edit]');
    if (editBtn) {
      const [srvId, planId] = editBtn.dataset.masterEdit.split(':');
      const srv = draft.services.find(s => s.id === srvId);
      const plan = srv?.plans.find(p => p.id === planId);
      if (plan) {
        openPlanModal(plan, { serviceId: srvId, planId });
      }
      return;
    }

    const dupBtn = event.target.closest('[data-master-dup]');
    if (dupBtn) {
      const [srvId, planId] = dupBtn.dataset.masterDup.split(':');
      const srv = draft.services.find(s => s.id === srvId);
      const plan = srv?.plans.find(p => p.id === planId);
      if (srv && plan) {
        const clone = {
          ...JSON.parse(JSON.stringify(plan)),
          id: newId('plan'),
          label: `${plan.label} (نسخة)`
        };
        srv.plans.push(clone);
        saveDraft();
        renderMasterPlansTable();
        toast(`تم تكرار باقة "${clone.label}" بنجاح.`);
      }
      return;
    }

    const delBtn = event.target.closest('[data-master-del]');
    if (delBtn) {
      const [srvId, planId] = delBtn.dataset.masterDel.split(':');
      const srv = draft.services.find(s => s.id === srvId);
      const plan = srv?.plans.find(p => p.id === planId);
      if (srv && plan) {
        if (await confirmAction('حذف الباقة؟', `هل أنت متأكد من حذف باقة "${plan.label}" نهائيًا من خدمة "${srv.name}"؟`, 'حذف الباقة')) {
          srv.plans = srv.plans.filter(p => p.id !== planId);
          saveDraft();
          renderMasterPlansTable();
          toast(`تم حذف باقة "${plan.label}".`);
        }
      }
      return;
    }
  });

  $('deleteServiceButton')?.addEventListener('click', async () => {
    if (!editingServiceId || publishing) return;
    if (await confirmAction('حذف الخدمة بالكامل؟', 'ستُحذف الخدمة وجميع باقاتها من المسودة. يمكنك إخفاؤها بدلاً من حذفها بإلغاء «تظهر في المتجر».', 'حذف الخدمة')) {
      draft.services = draft.services.filter(s => s.id !== editingServiceId);
      editorDirty = false;
      saveDraft();
      renderAdmin();
      closeDialog('editorDialog');
      toast('تم حذف الخدمة من المسودة.');
    }
  });

  async function requestEditorClose() {
    if (editorDirty && !await confirmAction('تغييرات غير محفوظة', 'هل ترغب في إغلاق المحرر وتجاهل التعديلات الأخيرة؟', 'إغلاق وتجاهل')) {
      return;
    }
    editorDirty = false;
    closeDialog('editorDialog');
  }

  $('editorDialog')?.addEventListener('cancel', event => {
    event.preventDefault();
    requestEditorClose();
  });

  // --- Backups, Draft Previews & Publishing ---
  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  $('exportJson')?.addEventListener('click', () => {
    if (draft) {
      downloadFile(`keno-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(draft, null, 2), 'application/json');
    }
  });

  $('exportCatalog')?.addEventListener('click', () => {
    if (draft) {
      downloadFile('catalog.js', CatalogParser.serialize(draft), 'text/javascript');
    }
  });

  $('importJson')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !adminOpen || publishing) return;

    try {
      if (file.size > (Config.MAX_BYTES || 800000)) {
        throw new Error('حجم ملف النسخة الاحتياطية أكبر من الحد الأقصى.');
      }
      const rawObj = JSON.parse(await file.text());
      const next = CatalogParser.validate(rawObj);

      if (!await confirmAction('استيراد النسخة الاحتياطية؟', 'سيتم استبدال جميع خدمات وأقسام المسودة بهذه النسخة. لن تظهر التغييرات للزوار حتى تضغط نشر.', 'استيراد')) {
        return;
      }

      downloadFile('keno-before-import.json', JSON.stringify(draft, null, 2), 'application/json');
      draft = next;
      settingsDirty = false;
      saveDraft();
      renderAdmin();
      toast('تم استيراد النسخة بنجاح إلى المسودة.');
    } catch (error) {
      showAdminMessage('تعذّر الاستيراد: ' + error.message);
    }
  });

  $('previewDraft')?.addEventListener('click', () => {
    if (!draft || publishing) return;
    preview = true;
    renderStore();
    document.body.classList.add('draft-previewing');
    if ($('draftPreviewBar')) $('draftPreviewBar').hidden = false;
    location.hash = '#catalog';
  });

  $('returnFromPreview')?.addEventListener('click', () => {
    location.hash = '#admin';
  });

  $('discardDraft')?.addEventListener('click', async () => {
    if (!baseData || publishing) return;
    if (await confirmAction('إلغاء تغييرات المسودة؟', 'هل تريد استعادة النسخة الأساسية وإلغاء جميع التعديلات التي لم تُنشر؟', 'إلغاء التغييرات')) {
      draft = JSON.parse(JSON.stringify(baseData));
      settingsDirty = false;
      saveDraft();
      renderAdmin();
      toast('تم التراجع عن المسودة والعودة للنسخة الأساسية.');
    }
  });

  $('connectFromDraft')?.addEventListener('click', async () => {
    if (publishing) return;
    if (isDirty()) {
      if (!await confirmAction('ربط المسودة بـ GitHub', 'سنقوم بتنزيل نسخة JSON احتياطية من مسودتك الحالية أولاً.', 'تنزيل ومتابعة')) {
        return;
      }
      downloadFile('keno-local-draft.json', JSON.stringify(draft, null, 2), 'application/json');
    }
    adminOpen = false;
    if ($('adminWorkspace')) $('adminWorkspace').hidden = true;
    if ($('adminLogin')) $('adminLogin').hidden = false;
    $('repoInput')?.focus();
  });

  $('reloadRemote')?.addEventListener('click', async () => {
    if (!client || publishing) return;
    if (!await confirmAction('تحميل آخر نسخة من GitHub؟', 'سيتم تنزيل مسودتك الحالية كنسخة احتياطية ثم جلب أحدث بيانات محفوظة في المستودع.', 'تحميل آخر نسخة')) {
      return;
    }
    const button = $('reloadRemote');
    button.disabled = true;
    try {
      if (isDirty()) {
        downloadFile('keno-before-reload.json', JSON.stringify(draft, null, 2), 'application/json');
      }
      const remote = await client.load();
      settingsDirty = false;
      await startWorkspace(remote.data, remote.sha, false);
      showAdminMessage('تم تحميل أحدث نسخة من GitHub بنجاح.');
    } catch (error) {
      showAdminMessage(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('publishButton')?.addEventListener('click', async () => {
    if (!draft || publishing) return;

    // Check for unsaved settings first
    if (settingsDirty) {
      showAdminMessage('يُرجى حفظ تعديلات إعدادات المتجر أولاً قبل النشر.');
      return;
    }

    // Check if there are actual changes
    const hasChanges = isDirty();
    if (!hasChanges) {
      showAdminMessage('لا توجد تعديلات لنشرها.');
      return;
    }

    if (!await confirmAction(
      'نشر تغييرات المتجر للجميع؟',
      'سيتم تحديث الخدمات والأسعار وستظهر لجميع الزوار فوراً.',
      'نشر الآن'
    )) {
      return;
    }

    publishing = true;
    const pubBtn = $('publishButton');
    const originalHTML = pubBtn ? pubBtn.innerHTML : '';

    // --- UX state: uploading ---
    if (pubBtn) {
      pubBtn.disabled = true;
      pubBtn.innerHTML = '<i data-icon="loader" class="spin"></i> <span>جاري رفع التعديلات...</span>';
      hydrateIcons(pubBtn);
    }
    updateAdminStatus();
    document.querySelectorAll('#adminWorkspace input, #adminWorkspace textarea, #adminWorkspace select, #adminWorkspace button').forEach(el => { el.disabled = true; });

    try {
      // Stamp update timestamp
      const updated = {
        ...JSON.parse(JSON.stringify(draft)),
        updatedAt: new Date().toISOString()
      };

      // Validate before publishing
      if (window.KenoCatalogParser || CatalogParser) {
        (window.KenoCatalogParser || CatalogParser).validate(updated);
      }

      // --- TIER 1: Publish to Firestore (instant for visitors) ---
      let firestoreOK = false;
      if (window.KenoFirebase && typeof window.KenoFirebase.publishCatalog === 'function') {
        try {
          await window.KenoFirebase.publishCatalog(updated);
          firestoreOK = true;
        } catch (fsErr) {
          console.warn('Firestore publish skipped:', fsErr);
        }
      }

      // --- TIER 2: Commit to GitHub via Vercel Serverless API (permanent) ---
      let githubOK = false;
      try {
        const idToken = window.KenoFirebase
          ? await window.KenoFirebase.getIdToken()
          : null;

        if (idToken) {
          const serializer = window.KenoCatalogParser || CatalogParser;
          const catalogSource = serializer
            ? serializer.serialize(updated)
            : '// Keno Store Catalog\nwindow.KENO_CATALOG = ' + JSON.stringify(updated, null, 2) + ';';

          if (pubBtn) {
            pubBtn.innerHTML = '<i data-icon="loader" class="spin"></i> <span>جاري النشر على GitHub...</span>';
            hydrateIcons(pubBtn);
          }

          const publishRes = await fetch('/api/publish', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + idToken
            },
            body: JSON.stringify({
              catalogSource,
              commitMessage: 'Update Keno Store catalog — ' + new Date().toISOString()
            })
          });

          if (publishRes.ok) {
            const result = await publishRes.json();
            sha = result.sha || sha;
            githubOK = true;
          } else {
            const errData = await publishRes.json().catch(() => ({}));
            console.warn('GitHub publish error:', errData.error || publishRes.status);
          }
        }
      } catch (ghErr) {
        console.warn('GitHub publish skipped:', ghErr);
      }

      // --- Fallback: Use existing KenoGitHub client if available ---
      if (!githubOK && client && sha) {
        try {
          const result = await client.publish(updated, sha);
          sha = result.sha;
          githubOK = true;
        } catch (legacyErr) {
          console.warn('Legacy GitHub client publish skipped:', legacyErr);
        }
      }

      // --- Update local state ---
      draft = JSON.parse(JSON.stringify(updated));
      baseData = JSON.parse(JSON.stringify(updated));
      live = JSON.parse(JSON.stringify(updated));

      saveDraft();
      renderStore();

      // --- UX state: success ---
      if (pubBtn) {
        pubBtn.innerHTML = '<i data-icon="check-circle"></i> <span>تم النشر بنجاح</span>';
        pubBtn.classList.add('button-success');
        hydrateIcons(pubBtn);
        setTimeout(() => {
          pubBtn.innerHTML = originalHTML;
          pubBtn.classList.remove('button-success');
          hydrateIcons(pubBtn);
        }, 3000);
      }

      const statusParts = [];
      if (firestoreOK) statusParts.push('Firebase');
      if (githubOK) statusParts.push('GitHub');

      if (statusParts.length) {
        showAdminMessage('تم نشر التعديلات بنجاح على: ' + statusParts.join(' + ') + '. التعديلات ستظهر للزوار فوراً.');
        toast('تم نشر التعديلات بنجاح.');
      } else {
        showAdminMessage('تم حفظ المسودة محليًا. تعذر النشر على السحابة — تأكد من اتصالك بالإنترنت وإعدادات Firebase.');
      }

    } catch (error) {
      // --- UX state: error ---
      showAdminMessage('خطأ في النشر: ' + error.message);
      if (pubBtn) {
        pubBtn.innerHTML = '<i data-icon="alert-triangle"></i> <span>فشل النشر — حاول مجدداً</span>';
        pubBtn.classList.add('button-danger');
        hydrateIcons(pubBtn);
        setTimeout(() => {
          pubBtn.innerHTML = originalHTML;
          pubBtn.classList.remove('button-danger');
          hydrateIcons(pubBtn);
        }, 4000);
      }
    } finally {
      publishing = false;
      document.querySelectorAll('#adminWorkspace input, #adminWorkspace textarea, #adminWorkspace select, #adminWorkspace button').forEach(el => { el.disabled = false; });
      renderAdmin();
    }
  });

  $('logoutButton')?.addEventListener('click', async () => {
    if (publishing) return;
    if ((isDirty() || settingsDirty) && !await confirmAction('تسجيل الخروج؟', 'ستبقى المسودة محفوظة في هذا المتصفح، لكن سيتم مسح مفتاح GitHub من الذاكرة.', 'تسجيل خروج')) {
      return;
    }
    saveDraft();
    client?.clear();
    client = null;
    sha = null;
    draft = null;
    baseData = null;
    adminOpen = false;
    settingsDirty = false;
    if ($('tokenInput')) $('tokenInput').value = '';
    if ($('adminWorkspace')) $('adminWorkspace').hidden = true;
    if ($('adminLogin')) $('adminLogin').hidden = false;
    toast('تم تسجيل الخروج ومسح مفتاح الدخول بأمان من الذاكرة.');
  });

  // Safe window unloads
  window.addEventListener('beforeunload', event => {
    if (editorDirty || settingsDirty || categoryDirty || paymentDirty || publishing) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  window.addEventListener('pagehide', () => {
    client?.clear();
    client = null;
    if ($('tokenInput')) $('tokenInput').value = '';
  });

  // Keyboard accessibility for interactive service cards
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      const card = event.target.closest('[data-open-service]');
      if (card && (event.target === card || !event.target.closest('button, a, input, select, textarea'))) {
        event.preventDefault();
        openService(card.dataset.openService, card.dataset.plan);
      }
    }
  });

  // Global Click Delegations
  document.addEventListener('click', event => {
    const openBtn = event.target.closest('[data-open-service]');
    if (openBtn) {
      openService(openBtn.dataset.openService, openBtn.dataset.plan);
      return;
    }

    const closeBtn = event.target.closest('[data-close-dialog]');
    if (closeBtn) {
      const dialogId = closeBtn.dataset.closeDialog;
      if (dialogId === 'editorDialog') {
        requestEditorClose();
      } else if (dialogId === 'categoryDialog') {
        requestCategoryClose();
      } else if (dialogId === 'paymentDialog') {
        requestPaymentClose();
      } else {
        closeDialog(dialogId);
      }
      return;
    }

    if (event.target.closest('.contact-trigger')) {
      contact();
      return;
    }

    if (event.target.closest('[data-action="focus-search"]')) {
      location.hash = '#catalog';
      setTimeout(() => $('searchInput')?.focus(), 80);
    }
  });

  // Expose safe read-only MCP discovery tools if supported by host
  if (document.modelContext?.registerTool) {
    const lifetime = new AbortController();
    const register = tool => {
      try {
        Promise.resolve(document.modelContext.registerTool(tool, { signal: lifetime.signal })).catch(() => {});
      } catch (_) {}
    };

    register({
      name: 'search_keno_services',
      title: 'البحث في خدمات كينو',
      description: 'البحث في كتالوج خدمات كينو المتاحة وأسعارها.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', maxLength: 200 } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        return SearchEngine.filter(viewData(), { query: input?.query || '' }).map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          minPrice: SearchEngine.minPrice(s),
          plans: (s.plans || []).filter(p => p.available)
        }));
      }
    });

    window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
  }

  // Secret admin keyboard shortcut (Ctrl+Shift+A or Alt+A)
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') || (event.altKey && event.key.toLowerCase() === 'a')) {
      event.preventDefault();
      location.hash = '#admin';
    }
  });

  // --- Initialization ---
  hydrateIcons();
  renderStore();
  route();
  updateOrdersBadgeCount();

  // --- Live Catalog Hydration from Firestore ---
  // After initial render from static bundle, check Firestore for newer published catalog.
  // This ensures visitors see admin changes instantly without waiting for Vercel redeployment.
  (async () => {
    try {
      if (window.KenoFirebase && typeof window.KenoFirebase.fetchLiveCatalog === 'function') {
        const liveCatalog = await window.KenoFirebase.fetchLiveCatalog();
        if (liveCatalog && liveCatalog.updatedAt) {
          const staticUpdatedAt = live?.updatedAt || '';
          if (liveCatalog.updatedAt > staticUpdatedAt) {
            try {
              const validated = CatalogParser.validate(liveCatalog);
              live = validated;
              renderStore();
              console.log('Storefront hydrated with live Firestore catalog.');
            } catch (parseErr) {
              console.warn('Live catalog from Firestore failed validation:', parseErr);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Live catalog hydration skipped:', err);
    }
  })();
})();
