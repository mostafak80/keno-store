/* Store content, media and domain settings. Text is inserted as text, never HTML. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=[];
  const dynamic=new Set(['announcementText','announcementPhone','announcementHours','footerTagline','footerStoreName','currentYear','serviceCount','faqPayment','serviceGrid','categoryTabs','heroFeature','collectionGrid','picksGrid','stageMiniOffers','paymentShowcaseGrid','trustGrid','testimonialsGrid']);

  /* --- Section definitions for the editor --- */
  const SECTIONS = [
    { id:'header',   icon:'📌', label:'الشريط الإعلاني والهيدر' },
    { id:'hero',     icon:'🏠', label:'البطل والمقدمة' },
    { id:'collections', icon:'📦', label:'الأقسام والمختارات' },
    { id:'catalog',  icon:'🔍', label:'الكتالوج والبحث' },
    { id:'payments', icon:'💳', label:'طرق الدفع' },
    { id:'how',      icon:'📋', label:'إزاي تطلب' },
    { id:'testimonials', icon:'⭐', label:'التعليقات' },
    { id:'faq',      icon:'❓', label:'الأسئلة الشائعة' },
    { id:'cart',     icon:'🛒', label:'السلة والدفع (سلة الطلبات)' },
    { id:'dialog',   icon:'🪟', label:'تفاصيل الخدمة (popup)' },
    { id:'nav',      icon:'📱', label:'التنقل والموبايل' },
    { id:'footer',   icon:'🔻', label:'الفوتر' },
    { id:'misc',     icon:'⚙️', label:'عناصر أخرى' }
  ];

  /* Determine which section a data-content element belongs to via DOM proximity */
  function getSection(el) {
    if (el.closest('.cart-drawer')) return 'cart';
    if (el.closest('#serviceDialog')) return 'dialog';
    if (el.classList.contains('skip-link')) return 'header';
    if (el.closest('.announcement')) return 'header';
    if (el.closest('.site-header')) return 'header';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('#collections')) return 'collections';
    if (el.closest('#picks')) return 'collections';
    if (el.closest('#trust')) return 'collections';
    if (el.closest('#catalog')) return 'catalog';
    if (el.closest('#payments')) return 'payments';
    if (el.closest('#how')) return 'how';
    if (el.closest('#testimonials')) return 'testimonials';
    if (el.closest('#faq')) return 'faq';
    if (el.closest('.mobile-nav')) return 'nav';
    if (el.closest('.site-footer')) return 'footer';
    if (el.closest('.draft-preview-bar')) return 'misc';
    if (el.closest('.floating-contact')) return 'misc';
    return 'misc';
  }

  // Stable keys are stamped in HTML; only static storefront content is editable here.
  document.querySelectorAll('[data-content]').forEach(el=>{
    const section = getSection(el);
    [...el.childNodes].forEach((node,i)=>{
      if(node.nodeType!==3 || !node.textContent.trim() || dynamic.has(el.id))return;
      copy.push({key:el.dataset.content+'-'+i,node,original:node.textContent,label:node.textContent.trim(),section});
    });
  });

  let current={};
  function render(settings){
    current=settings;
    document.body.style.setProperty('--red',settings.brandColor || '#e52d3f');
    document.querySelectorAll('.site-header img,.site-footer img').forEach(img=>{img.src=settings.logo || 'assets/logo.png';img.alt=settings.storeName;});
    for(const item of copy)if(item.node.isConnected)item.node.textContent=settings.content?.[item.key] ?? item.original;

    // Apply Layout Studio Variables
    const layout = settings.layout || {};
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--ui-scale', layout.siteScale ? (parseInt(layout.siteScale, 10)/100).toString() : '1');
    rootStyle.setProperty('--container-max', layout.containerMax || '1200px');
    rootStyle.setProperty('--grid-cols-desktop', layout.gridCols === 'auto' ? 'repeat(auto-fill, minmax(280px, 1fr))' : (layout.gridCols ? `repeat(${layout.gridCols}, 1fr)` : 'repeat(3, 1fr)'));
    rootStyle.setProperty('--card-gap', layout.cardGap || '20px');
    rootStyle.setProperty('--section-gap', layout.sectionGap || '56px');
    rootStyle.setProperty('--card-padding', layout.cardPadding || '18px');
    rootStyle.setProperty('--card-radius', layout.cardRadius || '16px');
    rootStyle.setProperty('--heading-align', layout.headingAlign || 'right');
    rootStyle.setProperty('--hero-align', layout.heroAlign || 'right');

    // Apply Section Ordering
    const secOrder = settings.sectionOrder || ['home','collections','picks','trust','catalog','payments','how','testimonials','faq'];
    secOrder.forEach((secId, i) => {
      const el = $(secId);
      if (el) el.style.order = String(i + 1);
    });

    // Apply Granular Visibility
    const vis = settings.sectionVisibility || {};
    for (const [id, visible] of Object.entries(vis)) {
      const el = $(id);
      if (el) el.hidden = !visible || (id==='picks' && !$('picksGrid')?.children.length) || (id==='payments' && !$('paymentShowcaseGrid')?.children.length);
    }
    const compMap = {
      announcement: document.querySelector('.announcement'),
      header: document.querySelector('.site-header'),
      themeToggle: $('themeToggle'),
      cartButton: $('cartButton') || document.querySelector('.cart-trigger'),
      heroSearches: document.querySelector('.hero-searches'),
      heroTags: document.querySelector('.hero-tags'),
      heroFeature: $('heroFeature'),
      stageMiniOffers: $('stageMiniOffers'),
      catalogToolbar: document.querySelector('.catalog-toolbar'),
      categoryTabs: $('categoryTabs'),
      customBanner: document.querySelector('.custom-banner'),
      footer: document.querySelector('.site-footer')
    };
    for (const [key, el] of Object.entries(compMap)) {
      if (el && vis[key] !== undefined) el.hidden = vis[key] === false;
    }

    const base=settings.siteUrl || new URL('./',location.href).href.split('#')[0];
    document.querySelector('link[rel="canonical"]')?.setAttribute('href',base);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content',base);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content',settings.storeName+' | '+settings.tagline);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content',settings.tagline);
    document.querySelector('meta[property="og:site_name"]')?.setAttribute('content',settings.storeName);
    const logo=settings.logo?.startsWith('data:') ? new URL('assets/logo.png',base).href : new URL(settings.logo || 'assets/logo.png',base).href;
    document.querySelector('meta[property="og:image"]')?.setAttribute('content',logo);
    document.querySelector('meta[name="description"]')?.setAttribute('content',settings.tagline);
    const json=document.querySelector('script[type="application/ld+json"]');
    if(json)json.textContent=JSON.stringify({'@context':'https://schema.org','@type':'OnlineStore',name:settings.storeName,url:base,logo,description:settings.tagline});
  }

  function loadEditor(settings){
    current=settings;

    /* --- Group copy items by section --- */
    const grouped = {};
    for (const item of copy) {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section].push(item);
    }

    /* --- Build the editor HTML --- */
    let html = `<details class="content-editor" open><summary>محرر محتوى وتصميم وأبعاد الموقع الشامل</summary>`;

    /* Search box */
    html += `<div class="content-search-wrap"><input type="search" id="contentSearchInput" class="content-search" placeholder="🔍 ابحث عن أي نص في الموقع..." autocomplete="off"><span id="contentSearchCount" class="content-search-count"></span></div>`;

    /* 1. Layout Studio */
    const layout = settings.layout || {};
    html += `<details class="content-section" open><summary>📐 استوديو مظهر وأبعاد وحجم وفواصل المتجر</summary>
      <div class="form-grid">
        <label>حجم وتكبير/تصغير الموقع ككل (Site Scale)
          <select id="layoutSiteScale">
            <option value="85%" ${layout.siteScale==='85%'?'selected':''}>85% (مدمج ومضغوط)</option>
            <option value="90%" ${layout.siteScale==='90%'?'selected':''}>90% (مدمج خفيف)</option>
            <option value="95%" ${layout.siteScale==='95%'?'selected':''}>95% (وسط صغير)</option>
            <option value="100%" ${(!layout.siteScale||layout.siteScale==='100%')?'selected':''}>100% (الافتراضي المتناسق)</option>
            <option value="105%" ${layout.siteScale==='105%'?'selected':''}>105% (كبير نسبيًا)</option>
            <option value="110%" ${layout.siteScale==='110%'?'selected':''}>110% (كبير واضح)</option>
            <option value="115%" ${layout.siteScale==='115%'?'selected':''}>115% (واضح جدًا)</option>
            <option value="120%" ${layout.siteScale==='120%'?'selected':''}>120% (أكبر حجم شاشة)</option>
          </select>
        </label>
        <label>أقصى عرض لصفحة المتجر (Container Width)
          <select id="layoutContainerMax">
            <option value="1100px" ${layout.containerMax==='1100px'?'selected':''}>1100px (ملموم)</option>
            <option value="1200px" ${(!layout.containerMax||layout.containerMax==='1200px')?'selected':''}>1200px (الافتراضي المتوازن)</option>
            <option value="1320px" ${layout.containerMax==='1320px'?'selected':''}>1320px (عريض فسيح)</option>
            <option value="1440px" ${layout.containerMax==='1440px'?'selected':''}>1440px (عريض جدًا)</option>
            <option value="1600px" ${layout.containerMax==='1600px'?'selected':''}>1600px (شاشة بانورامية)</option>
            <option value="100%" ${layout.containerMax==='100%'?'selected':''}>100% (كامل عرض الشاشة)</option>
          </select>
        </label>
        <label>عدد أعمدة كروت الخدمات بالشاشات الكبيرة
          <select id="layoutGridCols">
            <option value="auto" ${layout.gridCols==='auto'?'selected':''}>تلقائي مرن (Auto-fit)</option>
            <option value="2" ${layout.gridCols==='2'?'selected':''}>عمودين (كروت عريضة)</option>
            <option value="3" ${(!layout.gridCols||layout.gridCols==='3')?'selected':''}>3 أعمدة (الافتراضي المثالي)</option>
            <option value="4" ${layout.gridCols==='4'?'selected':''}>4 أعمدة (كروت مدمجة مكثفة)</option>
          </select>
        </label>
        <label>الفواصل والمسافات بين كروت الخدمات (Card Gap)
          <select id="layoutCardGap">
            <option value="10px" ${layout.cardGap==='10px'?'selected':''}>متقاربة جدًا (10px)</option>
            <option value="16px" ${layout.cardGap==='16px'?'selected':''}>متوسطة مدمجة (16px)</option>
            <option value="20px" ${(!layout.cardGap||layout.cardGap==='20px')?'selected':''}>الافتراضية المريحة (20px)</option>
            <option value="28px" ${layout.cardGap==='28px'?'selected':''}>واسعة (28px)</option>
            <option value="36px" ${layout.cardGap==='36px'?'selected':''}>متباعدة جدًا (36px)</option>
          </select>
        </label>
        <label>الفواصل والمسافات الرأسية بين أقسام المتجر (Section Gap)
          <select id="layoutSectionGap">
            <option value="32px" ${layout.sectionGap==='32px'?'selected':''}>مدمجة وسريعة (32px)</option>
            <option value="56px" ${(!layout.sectionGap||layout.sectionGap==='56px')?'selected':''}>الافتراضية المتوازنة (56px)</option>
            <option value="80px" ${layout.sectionGap==='80px'?'selected':''}>واسعة ومريحة (80px)</option>
            <option value="110px" ${layout.sectionGap==='110px'?'selected':''}>فواصل كبيرة بارزة (110px)</option>
          </select>
        </label>
        <label>الهوامش الداخلية لكروت الخدمات (Card Padding)
          <select id="layoutCardPadding">
            <option value="12px" ${layout.cardPadding==='12px'?'selected':''}>مدمج (12px)</option>
            <option value="18px" ${(!layout.cardPadding||layout.cardPadding==='18px')?'selected':''}>الافتراضي (18px)</option>
            <option value="24px" ${layout.cardPadding==='24px'?'selected':''}>رحب ومريح (24px)</option>
            <option value="30px" ${layout.cardPadding==='30px'?'selected':''}>كبير وفاخر (30px)</option>
          </select>
        </label>
        <label>استدارة حواف الكروت والأزرار (Border Radius)
          <select id="layoutCardRadius">
            <option value="4px" ${layout.cardRadius==='4px'?'selected':''}>حواف حادة كلاسيك (4px)</option>
            <option value="10px" ${layout.cardRadius==='10px'?'selected':''}>دائرية خفيفة (10px)</option>
            <option value="16px" ${(!layout.cardRadius||layout.cardRadius==='16px')?'selected':''}>الافتراضية الحديثة (16px)</option>
            <option value="24px" ${layout.cardRadius==='24px'?'selected':''}>دائرية بارزة (24px)</option>
            <option value="32px" ${layout.cardRadius==='32px'?'selected':''}>شكل كبسولة ناعم (32px)</option>
          </select>
        </label>
        <label>محاذاة عناوين الأقسام والنصوص (Heading Alignment)
          <select id="layoutHeadingAlign">
            <option value="right" ${(!layout.headingAlign||layout.headingAlign==='right')?'selected':''}>محاذاة لليمين (الافتراضي العربي)</option>
            <option value="center" ${layout.headingAlign==='center'?'selected':''}>محاذاة للوسط (Centered Headings)</option>
            <option value="left" ${layout.headingAlign==='left'?'selected':''}>محاذاة لليسار</option>
          </select>
        </label>
        <label>محاذاة نصوص ومقدمة الهيرو (Hero Text Alignment)
          <select id="layoutHeroAlign">
            <option value="right" ${(!layout.heroAlign||layout.heroAlign==='right')?'selected':''}>محاذاة لليمين (الافتراضي)</option>
            <option value="center" ${layout.heroAlign==='center'?'selected':''}>محاذاة للوسط (Hero Centered)</option>
          </select>
        </label>
      </div>
    </details>`;

    /* 2. Homepage Section Reordering Studio */
    const sectionNames = {
      home: '🏠 البانر الرئيسي وبطاقة العرض (Hero & Card)',
      collections: '📦 أقسام وتصنيفات المتجر السريعة (Collections)',
      picks: '⭐ مختارات كينو المميزة (Top Picks)',
      trust: '🛡️ شارات الضمان والمميزات (Trust Badges)',
      catalog: '🔍 كتالوج الخدمات الرئيسي والبحث (Catalog)',
      payments: '💳 طرق ووسائل الدفع والشحن (Payments)',
      how: '📋 خطوات تنفيذ الطلب في ٣ خطوات (How it works)',
      testimonials: '💬 تقييمات وتجارب العملاء (Testimonials)',
      faq: '❓ الأسئلة الشائعة والدعم (FAQ)'
    };
    const currentOrder = settings.sectionOrder || ['home','collections','picks','trust','catalog','payments','how','testimonials','faq'];
    html += `<details class="content-section" open><summary>🔃 ترتيب أقسام الصفحة الرئيسية (تحريك لأعلى ولأسفل)</summary>
      <p class="field-hint" style="margin:4px 0 8px;">غيّر ترتيب أي قسم في الصفحة الرئيسية باستخدام أزرار التقديم والتأخير. سيظهر الترتيب فورًا في المتجر.</p>
      <div id="sectionOrderList" class="section-reorder-list">
        ${currentOrder.map((secId, idx) => `
          <div class="section-reorder-item" data-sec-id="${secId}">
            <div class="section-reorder-info">
              <span class="section-reorder-badge">#${idx + 1}</span>
              <span>${esc(sectionNames[secId] || secId)}</span>
            </div>
            <div class="reorder-btn-group">
              <button type="button" class="icon-btn tiny sec-order-btn" data-sec-move="${secId}" data-dir="up" ${idx===0?'disabled':''} title="تحريك لأعلى">▲</button>
              <button type="button" class="icon-btn tiny sec-order-btn" data-sec-move="${secId}" data-dir="down" ${idx===currentOrder.length-1?'disabled':''} title="تحريك لأسفل">▼</button>
            </div>
          </div>
        `).join('')}
      </div>
    </details>`;

    /* 3. Granular Visibility Toggles */
    const visOptions = [
      { id: 'header', label: 'الهيدر والشريط العلوي' },
      { id: 'announcement', label: 'الشريط الإعلاني' },
      { id: 'cartButton', label: 'زر سلة الطلبات' },
      { id: 'themeToggle', label: 'زر تبديل المظهر (فاتح/داكن)' },
      { id: 'home', label: 'قسم الهيرو والمقدمة' },
      { id: 'heroSearches', label: 'كلمات البحث السريع في الهيرو' },
      { id: 'heroTags', label: 'شارات الدفع والمتابعة في الهيرو' },
      { id: 'heroFeature', label: 'بطاقة العرض البارز في الهيرو' },
      { id: 'stageMiniOffers', label: 'العروض المصغرة تحت الهيرو' },
      { id: 'collections', label: 'قسم التصنيفات السريعة' },
      { id: 'picks', label: 'قسم مختارات كينو' },
      { id: 'trust', label: 'قسم شارات الضمان' },
      { id: 'catalog', label: 'قسم كتالوج الخدمات بالكامل' },
      { id: 'catalogToolbar', label: 'شريط البحث والترتيب في الكتالوج' },
      { id: 'categoryTabs', label: 'تبويبات الأقسام في الكتالوج' },
      { id: 'customBanner', label: 'بانر «خدمتك مش في القائمة؟»' },
      { id: 'payments', label: 'قسم طرق الدفع' },
      { id: 'how', label: 'قسم إزاي أطلب (الخطوات الثلاث)' },
      { id: 'testimonials', label: 'قسم آراء العملاء' },
      { id: 'faq', label: 'قسم الأسئلة الشائعة' },
      { id: 'footer', label: 'الفوتر وأسفل الصفحة' }
    ];
    html += `<details class="content-section" open><summary>👁️ إظهار وإخفاء أي قسم أو عنصر في المتجر</summary>
      <div class="visibility-toggles-grid">
        ${visOptions.map(opt => `
          <label class="visibility-toggle-card">
            <input type="checkbox" data-section-setting="${opt.id}" ${settings.sectionVisibility?.[opt.id]!==false?'checked':''}>
            <span>${opt.label}</span>
          </label>
        `).join('')}
      </div>
    </details>`;

    /* Brand / Logo / URL / Audio controls */
    html += `<details class="content-section"><summary>⚙️ إعدادات الشعار والألوان والدومين</summary>
      <div class="form-grid"><label>لون العلامة الأساسي<input type="color" id="settingBrandColor" value="${esc(settings.brandColor || '#e52d3f')}"></label><label>صورة شعار المتجر<input id="settingLogo" value="${esc(settings.logo || 'assets/logo.png')}"><input type="file" id="settingLogoUpload" accept="image/png,image/jpeg,image/webp"></label></div>
      <label>العنوان المنشور للموقع<input id="settingSiteUrl" type="url" value="${esc(settings.siteUrl||'')}" placeholder="https://keno-store.vercel.app/"></label>
      <p>يحدّث canonical وبيانات المشاركة. عند تغيير الدومين نزّل ملفات SEO التالية وارفعها مع الموقع.</p>
      <button type="button" id="downloadSeo" class="button button-outline small">تنزيل sitemap.xml و robots.txt</button>
      <h4>تسجيلات مصرية عامة للخطوات الثلاث</h4><p>ارفع تسجيلاتك القصيرة حتى 100 كيلوبايت لكل ملف أو ضع روابط HTTPS. يمكن تخصيص التسجيلات لكل خدمة.</p><div id="globalAudioEditor" class="form-grid"></div>
    </details>`;

    /* Sectioned text editors */
    for (const sec of SECTIONS) {
      const items = grouped[sec.id];
      if (!items || items.length === 0) continue;

      html += `<details class="content-section" data-section-id="${sec.id}"><summary>${sec.icon} ${esc(sec.label)} <span class="content-section-count">${items.length}</span></summary>`;
      html += `<div class="form-grid content-fields-grid">`;
      for (const item of items) {
        const val = settings.content?.[item.key] ?? item.original;
        const displayLabel = item.label.slice(0, 120);
        html += `<div class="content-field-wrap" data-content-field="${esc(item.key)}">
          <label>${esc(displayLabel)}<textarea data-content-setting="${item.key}" rows="2" maxlength="2000">${esc(val)}</textarea></label>
          <button type="button" class="content-reset-btn" data-reset-key="${item.key}" data-original="${esc(item.original)}" title="إعادة للنص الأصلي">↩</button>
        </div>`;
      }
      html += `</div></details>`;
    }

    /* Trust badges editor */
    html += `<details class="content-section"><summary>🛡️ عبارات الثقة وسياسة استخدام البيانات</summary><div id="trustContentEditor">${(settings.trustBadges||[]).map((b,i)=>`<div class="form-grid" data-trust-row="${i}"><label>العنوان<input data-trust-title value="${esc(b.title)}" maxlength="100"></label><label>الوصف<textarea data-trust-desc maxlength="500">${esc(b.desc)}</textarea></label><input type="hidden" data-trust-icon value="${esc(b.icon)}"></div>`).join('')}</div></details>`;

    $('contentSettingsEditor').innerHTML = html;

    /* Media editor */
    KenoCheckout.mediaEditor($('globalAudioEditor'),settings.stepAudio);

    /* Logo upload handler */
    $('settingLogoUpload').onchange=async event=>{try{$('settingLogo').value=await KenoCheckout.readMedia(event.target.files[0],'image');$('settingLogo').dispatchEvent(new Event('input',{bubbles:true}));}catch(e){root.alert(e.message);}};

    /* SEO download handler */
    $('downloadSeo').onclick=()=>{
      try{
        const u=new URL($('settingSiteUrl').value);if(u.protocol!=='https:'||u.search||u.hash)throw Error();
        const base=u.href.replace(/\/$/,'') + '/';
        download('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+esc(base)+'</loc></url></urlset>','application/xml');
        download('robots.txt','User-agent: *\nAllow: /\nSitemap: '+base+'sitemap.xml\n','text/plain');
      }catch(_){root.alert('أدخل عنوان HTTPS صحيحًا للموقع أولًا.');}
    };

    /* --- Search functionality --- */
    const searchInput = $('contentSearchInput');
    const searchCount = $('contentSearchCount');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;
        let totalCount = 0;

        $('contentSettingsEditor').querySelectorAll('.content-field-wrap').forEach(wrap => {
          totalCount++;
          if (!query) {
            wrap.hidden = false;
            visibleCount++;
            return;
          }
          const textarea = wrap.querySelector('textarea');
          const label = wrap.querySelector('label');
          const text = (textarea?.value || '') + ' ' + (label?.textContent || '');
          const matches = text.toLowerCase().includes(query);
          wrap.hidden = !matches;
          if (matches) visibleCount++;
        });

        if (query) {
          searchCount.textContent = `${visibleCount} من ${totalCount} نص`;
          // Auto-open sections that have matches
          $('contentSettingsEditor').querySelectorAll('.content-section').forEach(details => {
            const hasVisible = [...details.querySelectorAll('.content-field-wrap')].some(w => !w.hidden);
            if (hasVisible) details.open = true;
          });
        } else {
          searchCount.textContent = `${totalCount} نص قابل للتعديل`;
        }
      });
      // Trigger initial count
      searchInput.dispatchEvent(new Event('input'));
    }

    /* --- Section Reorder Click Listener --- */
    const orderList = $('sectionOrderList');
    if (orderList) {
      orderList.addEventListener('click', event => {
        const btn = event.target.closest('.sec-order-btn');
        if (!btn) return;
        const item = btn.closest('.section-reorder-item');
        if (!item) return;
        const dir = btn.dataset.dir;
        if (dir === 'up' && item.previousElementSibling) {
          item.parentNode.insertBefore(item, item.previousElementSibling);
        } else if (dir === 'down' && item.nextElementSibling) {
          item.parentNode.insertBefore(item.nextElementSibling, item);
        }
        const items = [...orderList.querySelectorAll('.section-reorder-item')];
        items.forEach((it, idx) => {
          const badge = it.querySelector('.section-reorder-badge');
          if (badge) badge.textContent = `#${idx + 1}`;
          const upBtn = it.querySelector('[data-dir="up"]');
          const downBtn = it.querySelector('[data-dir="down"]');
          if (upBtn) upBtn.disabled = idx === 0;
          if (downBtn) downBtn.disabled = idx === items.length - 1;
        });
        const form = $('settingsForm');
        if (form) form.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    /* --- Reset buttons --- */
    $('contentSettingsEditor').addEventListener('click', event => {
      const resetBtn = event.target.closest('.content-reset-btn');
      if (!resetBtn) return;
      const key = resetBtn.dataset.resetKey;
      const original = resetBtn.dataset.original;
      const textarea = $('contentSettingsEditor').querySelector(`[data-content-setting="${key}"]`);
      if (textarea) {
        textarea.value = original;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof root.showToast === 'function') {
          root.showToast('تم إعادة النص للأصلي.');
        }
      }
    });
  }

  function download(name,text,type){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  function readEditor(){
    const content={...(current.content || {})};
    document.querySelectorAll('[data-content-setting]').forEach(el=>{content[el.dataset.contentSetting]=el.value;});

    const layout = {
      siteScale: $('layoutSiteScale')?.value || '100%',
      containerMax: $('layoutContainerMax')?.value || '1200px',
      gridCols: $('layoutGridCols')?.value || '3',
      cardGap: $('layoutCardGap')?.value || '20px',
      sectionGap: $('layoutSectionGap')?.value || '56px',
      cardPadding: $('layoutCardPadding')?.value || '18px',
      cardRadius: $('layoutCardRadius')?.value || '16px',
      headingAlign: $('layoutHeadingAlign')?.value || 'right',
      heroAlign: $('layoutHeroAlign')?.value || 'right'
    };

    const sectionOrder = [...($('sectionOrderList')?.querySelectorAll('[data-sec-id]') || [])]
      .map(el => el.dataset.secId)
      .filter(Boolean);

    return {
      siteUrl: $('settingSiteUrl')?.value.trim() || '',
      logo: $('settingLogo')?.value.trim() || 'assets/logo.png',
      brandColor: $('settingBrandColor')?.value || '#e52d3f',
      content,
      layout,
      sectionOrder: sectionOrder.length ? sectionOrder : (current.sectionOrder || ['home','collections','picks','trust','catalog','payments','how','testimonials','faq']),
      stepAudio: [...($('globalAudioEditor')?.querySelectorAll('[data-audio-index]') || [])].map(el=>el.value.trim()),
      sectionVisibility: Object.fromEntries([...(document.querySelectorAll('[data-section-setting]') || [])].map(el=>[el.dataset.sectionSetting,el.checked])),
      trustBadges: [...($('trustContentEditor')?.children || [])].map(el=>({
        title: el.querySelector('[data-trust-title]')?.value || '',
        desc: el.querySelector('[data-trust-desc]')?.value || '',
        icon: el.querySelector('[data-trust-icon]')?.value || 'shield'
      }))
    };
  }
  root.KenoContent={render,loadEditor,readEditor,getCopyItems:()=>copy,sections:SECTIONS};
})(window);
