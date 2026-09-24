/**
 * Keno Store — Mobile Design Admin Panel
 * All settings stored under 'mobileDesign' key and applied via
 * CSS custom properties ONLY inside @media (max-width: 780px).
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'keno_mobile_design_v1';

  const DEFAULTS = {
    layout: 'grid', columns: 3,
    cardScale: 5, gap: 12,
    showDesc: true, showCategory: true, showArtwork: true,
    showPrice: true, showOrderBtn: true,
    accentColor: '#ffce50', bgColor: '#101114',
    cardBgColor: '#191b20', inkColor: '#f7f6f2',
    navBgColor: '#0c0d10', headerBgColor: '#101114',
    fontScale: 100, cardRadius: 16, fontFamily: 'cairo',
    showSearch: true, showCategoryFilter: true, animationsEnabled: true,
    showJourneySteps: true, collapseNotes: true, showPlanArt: true,
  };

  const COLOR_PRESETS = {
    dark:     { accentColor:'#ffce50', bgColor:'#101114', cardBgColor:'#191b20', inkColor:'#f7f6f2', navBgColor:'#0c0d10', headerBgColor:'#101114' },
    midnight: { accentColor:'#c8b8ff', bgColor:'#08090b', cardBgColor:'#111318', inkColor:'#eeedf8', navBgColor:'#06070a', headerBgColor:'#08090b' },
    light:    { accentColor:'#2563eb', bgColor:'#f4f4f6', cardBgColor:'#ffffff', inkColor:'#111827', navBgColor:'#f4f4f6', headerBgColor:'#ffffff' },
    vibrant:  { accentColor:'#f9e040', bgColor:'#0e0a1a', cardBgColor:'#161126', inkColor:'#faf8ff', navBgColor:'#08050f', headerBgColor:'#0e0a1a' },
    forest:   { accentColor:'#34d399', bgColor:'#0a1a0e', cardBgColor:'#112016', inkColor:'#ecfdf5', navBgColor:'#07120a', headerBgColor:'#0a1a0e' },
  };

  let current = { ...DEFAULTS };

  function loadLocal() {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }
  function saveLocal(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
  }
  async function saveToFirestore(s) {
    if (!root.KenoFirebase) return false;
    try { await root.KenoFirebase.saveDesignSettings({ mobileDesign: s }); return true; }
    catch (_) { return false; }
  }
  async function loadFromFirestore() {
    if (!root.KenoFirebase) return null;
    try { const r = await root.KenoFirebase.loadDesignSettings(); return r && r.mobileDesign ? r.mobileDesign : null; }
    catch (_) { return null; }
  }

  function applySettings(s) {
    current = Object.assign({}, DEFAULTS, s);
    var r = document.documentElement, body = document.body;
    r.style.setProperty('--kd-m-accent',     current.accentColor);
    r.style.setProperty('--kd-m-bg',         current.bgColor);
    r.style.setProperty('--kd-m-card-bg',    current.cardBgColor);
    r.style.setProperty('--kd-m-ink',        current.inkColor);
    r.style.setProperty('--kd-m-nav-bg',     current.navBgColor);
    r.style.setProperty('--kd-m-header-bg',  current.headerBgColor);
    var cols = current.layout === 'vertical' ? 1 : Math.max(1, Math.min(3, current.columns));
    r.style.setProperty('--kd-m-cols', String(cols));
    r.style.setProperty('--kd-m-gap',  current.gap + 'px');
    var scaleNum = Math.max(1, Math.min(10, current.cardScale));
    var sf = (0.60 + ((scaleNum - 1) / 9) * 0.80).toFixed(3);
    r.style.setProperty('--kd-m-scale', sf);
    r.style.setProperty('--kd-m-font-scale', (current.fontScale / 100).toFixed(2));
    r.style.setProperty('--kd-m-radius', current.cardRadius + 'px');
    body.classList.toggle('kd-m-vertical', current.layout === 'vertical' || cols === 1);
    [1,2,3].forEach(function(i){ body.classList.remove('kd-m-cols-'+i); });
    body.classList.add('kd-m-cols-' + cols);
    body.classList.toggle('kd-m-hide-desc',      !current.showDesc);
    body.classList.toggle('kd-m-hide-cat',       !current.showCategory);
    body.classList.toggle('kd-m-hide-artwork',   !current.showArtwork);
    body.classList.toggle('kd-m-hide-price',     !current.showPrice);
    body.classList.toggle('kd-m-hide-order-btn', !current.showOrderBtn);
    body.classList.toggle('kd-m-no-search',      !current.showSearch);
    body.classList.toggle('kd-m-no-cat-filter',  !current.showCategoryFilter);
    body.classList.toggle('kd-m-no-animations',  !current.animationsEnabled);
    body.classList.toggle('kd-m-hide-journey',   !current.showJourneySteps);
    body.classList.toggle('kd-m-no-collapse-notes',!current.collapseNotes);
    body.classList.toggle('kd-m-hide-plan-art',  !current.showPlanArt);
  }

  function scaleLabel(v) {
    var m = {1:'أصغر (1)',2:'صغير (2)',3:'أصغر من المتوسط (3)',4:'قريب من المتوسط (4)',5:'متناسق (5)',6:'متوسط (6)',7:'متوسط كبير (7)',8:'كبير (8)',9:'كبير جداً (9)',10:'أكبر (10)'};
    return m[v] || v + '/10';
  }
  function fontScaleLabel(v) {
    if (v <= 90) return 'أصغر (' + v + '%)';
    if (v >= 115) return 'أكبر (' + v + '%)';
    return 'طبيعي (' + v + '%)';
  }

  function syncForm() {
    function $(id){ return document.getElementById(id); }
    var s = current;
    document.querySelectorAll('.md-layout-card').forEach(function(el){
      var a = el.dataset.mdLayout === s.layout;
      el.classList.toggle('md-layout-active', a);
      el.style.border = a ? '2px solid var(--accent,#ffce50)' : '2px solid var(--line,#ffffff20)';
      el.style.background = a ? 'rgba(255,206,80,0.08)' : 'transparent';
      var r = el.querySelector('input[type=radio]'); if(r) r.checked = a;
    });
    var cs = $('mdColsSection');
    if(cs) cs.style.display = s.layout === 'vertical' ? 'none' : 'block';
    document.querySelectorAll('.md-cols-btn').forEach(function(btn){
      var a = parseInt(btn.dataset.mdCols, 10) === s.columns;
      btn.classList.toggle('md-cols-active', a);
      btn.style.border = a ? '2px solid var(--accent,#ffce50)' : '2px solid var(--line,#ffffff20)';
      btn.style.background = a ? 'rgba(255,206,80,0.12)' : 'transparent';
      btn.style.color = a ? 'var(--accent,#ffce50)' : 'var(--ink,#f7f6f2)';
    });
    if($('mdCardScale')) $('mdCardScale').value = s.cardScale;
    if($('mdScaleLabel')) $('mdScaleLabel').textContent = scaleLabel(s.cardScale);
    if($('mdGap')) $('mdGap').value = s.gap;
    if($('mdGapLabel')) $('mdGapLabel').textContent = s.gap + 'px';
    if($('mdFontScale')) $('mdFontScale').value = s.fontScale;
    if($('mdFontScaleLabel')) $('mdFontScaleLabel').textContent = fontScaleLabel(s.fontScale);
    if($('mdCardRadius')) $('mdCardRadius').value = s.cardRadius;
    if($('mdCardRadiusLabel')) $('mdCardRadiusLabel').textContent = s.cardRadius + 'px';
    [['mdShowDesc','showDesc'],['mdShowCategory','showCategory'],['mdShowArtwork','showArtwork'],['mdShowPrice','showPrice'],['mdShowOrderBtn','showOrderBtn'],['mdShowSearch','showSearch'],['mdShowCategoryFilter','showCategoryFilter'],['mdAnimationsEnabled','animationsEnabled'],['mdShowJourneySteps','showJourneySteps'],['mdCollapseNotes','collapseNotes'],['mdShowPlanArt','showPlanArt']].forEach(function(p){
      var el = $(p[0]); if(el) el.checked = !!s[p[1]];
    });
    [['mdAccentColor','mdAccentColorText','accentColor'],['mdBgColor','mdBgColorText','bgColor'],['mdCardBgColor','mdCardBgColorText','cardBgColor'],['mdInkColor','mdInkColorText','inkColor'],['mdNavBgColor','mdNavBgColorText','navBgColor'],['mdHeaderBgColor','mdHeaderBgColorText','headerBgColor']].forEach(function(p){
      var v = (s[p[2]] || '#000000').slice(0,7);
      if($(p[0])) $(p[0]).value = v;
      if($(p[1])) $(p[1]).value = v;
    });
    document.querySelectorAll('.md-font-card').forEach(function(el){
      var a = el.dataset.mdFont === s.fontFamily;
      el.classList.toggle('md-font-active', a);
      el.style.border = a ? '2px solid var(--accent,#ffce50)' : '2px solid var(--line,#ffffff20)';
      el.style.background = a ? 'rgba(255,206,80,0.08)' : 'transparent';
      var r = el.querySelector('input[type=radio]'); if(r) r.checked = a;
    });
  }

  function liveApply(partial) {
    applySettings(Object.assign({}, current, partial));
  }

  function wireControls() {
    function $(id){ return document.getElementById(id); }
    document.querySelectorAll('.md-layout-card').forEach(function(el){
      el.addEventListener('click', function(){ liveApply({ layout: el.dataset.mdLayout }); syncForm(); });
    });
    document.querySelectorAll('.md-cols-btn').forEach(function(btn){
      btn.addEventListener('click', function(){ liveApply({ columns: parseInt(btn.dataset.mdCols, 10) }); syncForm(); });
    });
    function wireRange(inputId, labelId, key, labelFn) {
      var input = $(inputId); if(!input) return;
      input.addEventListener('input', function(){
        var val = Number(input.value);
        var lbl = $(labelId); if(lbl) lbl.textContent = labelFn ? labelFn(val) : val;
        liveApply({ [key]: val });
      });
    }
    wireRange('mdCardScale','mdScaleLabel','cardScale', scaleLabel);
    wireRange('mdGap','mdGapLabel','gap', function(v){ return v+'px'; });
    wireRange('mdFontScale','mdFontScaleLabel','fontScale', fontScaleLabel);
    wireRange('mdCardRadius','mdCardRadiusLabel','cardRadius', function(v){ return v+'px'; });
    [['mdShowDesc','showDesc'],['mdShowCategory','showCategory'],['mdShowArtwork','showArtwork'],['mdShowPrice','showPrice'],['mdShowOrderBtn','showOrderBtn'],['mdShowSearch','showSearch'],['mdShowCategoryFilter','showCategoryFilter'],['mdAnimationsEnabled','animationsEnabled'],['mdShowJourneySteps','showJourneySteps'],['mdCollapseNotes','collapseNotes'],['mdShowPlanArt','showPlanArt']].forEach(function(p){
      var el = $(p[0]);
      if(el) el.addEventListener('change', function(e){ liveApply({ [p[1]]: e.target.checked }); });
    });
    function wireColor(colorId, textId, key){
      var ci = $(colorId), ti = $(textId); if(!ci||!ti) return;
      ci.addEventListener('input', function(){ ti.value = ci.value; liveApply({ [key]: ci.value }); });
      ti.addEventListener('input', function(){
        var v = ti.value.trim();
        if(/^#[0-9a-fA-F]{6}$/.test(v)){ ci.value = v; liveApply({ [key]: v }); }
      });
    }
    wireColor('mdAccentColor','mdAccentColorText','accentColor');
    wireColor('mdBgColor','mdBgColorText','bgColor');
    wireColor('mdCardBgColor','mdCardBgColorText','cardBgColor');
    wireColor('mdInkColor','mdInkColorText','inkColor');
    wireColor('mdNavBgColor','mdNavBgColorText','navBgColor');
    wireColor('mdHeaderBgColor','mdHeaderBgColorText','headerBgColor');
    document.querySelectorAll('.md-color-preset').forEach(function(btn){
      btn.addEventListener('click', function(){
        var p = COLOR_PRESETS[btn.dataset.mdPreset];
        if(p){ liveApply(p); syncForm(); }
      });
    });
    document.querySelectorAll('.md-font-card').forEach(function(el){
      el.addEventListener('click', function(){ liveApply({ fontFamily: el.dataset.mdFont }); syncForm(); });
    });
    function wirePreview(id){
      var btn = $(id); if(!btn) return;
      btn.addEventListener('click', function(){
        var on = document.body.classList.toggle('kd-preview-mobile');
        btn.classList.toggle('is-active', on);
      });
    }
    wirePreview('mobilePreviewToggleBtn');
    wirePreview('mobilePreviewToggleBtn2');
    async function doSave(){
      var msg = $('mobileDesignSaveMsg');
      var btns = ['mobileDesignSaveBtn','mobileDesignSaveBtn2'].map(function(id){ return $(id); }).filter(Boolean);
      btns.forEach(function(b){ b.disabled=true; b.innerHTML='<i data-icon="loader"></i> جارٍ الحفظ…'; });
      if(root.Icons && root.Icons.hydrate) root.Icons.hydrate();
      saveLocal(current);
      var ok = await saveToFirestore(current);
      var text = ok ? '✅ تم حفظ ونشر تصميم الموبايل! التغييرات ظاهرة على أي هاتف فوراً.' : '⚠️ محفوظ محلياً. Firebase غير متصل.';
      var cls = ok ? 'admin-message success-message' : 'admin-message warning-message';
      if(msg){ msg.hidden=false; msg.className=cls; msg.textContent=text; setTimeout(function(){ msg.hidden=true; }, 5000); }
      btns.forEach(function(b){ b.disabled=false; b.innerHTML='<i data-icon="save"></i> حفظ ونشر تصميم الموبايل'; });
      if(root.Icons && root.Icons.hydrate) root.Icons.hydrate();
    }
    ['mobileDesignSaveBtn','mobileDesignSaveBtn2'].forEach(function(id){
      var btn = $(id); if(btn) btn.addEventListener('click', doSave);
    });
    var resetBtn = $('mobileDesignResetBtn');
    if(resetBtn) resetBtn.addEventListener('click', function(){
      if(confirm('سيتم استعادة الإعدادات الافتراضية لشكل الموبايل. هل تريد المتابعة؟')){
        applySettings(Object.assign({}, DEFAULTS)); syncForm(); saveLocal(current);
      }
    });
  }

  function injectMobileCss(){
    if(document.getElementById('kd-mobile-design-style')) return;
    var s = document.createElement('style');
    s.id = 'kd-mobile-design-style';
    s.textContent = '@media (max-width: 780px) {\n  :root { --accent: var(--kd-m-accent, #ffce50); --bg: var(--kd-m-bg, #101114); --paper: var(--kd-m-card-bg, #191b20); --ink: var(--kd-m-ink, #f7f6f2); }\n  body { background: var(--kd-m-bg, #101114); }\n  .site-header, header { background: var(--kd-m-header-bg, #101114) !important; }\n  .mobile-bottom-nav { background: var(--kd-m-nav-bg, #0c0d10) !important; }\n  .service-grid { grid-template-columns: repeat(var(--kd-m-cols, 3), minmax(0, 1fr)) !important; gap: var(--kd-m-gap, 12px) !important; }\n  body.kd-m-vertical .service-grid { grid-template-columns: 1fr !important; }\n  .service-card { border-radius: var(--kd-m-radius, 16px) !important; background: var(--kd-m-card-bg, #191b20) !important; }\n  body { font-size: calc(1rem * var(--kd-m-font-scale, 1)) !important; }\n  body.kd-m-hide-desc .card-description { display: none !important; }\n  body.kd-m-hide-cat .card-category-tag, body.kd-m-hide-cat .plans-count-tag { display: none !important; }\n  body.kd-m-hide-artwork .mobile-service-art { display: none !important; }\n  body.kd-m-hide-price .card-price { display: none !important; }\n  body.kd-m-hide-order-btn .service-card .button { display: none !important; }\n  body.kd-m-no-search #discoverySearch { display: none !important; }\n  body.kd-m-no-cat-filter #mobileCategoryFilter { display: none !important; }\n  body.kd-m-no-animations * { transition: none !important; animation: none !important; }\n  body.kd-m-hide-journey .service-journey-steps { display: none !important; }\n  body.kd-m-hide-plan-art .plan-art { display: none !important; }\n}\nbody.kd-preview-mobile .service-grid { grid-template-columns: repeat(var(--kd-m-cols, 3), minmax(0, 1fr)) !important; max-width: 390px !important; margin: 0 auto !important; }\n';
    document.head.appendChild(s);
  }

  async function init(){
    injectMobileCss();
    var local = loadLocal();
    applySettings(local || DEFAULTS);
    try { var remote = await loadFromFirestore(); if(remote){ applySettings(remote); saveLocal(remote); } } catch(_){}
  }

  root.initMobileDesignPanel = function(){
    if(!document.getElementById('adminMobileDesign')) return;
    syncForm(); wireControls();
    if(root.Icons && root.Icons.hydrate) root.Icons.hydrate();
  };

  root.KenoMobileDesign = { init: init, applySettings: applySettings, current: function(){ return Object.assign({}, current); } };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof window !== 'undefined' ? window : this);
