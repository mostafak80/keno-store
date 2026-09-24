/* ================================================================
   Keno Store — Texts & Copywriting Admin Panel (js/texts-admin.js)
   لوحة تحكم احترافية وسهلة لإدارة وتعديل كل نصوص وكلمات الموقع
   ================================================================ */

(function(root) {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // Comprehensive Arabic metadata dictionary for known keys
  const LABELS_DICT = {
    // Basic & Header
    'skip-link-0': { label: 'نص رابط التخطي للخدمات (لإمكانية الوصول)', loc: 'أعلى الصفحة • مخفي يظهر بالتاب' },
    'copy-1-0': { label: 'اسم المتجر في الترويسة والشعار', loc: 'شريط التنقل العلوي' },
    'copy-2-0': { label: 'عنوان مربع البحث السريع', loc: 'شريط التنقل العلوي' },
    'copy-6-0': { label: 'تسمية زر سلة الطلبات', loc: 'شريط التنقل العلوي' },
    'copy-9-0': { label: 'نص زر «تواصل سريع»', loc: 'شريط التنقل العلوي' },
    'copy-11-0': { label: 'رابط القائمة: كل الخدمات', loc: 'القائمة الرئيسية' },
    'copy-12-0': { label: 'رابط القائمة: الأقسام', loc: 'القائمة الرئيسية' },
    'copy-13-0': { label: 'رابط القائمة: مختارات كينو', loc: 'القائمة الرئيسية' },
    'copy-14-0': { label: 'رابط القائمة: طرق الدفع', loc: 'القائمة الرئيسية' },
    'copy-15-0': { label: 'رابط القائمة: إزاي تطلب؟', loc: 'القائمة الرئيسية' },
    'copy-16-0': { label: 'رابط القائمة: الأسئلة الشائعة', loc: 'القائمة الرئيسية' },

    // Hero Section
    'copy-19-0': { label: 'العنوان الرئيسي للهيرو (السطر 1)', loc: 'واجهة المتجر • H1' },
    'copy-19-1': { label: 'العنوان الرئيسي للهيرو (السطر 2)', loc: 'واجهة المتجر • H1' },
    'copy-19-2': { label: 'العنوان الرئيسي للهيرو (السطر 3)', loc: 'واجهة المتجر • H1' },
    'copy-20-0': { label: 'العنوان الفرعي الملون في الهيرو', loc: 'واجهة المتجر • H1 Span' },
    'copy-22-0': { label: 'فقرة الوصف والترحيب الرئيسية', loc: 'واجهة المتجر • وصف الهيرو' },
    'copy-23-0': { label: 'نص زر «اكتشف الخدمات»', loc: 'أزرار الهيرو' },
    'copy-24-0': { label: 'نص زر «تصفح الخدمات»', loc: 'أزرار الهيرو' },
    'copy-25-0': { label: 'نص زر «إزاي أطلب؟»', loc: 'أزرار الهيرو' },
    'copy-26-0': { label: 'نص زر «طلب خاص»', loc: 'أزرار الهيرو' },
    'copy-27-0': { label: 'نص كلمات البحث المقترحة', loc: 'أزرار البحث السريع' },
    'copy-31-0': { label: 'شارة ميزة الهيرو: دفع محلي', loc: 'أسفل واجهة الهيرو' },
    'copy-32-0': { label: 'شارة ميزة الهيرو: متابعة واتساب', loc: 'أسفل واجهة الهيرو' },
    'copy-33-0': { label: 'شارة العرض البارز: KENO SELECT', loc: 'كارت الهيرو البارز' },
    'copy-34-0': { label: 'عنوان كارت الهيرو الترويجي', loc: 'كارت الهيرو البارز' },
    'copy-35-0': { label: 'بادج كارت الهيرو (الأكثر طلباً)', loc: 'كارت الهيرو البارز' },
    'copy-37-0': { label: 'عنوان العرض الإنجليزي (سطر 1)', loc: 'كارت الهيرو البارز' },
    'copy-38-0': { label: 'عنوان العرض الإنجليزي (سطر 2)', loc: 'كارت الهيرو البارز' },
    'copy-39-0': { label: 'وصف كارت العرض البارز', loc: 'كارت الهيرو البارز' },
    'copy-40-0': { label: 'كمية/باقة كارت العرض البارز', loc: 'كارت الهيرو البارز' },

    // Collections & Picks
    'copy-49-0': { label: 'شارة قسم الأقسام السريعة (Eyebrow)', loc: 'قسم التصنيفات' },
    'copy-50-0': { label: 'عنوان قسم تصفح الأقسام', loc: 'قسم التصنيفات • H2' },
    'copy-52-0': { label: 'شارة قسم مختارات كينو (Eyebrow)', loc: 'قسم مختارات كينو' },
    'copy-53-0': { label: 'عنوان قسم مختارات كينو', loc: 'قسم مختارات كينو • H2' },

    // Trust & Guarantees
    'copy-56-0': { label: 'عنوان قسم شارات الضمان والأمان', loc: 'قسم الضمان' },

    // Catalog & Search
    'copy-58-0': { label: 'عنوان قسم الكتالوج والخدمات', loc: 'الكتالوج الرئيسي • H2' },
    'copy-60-0': { label: 'وصف قسم الكتالوج وتصفح الباقات', loc: 'الكتالوج الرئيسي' },
    'copy-62-0': { label: 'عنوان فلتر الأقسام', loc: 'شريط أدوات الكتالوج' },
    'copy-64-0': { label: 'عنوان خيارات الترتيب والفرز', loc: 'شريط أدوات الكتالوج' },
    'copy-65-0': { label: 'عنوان حالة عرض النتائج', loc: 'الكتالوج الرئيسي' },
    'copy-67-0': { label: 'عنوان رسالة «لم يتم العثور على نتائج»', loc: 'حالة البحث الفارغة' },
    'copy-68-0': { label: 'شرح رسالة عدم وجود نتائج للبحث', loc: 'حالة البحث الفارغة' },
    'copy-70-0': { label: 'زر إعادة تعيين البحث والفلاتر', loc: 'حالة البحث الفارغة' },
    'copy-71-0': { label: 'عنوان بانر «خدمتك مش في القائمة؟»', loc: 'بانر الخدمة المخصصة' },
    'copy-72-0': { label: 'شرح بانر الطلب المخصص والتواصل', loc: 'بانر الخدمة المخصصة' },
    'copy-73-0': { label: 'زر طلب خدمة مخصصة عبر واتساب', loc: 'بانر الخدمة المخصصة' },

    // Payment Section
    'copy-75-0': { label: 'شارة قسم طرق الدفع (Eyebrow)', loc: 'قسم طرق الدفع' },
    'copy-76-0': { label: 'عنوان قسم وسائل الدفع المتاحة', loc: 'قسم طرق الدفع • H2' },
    'copy-78-0': { label: 'فقرة وصف وسائل الدفع وسرعة التأكيد', loc: 'قسم طرق الدفع' },

    // How to Order
    'copy-80-0': { label: 'شارة قسم إزاي تطلب (Eyebrow)', loc: 'قسم خطوات الطلب' },
    'copy-81-0': { label: 'عنوان قسم تنفيذ الطلب في ٣ خطوات', loc: 'قسم خطوات الطلب • H2' },
    'copy-83-0': { label: 'وصف قسم خطوات تنفيذ الطلب', loc: 'قسم خطوات الطلب' },
    'copy-84-0': { label: 'عنوان الخطوة 1: اختيار الخدمة', loc: 'خطوة 1' },
    'copy-85-0': { label: 'شرح وتفاصيل الخطوة 1', loc: 'خطوة 1' },
    'copy-87-0': { label: 'عنوان الخطوة 2: الدفع والتحويل', loc: 'خطوة 2' },
    'copy-88-0': { label: 'شرح وتفاصيل الخطوة 2', loc: 'خطوة 2' },
    'copy-90-0': { label: 'عنوان الخطوة 3: استلام الطلب', loc: 'خطوة 3' },
    'copy-91-0': { label: 'شرح وتفاصيل الخطوة 3', loc: 'خطوة 3' },

    // Testimonials & FAQ
    'copy-92-0': { label: 'شارة قسم تقييمات العملاء (Eyebrow)', loc: 'قسم آراء العملاء' },
    'copy-93-0': { label: 'عنوان قسم آراء وتجارب العملاء', loc: 'قسم آراء العملاء • H2' },
    'copy-95-0': { label: 'وصف قسم تقييمات ومراجعات العملاء', loc: 'قسم آراء العملاء' },
    'copy-96-0': { label: 'شارة قسم الأسئلة الشائعة (Eyebrow)', loc: 'قسم الأسئلة الشائعة' },
    'copy-97-0': { label: 'عنوان قسم الأسئلة الشائعة والدعم', loc: 'قسم الأسئلة الشائعة • H2' },
    'copy-99-0': { label: 'وصف قسم الأسئلة الشائعة وإجاباتها', loc: 'قسم الأسئلة الشائعة' },

    // Cart Drawer & Checkout
    'cart-title-0': { label: 'عنوان نافذة سلة المشتريات والطلب', loc: 'سلة الطلبات' },
    'cart-empty-title-0': { label: 'عنوان تنبيه السلة الفارغة', loc: 'سلة الطلبات' },
    'cart-empty-desc-0': { label: 'نص إرشاد السلة الفارغة', loc: 'سلة الطلبات' },
    'cart-s1-title-0': { label: 'عنوان خطوة السلة 1: مراجعة الباقات', loc: 'سلة الطلبات' },
    'cart-s2-title-0': { label: 'عنوان خطوة السلة 2: بيانات العميل', loc: 'سلة الطلبات' },
    'cart-s3-title-0': { label: 'عنوان خطوة السلة 3: طريقة الدفع', loc: 'سلة الطلبات' },
    'cart-s4-title-0': { label: 'عنوان خطوة السلة 4: إرفاق الإيصال', loc: 'سلة الطلبات' },

    // Service Dialog Popup
    'dialog-title-0': { label: 'عنوان نافذة تفاصيل الباقة والطلب', loc: 'نافذة الخدمة Popup' },
    'dialog-features-title-0': { label: 'عنوان قسم مميزات الباقة', loc: 'نافذة الخدمة Popup' },
    'dialog-order-title-0': { label: 'عنوان قسم إتمام الطلب السريع', loc: 'نافذة الخدمة Popup' },

    // Footer
    'footer-tagline-0': { label: 'نبذة المتجر التعريفية في الفوتر', loc: 'تذييل الموقع • الفوتر' },
    'footer-links-title-0': { label: 'عنوان قائمة الروابط السريعة', loc: 'تذييل الموقع • الفوتر' },
    'footer-hours-title-0': { label: 'عنوان مواعيد العمل والدعم', loc: 'تذييل الموقع • الفوتر' },
    'footer-copyright-0': { label: 'نص حقوق النشر والملكية', loc: 'أسفل الفوتر' }
  };

  // Section categories definitions
  const CATEGORIES = [
    { id: 'all', icon: '🌟', label: 'الكل (جميع النصوص)' },
    { id: 'basic', icon: '⚙️', label: 'البيانات الأساسية' },
    { id: 'header', icon: '📌', label: 'الشريط الإعلاني والهيدر' },
    { id: 'hero', icon: '🏠', label: 'الهيرو ومقدمة المتجر' },
    { id: 'collections', icon: '📦', label: 'الأقسام والمختارات' },
    { id: 'catalog', icon: '🔍', label: 'الكتالوج والبحث' },
    { id: 'how', icon: '📋', label: 'خطوات الطلب (١، ٢، ٣)' },
    { id: 'payments', icon: '💳', label: 'طرق ووسائل الدفع' },
    { id: 'cart', icon: '🛒', label: 'سلة الطلبات والدفع' },
    { id: 'dialog', icon: '🪟', label: 'تفاصيل الخدمة والباقات' },
    { id: 'trust', icon: '🛡️', label: 'شارات الثقة والضمان' },
    { id: 'testimonials', icon: '💬', label: 'آراء العملاء' },
    { id: 'faq', icon: '❓', label: 'الأسئلة الشائعة' },
    { id: 'footer', icon: '🔻', label: 'الفوتر وحقوق النشر' },
    { id: 'misc', icon: '📱', label: 'عناصر وتنبيهات أخرى' }
  ];

  let currentCategory = 'all';
  let searchQuery = '';
  let isInitialized = false;

  /**
   * Smartly determine friendly Arabic label and location for any copy item
   */
  function getItemMeta(item) {
    if (LABELS_DICT[item.key]) {
      return LABELS_DICT[item.key];
    }

    const secName = {
      header: 'الهيدر والشريط العلوي',
      hero: 'واجهة الهيرو الرئيسية',
      collections: 'قسم الأقسام والتصنيفات',
      catalog: 'كتالوج الخدمات والبحث',
      payments: 'قسم وسائل الدفع',
      how: 'قسم خطوات الطلب',
      testimonials: 'قسم آراء العملاء',
      faq: 'قسم الأسئلة الشائعة',
      cart: 'سلة الطلبات والشراء',
      dialog: 'نافذة تفاصيل الخدمة',
      nav: 'شريط التنقل والموبايل',
      footer: 'فوتر وتذييل الموقع',
      misc: 'عناصر الموقع'
    }[item.section] || 'عنصر في الموقع';

    let tag = item.node?.parentElement?.tagName?.toLowerCase() || '';
    let tagDesc = 'نص';
    if (tag.startsWith('h')) tagDesc = 'عنوان ' + tag.toUpperCase();
    else if (tag === 'button') tagDesc = 'نص زر';
    else if (tag === 'a') tagDesc = 'نص رابط';
    else if (tag === 'label') tagDesc = 'تسمية حقل';
    else if (tag === 'p') tagDesc = 'فقرة توضيحية';
    else if (tag === 'span') tagDesc = 'عبارة نصية';

    const snippet = item.original.trim().slice(0, 35);
    return {
      label: `${tagDesc}: "${snippet}${item.original.length > 35 ? '...' : ''}"`,
      loc: `يظهر في: ${secName}`
    };
  }

  /**
   * Main initialization function called when admin opens or tab is shown
   */
  function initTextsAdminPanel() {
    const panel = $('adminTexts');
    if (!panel) return;

    renderPanelStructure();
    populateCards();
    isInitialized = true;
  }

  /**
   * Render structural shell of the Texts Admin Panel
   */
  function renderPanelStructure() {
    const panel = $('adminTexts');
    if (!panel || panel.dataset.structured === 'true') return;

    panel.dataset.structured = 'true';
    panel.innerHTML = `
      <div class="texts-admin-wrapper">

        <!-- Top Header & Banner -->
        <div class="texts-header-panel">
          <div class="texts-header-top">
            <div class="texts-header-title-box">
              <div class="texts-header-icon-badge">✍️</div>
              <div>
                <h3 class="texts-header-title">إدارة وتعديل كل نصوص وكلمات الموقع</h3>
                <p class="texts-header-subtitle">تحكم كامل في كل كلمة وجملة وعنوان يظهر للعملاء في أي مكان بالمتجر بسهولة واحترافية وبدون أي كود برمجي. التعديلات تظهر فوراً.</p>
              </div>
            </div>
            <div class="texts-header-actions">
              <button type="button" class="button button-outline small" id="textsResetAllBtn" title="استعادة كل النصوص الافتراضية الأصلية">
                <i data-icon="rotate-ccw"></i>
                <span>استعادة الكل للأصل</span>
              </button>
              <button type="button" class="button button-red" id="textsSaveAllBtn">
                <i data-icon="save"></i>
                <span>💾 حفظ كل النصوص</span>
              </button>
            </div>
          </div>

          <div class="texts-stats-bar">
            <span class="texts-stat-chip accent" id="textsTotalBadge">📊 جاري التحميل...</span>
            <span class="texts-stat-chip success" id="textsModifiedBadge">🟢 التعديلات فورية</span>
            <span class="texts-stat-chip" id="textsAutoSaveBadge">⚡ متصل بالمسودة تلقائياً</span>
          </div>
        </div>

        <div id="textsNotificationMsg" class="admin-message" hidden></div>

        <!-- Sticky Search & Filter Toolbar -->
        <div class="texts-controls-bar">
          <div class="texts-search-row">
            <div class="texts-search-wrap">
              <span class="texts-search-icon">🔍</span>
              <input type="search" id="textsLiveSearchInput" class="texts-search-input" placeholder="ابحث عن أي كلمة أو عبارة لتعديلها فوراً (مثال: اشحن، واتساب، فوري، باقة)..." autocomplete="off">
              <button type="button" id="textsClearSearchBtn" class="texts-search-clear" title="مسح البحث">✕</button>
            </div>
            <span class="texts-search-count" id="textsResultsCount">عرض الكل</span>
          </div>

          <!-- Category Pills -->
          <div class="texts-pills-scroll" id="textsCategoryPills">
            ${CATEGORIES.map(cat => `
              <button type="button" class="texts-pill-btn ${cat.id === 'all' ? 'active' : ''}" data-cat-id="${cat.id}">
                <span>${cat.icon}</span>
                <span>${cat.label}</span>
                <span class="texts-pill-count" id="pillCount_${cat.id}">0</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Cards List Container -->
        <div id="adminTextsCardsList" style="display:flex;flex-direction:column;gap:20px;"></div>

      </div>
    `;

    if (typeof root.hydrateIcons === 'function') {
      root.hydrateIcons(panel);
    }
    bindControls();
  }

  /**
   * Bind event listeners for search, filter pills, and action buttons
   */
  function bindControls() {
    const searchInput = $('textsLiveSearchInput');
    const clearBtn = $('textsClearSearchBtn');
    const pills = document.querySelectorAll('.texts-pill-btn');
    const saveBtn = $('textsSaveAllBtn');
    const resetBtn = $('textsResetAllBtn');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
        populateCards();
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        populateCards();
      });
    }

    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentCategory = pill.dataset.catId;
        populateCards();
      });
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveAllTexts();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('هل أنت متأكد من رغبتك في استعادة جميع نصوص الموقع إلى القيم الافتراضية الأصلية؟')) {
          resetAllTexts();
        }
      });
    }
  }

  /**
   * Get draft settings
   */
  function getDraftSettings() {
    if (typeof root.getAdminDraft === 'function') {
      const draft = root.getAdminDraft();
      if (draft && draft.settings) return draft.settings;
    }
    return {};
  }

  /**
   * Populate text editing cards
   */
  function populateCards() {
    const list = $('adminTextsCardsList');
    if (!list) return;

    const copyItems = (typeof root.KenoContent?.getCopyItems === 'function') ? root.KenoContent.getCopyItems() : [];
    const settings = getDraftSettings();
    const content = settings.content || {};

    // Build all editable items list
    const allItems = [];

    // 1. Basic Store Settings core texts
    const basicFields = [
      { key: 'setting_storeName', prop: 'storeName', label: 'اسم المتجر الرسمي', loc: 'شريط التنقل والفوتر وعنوان الصفحة', section: 'basic', val: settings.storeName || 'Keno Store', original: 'Keno Store' },
      { key: 'setting_tagline', prop: 'tagline', label: 'الجملة التعريفية للمتجر (Tagline)', loc: 'الترويسة ومحركات البحث SEO', section: 'basic', val: settings.tagline || 'متجرك الأول لشحن الألعاب والاشتراكات الرقمية', original: 'متجرك الأول لشحن الألعاب والاشتراكات الرقمية' },
      { key: 'setting_announcement', prop: 'announcement', label: 'نص الشريط الإعلاني الترويجي المتحرك', loc: 'أعلى شريط في المتجر (Announcement Bar)', section: 'basic', val: settings.announcement || 'خصم 10% على كل الاشتراكات بمناسبة الانطلاق! كود: KENO10', original: 'خصم 10% على كل الاشتراكات بمناسبة الانطلاق! كود: KENO10' },
      { key: 'setting_workingHours', prop: 'workingHours', label: 'مواعيد العمل والدعم الفني', loc: 'الشريط الإعلاني والفوتر', section: 'basic', val: settings.workingHours || 'متاحون يوميًا من 10 ص حتى 2 ص', original: 'متاحون يوميًا من 10 ص حتى 2 ص' },
      { key: 'setting_whatsapp', prop: 'whatsapp', label: 'رقم واتساب المعتمد للطلبات والدعم', loc: 'إرسال الفواتير وأزرار التواصل', section: 'basic', val: settings.whatsapp || '01064806213', original: '01064806213' },
      { key: 'setting_paymentPhone', prop: 'paymentPhone', label: 'رقم محفظة فودافون كاش لتحويل الأموال', loc: 'قسم الدفع ونافذة إتمام الطلب', section: 'basic', val: settings.paymentPhone || '01064806213', original: '01064806213' },
      { key: 'setting_instapay', prop: 'instapay', label: 'عنوان / حساب إنستاباي InstaPay', loc: 'طرق الدفع ونافذة الطلب', section: 'basic', val: settings.instapay || 'keno@instapay', original: 'keno@instapay' }
    ];

    basicFields.forEach(bf => {
      allItems.push({
        isBasic: true,
        prop: bf.prop,
        key: bf.key,
        label: bf.label,
        loc: bf.loc,
        section: bf.section,
        val: bf.val,
        original: bf.original
      });
    });

    // 2. All DOM copy items
    copyItems.forEach(item => {
      const meta = getItemMeta(item);
      const val = content[item.key] ?? item.original;
      allItems.push({
        isBasic: false,
        key: item.key,
        item: item,
        label: meta.label,
        loc: meta.loc,
        section: item.section || 'misc',
        val: val,
        original: item.original
      });
    });

    // Update Counts on Category Pills
    const counts = { all: allItems.length };
    CATEGORIES.forEach(c => { if (c.id !== 'all') counts[c.id] = 0; });
    allItems.forEach(it => {
      if (counts[it.section] !== undefined) counts[it.section]++;
    });
    CATEGORIES.forEach(c => {
      const countEl = $('pillCount_' + c.id);
      if (countEl) countEl.textContent = counts[c.id] || '0';
    });

    const totalBadge = $('textsTotalBadge');
    if (totalBadge) totalBadge.textContent = `📝 إجمالي النصوص: ${allItems.length}`;

    // Filter by category and search query
    let filtered = allItems;
    if (currentCategory !== 'all') {
      filtered = filtered.filter(it => it.section === currentCategory);
    }
    if (searchQuery) {
      filtered = filtered.filter(it => {
        const textToSearch = [
          it.key,
          it.label,
          it.loc,
          it.val,
          it.original
        ].join(' ').toLowerCase();
        return textToSearch.includes(searchQuery);
      });
    }

    const resultsCount = $('textsResultsCount');
    if (resultsCount) {
      resultsCount.textContent = searchQuery
        ? `وجدت ${filtered.length} نصاً مطابقاً`
        : `عرض ${filtered.length} نصاً`;
    }

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="texts-empty-state">
          <div class="texts-empty-icon">🔍</div>
          <h4 class="texts-empty-title">لم يتم العثور على أي نصوص تطابق بحثك</h4>
          <p class="texts-empty-desc">جرّب البحث بكلمة أخرى أو اختر قسماً آخر من شريط التصنيفات أعلاه.</p>
        </div>
      `;
      return;
    }

    // Group filtered items by section for readable cards
    const grouped = {};
    filtered.forEach(it => {
      if (!grouped[it.section]) grouped[it.section] = [];
      grouped[it.section].push(it);
    });

    let html = '';
    for (const [secId, items] of Object.entries(grouped)) {
      const catInfo = CATEGORIES.find(c => c.id === secId) || { icon: '📦', label: secId };
      html += `
        <div class="texts-section-block" data-section-block="${secId}">
          <div class="texts-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="texts-section-title-wrap">
              <span class="texts-section-icon">${catInfo.icon}</span>
              <h4 class="texts-section-title">${esc(catInfo.label)}</h4>
            </div>
            <div class="texts-section-meta">
              <span class="texts-pill-count">${items.length} نصوص</span>
              <button type="button" class="texts-section-toggle-btn">▼</button>
            </div>
          </div>
          <div class="texts-cards-grid">
            ${items.map(it => renderTextCard(it)).join('')}
          </div>
        </div>
      `;
    }

    list.innerHTML = html;
    bindCardInputs();
  }

  /**
   * Render individual card HTML
   */
  function renderTextCard(it) {
    const isModified = it.val !== it.original;
    const isMultiLine = (it.val || it.original).length > 60 || (it.val || it.original).includes('\n');
    const safeVal = esc(it.val);
    const safeOrig = esc(it.original);
    const charCount = (it.val || '').length;

    let displayLabel = esc(it.label);
    if (searchQuery) {
      const q = esc(searchQuery);
      displayLabel = displayLabel.replace(new RegExp(`(${q})`, 'gi'), '<span class="text-highlight">$1</span>');
    }

    return `
      <div class="text-item-card ${isModified ? 'is-modified' : ''}" id="card_${it.key}">
        <div class="text-card-top">
          <div class="text-card-info">
            <span class="text-card-label">${displayLabel}</span>
            <span class="text-card-location">📍 ${esc(it.loc)}</span>
          </div>
          <span class="text-card-status-badge">${isModified ? 'معدّل 🟢' : 'افتراضي ⚪'}</span>
        </div>

        <div class="text-original-box">
          <strong>الأصل:</strong>
          <span>«${safeOrig}»</span>
        </div>

        ${isMultiLine ? `
          <textarea class="text-field-input" data-text-key="${it.key}" ${it.isBasic ? `data-basic-prop="${it.prop}"` : `data-content-setting="${it.key}"`} rows="3" placeholder="اكتب النص هنا...">${safeVal}</textarea>
        ` : `
          <input type="text" class="text-field-input" data-text-key="${it.key}" ${it.isBasic ? `data-basic-prop="${it.prop}"` : `data-content-setting="${it.key}"`} value="${safeVal}" placeholder="اكتب النص هنا...">
        `}

        <div class="text-card-bottom">
          <button type="button" class="text-reset-single-btn" data-reset-single="${it.key}" title="إعادة للنص الأصلي الافتراضي">
            <span>↩️</span>
            <span>استعادة الأصلي</span>
          </button>
          <span class="text-char-count" id="count_${it.key}">${charCount} حرف</span>
        </div>
      </div>
    `;
  }

  /**
   * Bind event handlers on text inputs & individual reset buttons
   */
  function bindCardInputs() {
    const inputs = document.querySelectorAll('.text-field-input');
    const resetBtns = document.querySelectorAll('[data-reset-single]');
    const copyItems = (typeof root.KenoContent?.getCopyItems === 'function') ? root.KenoContent.getCopyItems() : [];
    const copyMap = new Map(copyItems.map(i => [i.key, i]));

    inputs.forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.textKey;
        const val = input.value;
        const card = $('card_' + key);
        const countEl = $('count_' + key);
        if (countEl) countEl.textContent = `${val.length} حرف`;

        const isBasic = Boolean(input.dataset.basicProp);

        if (isBasic) {
          const prop = input.dataset.basicProp;
          const draft = (typeof root.getAdminDraft === 'function') ? root.getAdminDraft() : null;
          if (draft && draft.settings) {
            draft.settings[prop] = val;
          }
          // Also sync with settingsForm if present in DOM
          const sf = $('settingsForm');
          if (sf && sf.elements[prop]) {
            sf.elements[prop].value = val;
          }
          if (card) {
            const original = input.getAttribute('placeholder') || '';
            const modified = val !== original;
            card.classList.toggle('is-modified', modified);
            const badge = card.querySelector('.text-card-status-badge');
            if (badge) badge.textContent = modified ? 'معدّل 🟢' : 'افتراضي ⚪';
          }
        } else {
          // Storefront DOM node live update
          const item = copyMap.get(key);
          if (item && item.node && item.node.isConnected) {
            item.node.textContent = val;
          }

          // Update in draft
          const draft = (typeof root.getAdminDraft === 'function') ? root.getAdminDraft() : null;
          if (draft) {
            if (!draft.settings) draft.settings = {};
            if (!draft.settings.content) draft.settings.content = {};
            draft.settings.content[key] = val;
          }

          if (card && item) {
            const modified = val !== item.original;
            card.classList.toggle('is-modified', modified);
            const badge = card.querySelector('.text-card-status-badge');
            if (badge) badge.textContent = modified ? 'معدّل 🟢' : 'افتراضي ⚪';
          }
        }
      });
    });

    resetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.resetSingle;
        const input = document.querySelector(`.text-field-input[data-text-key="${key}"]`);
        if (!input) return;

        const isBasic = Boolean(input.dataset.basicProp);
        if (isBasic) {
          const prop = input.dataset.basicProp;
          const defaultBasic = {
            storeName: 'Keno Store',
            tagline: 'متجرك الأول لشحن الألعاب والاشتراكات الرقمية',
            announcement: 'خصم 10% على كل الاشتراكات بمناسبة الانطلاق! كود: KENO10',
            workingHours: 'متاحون يوميًا من 10 ص حتى 2 ص',
            whatsapp: '01064806213',
            paymentPhone: '01064806213',
            instapay: 'keno@instapay'
          };
          input.value = defaultBasic[prop] || '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          const item = copyMap.get(key);
          if (item) {
            input.value = item.original;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        showNotice('تمت استعادة النص الأصلي لهذا الحقل بنجاح.');
      });
    });
  }

  /**
   * Save all texts to draft and notify user
   */
  function saveAllTexts() {
    try {
      const inputs = document.querySelectorAll('.text-field-input');
      const draft = (typeof root.getAdminDraft === 'function') ? root.getAdminDraft() : null;
      if (!draft) return;

      if (!draft.settings) draft.settings = {};
      if (!draft.settings.content) draft.settings.content = {};

      inputs.forEach(input => {
        const key = input.dataset.textKey;
        const val = input.value;
        const isBasic = Boolean(input.dataset.basicProp);

        if (isBasic) {
          const prop = input.dataset.basicProp;
          draft.settings[prop] = val;
        } else if (key) {
          draft.settings.content[key] = val;
        }
      });

      // Save via system admin save
      if (typeof root.saveAdminDraft === 'function') {
        root.saveAdminDraft();
      }

      showNotice('✅ تم حفظ جميع النصوص بنجاح في المسودة وتحديث المتجر فوراً!', 'success');
      if (typeof root.showToast === 'function') {
        root.showToast('✅ تم حفظ كل نصوص الموقع بنجاح!');
      }
    } catch (err) {
      console.error('Error saving texts:', err);
      showNotice('حدث خطأ أثناء حفظ النصوص: ' + err.message, 'error');
    }
  }

  /**
   * Reset all texts to original defaults
   */
  function resetAllTexts() {
    try {
      const copyItems = (typeof root.KenoContent?.getCopyItems === 'function') ? root.KenoContent.getCopyItems() : [];
      const draft = (typeof root.getAdminDraft === 'function') ? root.getAdminDraft() : null;
      if (draft && draft.settings) {
        draft.settings.content = {};
      }

      copyItems.forEach(item => {
        if (item.node && item.node.isConnected) {
          item.node.textContent = item.original;
        }
      });

      if (typeof root.saveAdminDraft === 'function') {
        root.saveAdminDraft();
      }

      populateCards();
      showNotice('🔄 تم استعادة جميع النصوص الأصلية الافتراضية بنجاح.', 'success');
    } catch (err) {
      console.error('Error resetting texts:', err);
    }
  }

  /**
   * Helper to display sleek feedback message banner
   */
  function showNotice(text, type = 'info') {
    const el = $('textsNotificationMsg');
    if (!el) return;

    el.hidden = false;
    el.style.display = 'block';
    el.style.background = type === 'error' ? 'rgba(235, 77, 75, 0.15)' : 'rgba(46, 213, 115, 0.15)';
    el.style.borderColor = type === 'error' ? 'rgba(235, 77, 75, 0.4)' : 'rgba(46, 213, 115, 0.4)';
    el.style.color = type === 'error' ? '#ff6b6b' : '#2ed573';
    el.style.padding = '12px 18px';
    el.style.borderRadius = '10px';
    el.style.marginBottom = '14px';
    el.style.fontWeight = '700';
    el.textContent = text;

    setTimeout(() => {
      el.hidden = true;
      el.style.display = 'none';
    }, 4500);
  }

  // Export to root
  root.initTextsAdminPanel = initTextsAdminPanel;
  root.saveAllTexts = saveAllTexts;

  // Auto-init on DOMContentLoaded if admin is already open
  document.addEventListener('DOMContentLoaded', () => {
    // If textsTab is clicked, ensure panel is populated
    const tab = $('textsTab');
    if (tab) {
      tab.addEventListener('click', () => {
        setTimeout(initTextsAdminPanel, 50);
      });
    }
  });

})(window);
