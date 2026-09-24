/**
 * Keno Store � Design Control Panel Engine
 * Full visual control: colors, typography, layouts, animations, card styles, spacing.
 * Settings are persisted to Firestore and applied via CSS custom properties on <html>.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'keno_design_settings_v1';

  const DEFAULTS = {
    gridColumns: 4,
    gridGap: 18,
    cardStyle: 'default',
    cardRadius: 16,
    cardHoverEffect: 'lift',
    cardVisualHeight: 134,
    fontFamily: 'cairo',
    fontScale: 100,
    headingWeight: 900,
    bodyWeight: 400,
    lineHeight: 1.7,
    letterSpacing: -0.3,
    accentColor: '#ffce50',
    accentDark: '#d9a800',
    redColor: '#e52d3f',
    bgColor: '#101114',
    paperColor: '#191b20',
    paperHover: '#22252c',
    inkColor: '#f7f6f2',
    mutedColor: '#b2b3bc',
    lineColor: '#ffffff16',
    headerBg: '#101114f7',
    footerBg: '#0c0d10',
    sectionBg: '#0c0d10',
    toneRed: '#49232b',
    toneGold: '#423c24',
    toneGreen: '#203d34',
    toneBlue: '#253544',
    toneOrange: '#493022',
    toneDark: '#2a2d34',
    containerWidth: 1240,
    sectionPaddingV: 56,
    borderRadiusBase: 16,
    borderRadiusLg: 22,
    buttonRadius: 11,
    buttonHeight: 46,
    animationsEnabled: true,
    hoverTransitionMs: 250,
    motionEase: 'cubic-bezier(.2,.7,.2,1)',
    cardDriftEnabled: true,
    shimmerEnabled: true,
    tabStyle: 'pill',
    tabActiveColor: '#ffce50',
    tabActiveBg: '#ffce50',
    tabActiveText: '#241e10',
    heroGradient: '#a7162b,#e62e42',
    heroEnabled: true,
    footerLayout: 'standard',
    // ── Mobile Settings ───────────────────────
    mobileLayout: 'grid',
    mobileColumns: 3,
    mobileGap: 6,
    mobileCardScale: 5,
    mobileShowDescription: false,
    mobileShowCategory: true,
    mobileFontScale: 95,
  };

  let current = { ...DEFAULTS };

  function applySettings(settings) {
    const s = { ...DEFAULTS, ...settings };
    current = s;
    const r = document.documentElement;
    const body = document.body;

    r.style.setProperty('--kd-grid-cols', String(s.gridColumns));
    r.style.setProperty('--kd-grid-gap', s.gridGap + 'px');
    r.style.setProperty('--kd-card-radius', s.cardRadius + 'px');
    r.style.setProperty('--kd-card-visual-h', s.cardVisualHeight + 'px');
    r.style.setProperty('--kd-font-scale', s.fontScale / 100);
    r.style.setProperty('--kd-line-height', String(s.lineHeight));
    r.style.setProperty('--kd-letter-spacing', s.letterSpacing + 'px');
    r.style.setProperty('--kd-heading-weight', String(s.headingWeight));
    r.style.setProperty('--kd-accent', s.accentColor);
    r.style.setProperty('--kd-accent-dark', s.accentDark);
    r.style.setProperty('--kd-red', s.redColor);
    r.style.setProperty('--kd-bg', s.bgColor);
    r.style.setProperty('--kd-paper', s.paperColor);
    r.style.setProperty('--kd-paper-hover', s.paperHover);
    r.style.setProperty('--kd-ink', s.inkColor);
    r.style.setProperty('--kd-muted', s.mutedColor);
    r.style.setProperty('--kd-line', s.lineColor);
    r.style.setProperty('--kd-header-bg', s.headerBg);
    r.style.setProperty('--kd-footer-bg', s.footerBg);
    r.style.setProperty('--kd-section-bg', s.sectionBg);
    r.style.setProperty('--kd-tone-red', s.toneRed);
    r.style.setProperty('--kd-tone-gold', s.toneGold);
    r.style.setProperty('--kd-tone-green', s.toneGreen);
    r.style.setProperty('--kd-tone-blue', s.toneBlue);
    r.style.setProperty('--kd-tone-orange', s.toneOrange);
    r.style.setProperty('--kd-tone-dark', s.toneDark);
    r.style.setProperty('--kd-container-w', s.containerWidth + 'px');
    r.style.setProperty('--kd-section-pad-v', s.sectionPaddingV + 'px');
    r.style.setProperty('--kd-radius-base', s.borderRadiusBase + 'px');
    r.style.setProperty('--kd-radius-lg', s.borderRadiusLg + 'px');
    r.style.setProperty('--kd-btn-radius', s.buttonRadius + 'px');
    r.style.setProperty('--kd-btn-height', s.buttonHeight + 'px');
    r.style.setProperty('--kd-transition', s.hoverTransitionMs + 'ms');
    r.style.setProperty('--kd-ease', s.motionEase);
    r.style.setProperty('--kd-tab-active-color', s.tabActiveColor);
    r.style.setProperty('--kd-tab-active-bg', s.tabActiveBg);
    r.style.setProperty('--kd-tab-active-text', s.tabActiveText);

    // ── Mobile settings ──────────────────────────────────────
    const mLayout = s.mobileLayout || 'grid';
    const mColsRaw = parseInt(s.mobileColumns, 10) || 3;
    const mCols = (mLayout === 'vertical') ? 1 : Math.max(1, Math.min(10, mColsRaw));
    const mScaleNum = Math.max(1, Math.min(10, parseInt(s.mobileCardScale, 10) || 5));
    // Factor: 0.60 (size 1) to 1.40 (size 10), size 5 is ~0.955
    const mScaleFactor = 0.60 + ((mScaleNum - 1) / 9) * 0.80;
    const mGap = typeof s.mobileGap === 'number' ? s.mobileGap : 6;
    const mFontScale = (s.mobileFontScale || 95) / 100;

    r.style.setProperty('--kd-mobile-cols', String(mCols));
    r.style.setProperty('--kd-mobile-gap', mGap + 'px');
    r.style.setProperty('--kd-mobile-scale-factor', mScaleFactor.toFixed(3));
    r.style.setProperty('--kd-mobile-font-scale', mFontScale.toFixed(2));

    body.classList.toggle('kd-mobile-layout-vertical', mLayout === 'vertical' || mCols === 1);
    body.classList.toggle('kd-mobile-hide-desc', !s.mobileShowDescription);
    body.classList.toggle('kd-mobile-show-desc', !!s.mobileShowDescription);
    body.classList.toggle('kd-mobile-hide-cat', s.mobileShowCategory === false);

    for (let i = 1; i <= 10; i++) {
      body.classList.remove('kd-mobile-cols-' + i);
    }
    body.classList.add('kd-mobile-cols-' + mCols);

    body.classList.toggle('kd-no-animations', !s.animationsEnabled);
    body.classList.toggle('kd-no-drift', !s.cardDriftEnabled);
    body.classList.toggle('kd-no-shimmer', !s.shimmerEnabled);

    const sg = document.getElementById('serviceGrid');
    if (sg) {
      sg.classList.remove('card-style-default','card-style-compact','card-style-list','card-style-wide','card-style-magazine');
      sg.classList.add('card-style-' + s.cardStyle);
    }

    applyFont(s.fontFamily);
  }

  function applyFont(fontName) {
    const fontMap = {
      cairo: "'Cairo','Noto Kufi Arabic',sans-serif",
      tajawal: "'Tajawal','Noto Kufi Arabic',sans-serif",
      inter: "'Inter','Cairo',sans-serif",
      roboto: "'Roboto','Cairo',sans-serif",
      noto: "'Noto Sans Arabic','Cairo',sans-serif",
    };
    const stack = fontMap[fontName] || fontMap.cairo;
    document.documentElement.style.setProperty('--kd-font', stack);
    document.documentElement.style.setProperty('--font', stack);
    if (fontName !== 'cairo') {
      const urls = {
        tajawal: 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap',
        inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap',
        roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap',
        noto: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700;900&display=swap',
      };
      if (urls[fontName] && !document.querySelector('[data-kd-font="' + fontName + '"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = urls[fontName];
        link.dataset.kdFont = fontName;
        document.head.appendChild(link);
      }
    }
  }

  function saveLocal(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
  }

  function loadLocal() {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch (_) { return null; }
  }

  async function saveToFirestore(s) {
    if (!root.KenoFirebase || typeof root.KenoFirebase.saveDesignSettings !== 'function') return false;
    try { await root.KenoFirebase.saveDesignSettings(s); return true; } catch (_) { return false; }
  }

  async function loadFromFirestore() {
    if (!root.KenoFirebase || typeof root.KenoFirebase.loadDesignSettings !== 'function') return null;
    try { return await root.KenoFirebase.loadDesignSettings(); } catch (_) { return null; }
  }

  async function init() {
    const local = loadLocal();
    if (local) applySettings(local);
    const remote = await loadFromFirestore();
    if (remote) { applySettings(remote); saveLocal(remote); }
  }

  root.KenoDesign = {
    DEFAULTS,
    current: () => ({ ...current }),
    async save(partial) {
      const merged = { ...current, ...partial };
      applySettings(merged);
      saveLocal(merged);
      return await saveToFirestore(merged);
    },
    apply: applySettings,
    reset() {
      const d = { ...DEFAULTS };
      applySettings(d);
      saveLocal(d);
      saveToFirestore(d);
    },
    init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
