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
    for(const [id,visible] of Object.entries(settings.sectionVisibility||{}))if($(id))$(id).hidden=!visible || (id==='picks' && !$('picksGrid')?.children.length) || (id==='payments' && !$('paymentShowcaseGrid')?.children.length);
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
    let html = `<details class="content-editor" open><summary>محرر محتوى الموقع الشامل</summary>`;

    /* Search box */
    html += `<div class="content-search-wrap"><input type="search" id="contentSearchInput" class="content-search" placeholder="🔍 ابحث عن أي نص في الموقع..." autocomplete="off"><span id="contentSearchCount" class="content-search-count"></span></div>`;

    /* Brand / Logo / URL / Sections — existing controls */
    html += `<details class="content-section"><summary>⚙️ إعدادات المظهر والدومين</summary>
      <div class="form-grid"><label>لون العلامة الأساسي<input type="color" id="settingBrandColor" value="${esc(settings.brandColor || '#e52d3f')}"></label><label>صورة شعار المتجر<input id="settingLogo" value="${esc(settings.logo || 'assets/logo.png')}"><input type="file" id="settingLogoUpload" accept="image/png,image/jpeg,image/webp"></label></div>
      <label>العنوان المنشور للموقع<input id="settingSiteUrl" type="url" value="${esc(settings.siteUrl||'')}" placeholder="https://keno-store.vercel.app/"></label>
      <p>يحدّث canonical وبيانات المشاركة. عند تغيير الدومين نزّل ملفات SEO التالية وارفعها مع الموقع.</p>
      <button type="button" id="downloadSeo" class="button button-outline small">تنزيل sitemap.xml و robots.txt</button>
      <h4>إظهار وإخفاء أقسام الصفحة</h4><div class="form-grid">${Object.entries({home:'المقدمة',collections:'الأقسام',picks:'المختارات',payments:'طرق الدفع',trust:'ضمانات المتجر',how:'شرح الطلب',testimonials:'التعليقات',faq:'الأسئلة الشائعة'}).map(([id,label])=>`<label><input type="checkbox" data-section-setting="${id}" ${settings.sectionVisibility?.[id]!==false?'checked':''}>${label}</label>`).join('')}</div>
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

    html += `</details>`;

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
    const content={...current.content};
    $('contentSettingsEditor').querySelectorAll('[data-content-setting]').forEach(el=>{content[el.dataset.contentSetting]=el.value;});
    return {siteUrl:$('settingSiteUrl').value.trim(),logo:$('settingLogo').value.trim(),brandColor:$('settingBrandColor').value,content,stepAudio:[...$('globalAudioEditor').querySelectorAll('[data-audio-index]')].map(el=>el.value.trim()),
      sectionVisibility:Object.fromEntries([...$('contentSettingsEditor').querySelectorAll('[data-section-setting]')].map(el=>[el.dataset.sectionSetting,el.checked])),
      trustBadges:[...$('trustContentEditor').children].map(el=>({title:el.querySelector('[data-trust-title]').value,desc:el.querySelector('[data-trust-desc]').value,icon:el.querySelector('[data-trust-icon]').value}))};
  }
  root.KenoContent={render,loadEditor,readEditor};
})(window);
