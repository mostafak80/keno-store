/**
 * Keno Store — Design Admin Panel Controller
 * Wires all design panel inputs to KenoDesign.save() for live preview.
 * Runs only when admin is authenticated.
 */
(function (root) {
  'use strict';

  // ── Preset definitions ──────────────────────────────────────────────────
  const PRESETS = {
    'default': null, // uses KenoDesign.DEFAULTS
    'dark-pro': {
      bgColor: '#08090b', paperColor: '#111318', paperHover: '#1a1d24',
      accentColor: '#c8b8ff', accentDark: '#9070ff', inkColor: '#eeedf8',
      mutedColor: '#9090a8', headerBg: '#08090bf5', footerBg: '#060709',
      gridColumns: 4, cardStyle: 'default', cardRadius: 18, fontFamily: 'inter',
      animationsEnabled: true, hoverTransitionMs: 200,
    },
    'vibrant': {
      bgColor: '#0e0a1a', paperColor: '#161126', accentColor: '#f9e040',
      accentDark: '#d9b800', redColor: '#ff4060', inkColor: '#faf8ff',
      toneRed: '#4d1a28', toneGold: '#3d3410', toneBlue: '#0d2040',
      gridColumns: 4, fontFamily: 'cairo', hoverTransitionMs: 180,
    },
    'minimal': {
      bgColor: '#f4f4f6', paperColor: '#ffffff', paperHover: '#f0f0f4',
      accentColor: '#2563eb', accentDark: '#1d4ed8', redColor: '#dc2626',
      inkColor: '#111827', mutedColor: '#6b7280', headerBg: '#ffffff',
      footerBg: '#f4f4f6', toneRed: '#fee2e2', toneBlue: '#dbeafe',
      toneGold: '#fef3c7', toneGreen: '#d1fae5',
      gridColumns: 3, cardRadius: 12, fontFamily: 'inter',
      hoverTransitionMs: 150, cardHoverEffect: 'border',
    },
    'compact-list': {
      cardStyle: 'list', gridColumns: 1, cardVisualHeight: 100,
      fontFamily: 'cairo', hoverTransitionMs: 200,
    },
    'magazine': {
      cardStyle: 'magazine', gridColumns: 3,
      fontFamily: 'cairo', hoverTransitionMs: 250,
    },
  };

  // ── Helper: get value live from current KenoDesign ─────────────────────
  function curr() {
    return root.KenoDesign ? root.KenoDesign.current() : {};
  }

  // ── Helper: apply partial update live (no save) ────────────────────────
  function liveApply(partial) {
    if (root.KenoDesign) root.KenoDesign.apply({ ...curr(), ...partial });
  }

  // ── Helper: scale label for mobile sizes 1 to 10 ──────────────────────
  function getScaleLabel(scale) {
    const s = parseInt(scale, 10) || 5;
    const labels = {
      1: '1 من 10 (فائق الصغر)',
      2: '2 من 10 (صغير جداً)',
      3: '3 من 10 (صغير)',
      4: '4 من 10 (أصغر من المتوسط)',
      5: '5 من 10 (افتراضي متناسق لـ 3 كروت)',
      6: '6 من 10 (متوسط)',
      7: '7 من 10 (متوسط كبير)',
      8: '8 من 10 (كبير)',
      9: '9 من 10 (كبير جداً)',
      10: '10 من 10 (أكبر حجم واسع)',
    };
    return labels[s] || (s + ' من 10');
  }

  // ── Sync form fields to current settings ──────────────────────────────
  function syncFormToCurrent() {
    const s = curr();
    const $ = id => document.getElementById(id);

    // ── Mobile Settings Sync ──
    const mLayout = s.mobileLayout || 'grid';
    document.querySelectorAll('.design-layout-opt').forEach(el => {
      const active = el.dataset.layout === mLayout;
      el.classList.toggle('active', active);
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = active;
    });
    if ($('designMobileColsContainer')) {
      $('designMobileColsContainer').style.display = mLayout === 'vertical' ? 'none' : 'block';
    }

    const mCols = parseInt(s.mobileColumns, 10) || 3;
    document.querySelectorAll('.design-mcol-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.mcols, 10) === mCols);
    });
    if ($('designMobileColsVal')) {
      $('designMobileColsVal').textContent = mCols + ' كروت في الصف';
    }

    const mScale = parseInt(s.mobileCardScale, 10) || 5;
    if ($('designMobileCardScale')) $('designMobileCardScale').value = mScale;
    if ($('designMobileScaleVal')) $('designMobileScaleVal').textContent = getScaleLabel(mScale);

    const mGap = typeof s.mobileGap === 'number' ? s.mobileGap : 6;
    if ($('designMobileGap')) $('designMobileGap').value = mGap;
    if ($('designMobileGapVal')) $('designMobileGapVal').textContent = mGap;

    if ($('designMobileShowDesc')) $('designMobileShowDesc').checked = !!s.mobileShowDescription;
    if ($('designMobileShowCategory')) $('designMobileShowCategory').checked = s.mobileShowCategory !== false;

    const mFontScale = s.mobileFontScale || 95;
    if ($('designMobileFontScale')) $('designMobileFontScale').value = mFontScale;
    if ($('designMobileFontScaleVal')) $('designMobileFontScaleVal').textContent = mFontScale;

    // ── Desktop Grid cols ──
    document.querySelectorAll('.design-col-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.cols, 10) === s.gridColumns);
    });

    // Ranges
    const ranges = [
      ['designGridGap',   'designGapVal',        s.gridGap],
      ['designCardVisualH','designVisualHVal',    s.cardVisualHeight],
      ['designCardRadius','designRadiusVal',      s.cardRadius],
      ['designFontScale', 'designFontScaleVal',   s.fontScale],
      ['designLineH',     'designLineHVal',       s.lineHeight],
      ['designLetterS',   'designLetterSVal',     s.letterSpacing],
      ['designTransition','designTransitionVal',  s.hoverTransitionMs],
      ['designContainer', 'designContainerVal',   s.containerWidth],
      ['designSectionPad','designSectionPadVal',  s.sectionPaddingV],
      ['designRadiusBase','designRadiusBaseVal',  s.borderRadiusBase],
      ['designBtnH',      'designBtnHVal',        s.buttonHeight],
      ['designBtnR',      'designBtnRVal',        s.buttonRadius],
    ];
    ranges.forEach(([inputId, spanId, val]) => {
      if ($(inputId)) $(inputId).value = val;
      if ($(spanId)) $(spanId).textContent = val;
    });

    // Card style
    document.querySelectorAll('.design-card-style-opt').forEach(el => {
      const active = el.dataset.style === s.cardStyle;
      el.classList.toggle('active', active);
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = active;
    });

    // Hover effect radios
    document.querySelectorAll('input[name="designHoverR"]').forEach(r => {
      r.checked = r.value === s.cardHoverEffect;
    });

    // Colors
    const colorPairs = [
      ['dcAccent','dcAccentText', s.accentColor],
      ['dcRed','dcRedText',       s.redColor],
      ['dcBg','dcBgText',         s.bgColor],
      ['dcPaper','dcPaperText',   s.paperColor],
      ['dcInk','dcInkText',       s.inkColor],
      ['dcMuted','dcMutedText',   s.mutedColor],
      ['dcHeader','dcHeaderText', s.headerBg?.slice(0,7) || '#101114'],
      ['dcFooter','dcFooterText', s.footerBg],
      ['dcToneRed','dcToneRedText', s.toneRed],
      ['dcToneGold','dcToneGoldText', s.toneGold],
      ['dcToneGreen','dcToneGreenText', s.toneGreen],
      ['dcToneBlue','dcToneBlueText', s.toneBlue],
      ['dcToneOrange','dcToneOrangeText', s.toneOrange],
      ['dcToneDark','dcToneDarkText', s.toneDark],
      ['dcTabBg','dcTabBgText', s.tabActiveBg],
      ['dcTabText','dcTabTextText', s.tabActiveText],
    ];
    colorPairs.forEach(([colorId, textId, val]) => {
      if (!val) return;
      const hex = val.length === 7 ? val : (val.slice(0,7));
      if ($(colorId)) $(colorId).value = hex;
      if ($(textId)) $(textId).value = val;
    });

    // Font
    document.querySelectorAll('.design-font-opt').forEach(el => {
      const active = el.dataset.font === s.fontFamily;
      el.classList.toggle('active', active);
      const radio = el.querySelector('input[type=radio]');
      if (radio) radio.checked = active;
    });

    // Heading weight
    document.querySelectorAll('input[name="designHWR"]').forEach(r => {
      r.checked = String(r.value) === String(s.headingWeight);
    });

    // Toggles
    if ($('designAnimEnabled'))    $('designAnimEnabled').checked    = s.animationsEnabled;
    if ($('designDriftEnabled'))   $('designDriftEnabled').checked   = s.cardDriftEnabled;
    if ($('designShimmerEnabled')) $('designShimmerEnabled').checked = s.shimmerEnabled;

    // Easing
    if ($('designEasing')) $('designEasing').value = s.motionEase || 'cubic-bezier(.2,.7,.2,1)';
  }

  // ── Wire all controls ──────────────────────────────────────────────────
  function wireControls() {
    const $ = id => document.getElementById(id);

    // ── Mobile Controls Wiring ──
    document.querySelectorAll('.design-layout-opt').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.design-layout-opt').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        const layout = el.dataset.layout;
        const radio = el.querySelector('input[type=radio]');
        if (radio) radio.checked = true;
        if ($('designMobileColsContainer')) {
          $('designMobileColsContainer').style.display = layout === 'vertical' ? 'none' : 'block';
        }
        liveApply({ mobileLayout: layout });
      });
    });

    document.querySelectorAll('.design-mcol-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.design-mcol-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cols = parseInt(btn.dataset.mcols, 10);
        if ($('designMobileColsVal')) {
          $('designMobileColsVal').textContent = cols + ' كروت في الصف';
        }
        liveApply({ mobileColumns: cols });
      });
    });

    const mScaleInput = $('designMobileCardScale');
    if (mScaleInput) {
      mScaleInput.addEventListener('input', () => {
        const val = parseInt(mScaleInput.value, 10);
        if ($('designMobileScaleVal')) $('designMobileScaleVal').textContent = getScaleLabel(val);
        liveApply({ mobileCardScale: val });
      });
    }

    function makeRange(inputId, spanId, key, parser) {
      const input = $(inputId);
      const span  = $(spanId);
      if (!input) return;
      input.addEventListener('input', () => {
        const val = parser(input.value);
        if (span) span.textContent = val;
        liveApply({ [key]: val });
      });
    }

    makeRange('designMobileGap', 'designMobileGapVal', 'mobileGap', Number);
    makeRange('designMobileFontScale', 'designMobileFontScaleVal', 'mobileFontScale', Number);

    if ($('designMobileShowDesc')) {
      $('designMobileShowDesc').addEventListener('change', e => liveApply({ mobileShowDescription: e.target.checked }));
    }
    if ($('designMobileShowCategory')) {
      $('designMobileShowCategory').addEventListener('change', e => liveApply({ mobileShowCategory: e.target.checked }));
    }

    const previewBtn = $('toggleMobilePreviewBtn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        const isSimulating = document.body.classList.toggle('kd-preview-mobile');
        previewBtn.classList.toggle('is-active', isSimulating);
        previewBtn.innerHTML = isSimulating
          ? '<i data-icon="x"></i> <span>إلغاء معاينة الفون</span>'
          : '<i data-icon="smartphone"></i> <span>معاينة عرض الفون</span>';
        if (root.Icons?.hydrate) root.Icons.hydrate();
        if (isSimulating) {
          const sf = document.getElementById('storefront') || document.getElementById('serviceGrid');
          if (sf) sf.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    // ── Desktop Grid columns buttons ──
    document.querySelectorAll('.design-col-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cols = parseInt(btn.dataset.cols, 10);
        document.querySelectorAll('.design-col-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        liveApply({ gridColumns: cols });
      });
    });

    // Card style options
    document.querySelectorAll('.design-card-style-opt').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.design-card-style-opt').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        liveApply({ cardStyle: el.dataset.style });
      });
    });

    // Font options
    document.querySelectorAll('.design-font-opt').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.design-font-opt').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        liveApply({ fontFamily: el.dataset.font });
      });
    });

    // Desktop Range sliders
    makeRange('designGridGap',   'designGapVal',       'gridGap',          Number);
    makeRange('designCardVisualH','designVisualHVal',  'cardVisualHeight',  Number);
    makeRange('designCardRadius','designRadiusVal',    'cardRadius',        Number);
    makeRange('designFontScale', 'designFontScaleVal', 'fontScale',         Number);
    makeRange('designLineH',     'designLineHVal',     'lineHeight',        parseFloat);
    makeRange('designLetterS',   'designLetterSVal',   'letterSpacing',     parseFloat);
    makeRange('designTransition','designTransitionVal','hoverTransitionMs', Number);
    makeRange('designContainer', 'designContainerVal', 'containerWidth',    Number);
    makeRange('designSectionPad','designSectionPadVal','sectionPaddingV',  Number);
    makeRange('designRadiusBase','designRadiusBaseVal','borderRadiusBase',  Number);
    makeRange('designBtnH',      'designBtnHVal',      'buttonHeight',      Number);
    makeRange('designBtnR',      'designBtnRVal',      'buttonRadius',      Number);

    // Radios: hover effect
    document.querySelectorAll('input[name="designHoverR"]').forEach(r => {
      r.addEventListener('change', () => liveApply({ cardHoverEffect: r.value }));
    });

    // Radios: heading weight
    document.querySelectorAll('input[name="designHWR"]').forEach(r => {
      r.addEventListener('change', () => liveApply({ headingWeight: Number(r.value) }));
    });

    // Toggles
    if ($('designAnimEnabled'))    $('designAnimEnabled').addEventListener('change', e => liveApply({ animationsEnabled: e.target.checked }));
    if ($('designDriftEnabled'))   $('designDriftEnabled').addEventListener('change', e => liveApply({ cardDriftEnabled: e.target.checked }));
    if ($('designShimmerEnabled')) $('designShimmerEnabled').addEventListener('change', e => liveApply({ shimmerEnabled: e.target.checked }));

    // Easing
    if ($('designEasing')) $('designEasing').addEventListener('change', e => liveApply({ motionEase: e.target.value }));

    // Color inputs — sync text↔picker, apply live
    function makeColor(colorId, textId, key, transform) {
      const colorInput = $(colorId);
      const textInput  = $(textId);
      if (!colorInput || !textInput) return;
      colorInput.addEventListener('input', () => {
        const v = transform ? transform(colorInput.value) : colorInput.value;
        textInput.value = v;
        liveApply({ [key]: v });
      });
      textInput.addEventListener('input', () => {
        const v = textInput.value.trim();
        if (/^#[0-9a-fA-F]{6,8}$/.test(v)) {
          colorInput.value = v.slice(0, 7);
          liveApply({ [key]: v });
        }
      });
    }
    makeColor('dcAccent',     'dcAccentText',     'accentColor');
    makeColor('dcRed',        'dcRedText',         'redColor');
    makeColor('dcBg',         'dcBgText',          'bgColor');
    makeColor('dcPaper',      'dcPaperText',       'paperColor');
    makeColor('dcInk',        'dcInkText',         'inkColor');
    makeColor('dcMuted',      'dcMutedText',       'mutedColor');
    makeColor('dcHeader',     'dcHeaderText',      'headerBg');
    makeColor('dcFooter',     'dcFooterText',      'footerBg');
    makeColor('dcToneRed',    'dcToneRedText',     'toneRed');
    makeColor('dcToneGold',   'dcToneGoldText',    'toneGold');
    makeColor('dcToneGreen',  'dcToneGreenText',   'toneGreen');
    makeColor('dcToneBlue',   'dcToneBlueText',    'toneBlue');
    makeColor('dcToneOrange', 'dcToneOrangeText',  'toneOrange');
    makeColor('dcToneDark',   'dcToneDarkText',    'toneDark');
    makeColor('dcTabBg',      'dcTabBgText',       'tabActiveBg');
    makeColor('dcTabText',    'dcTabTextText',     'tabActiveText');

    // Presets
    document.querySelectorAll('.design-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (btn.dataset.preset === 'default') {
          root.KenoDesign?.apply({ ...root.KenoDesign.DEFAULTS });
        } else if (preset) {
          root.KenoDesign?.apply({ ...root.KenoDesign.DEFAULTS, ...preset });
        }
        setTimeout(syncFormToCurrent, 100);
      });
    });

    // Save button
    const saveBtn = $('designSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const msg = $('designSaveMsg');
        saveBtn.disabled = true;
        saveBtn.textContent = 'جارٍ الحفظ والنشر…';
        try {
          const ok = await root.KenoDesign?.save(root.KenoDesign.current());
          if (msg) {
            msg.hidden = false;
            msg.className = ok ? 'admin-message success-message' : 'admin-message warning-message';
            msg.textContent = ok
              ? '✅ تم حفظ ونشر تصميم الموقع بنجاح! التعديلات مباشرة ومحفوظة بالسحابة لجميع العملاء.'
              : '⚠️ تم تطبيق التصميم محلياً وحفظه بالمتصفح.';
            setTimeout(() => { msg.hidden = true; }, 5000);
          }
        } catch (err) {
          if (msg) {
            msg.hidden = false;
            msg.className = 'admin-message error-message';
            msg.textContent = '❌ خطأ في الحفظ: ' + err.message;
          }
        }
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-icon="save"></i> <span>حفظ ونشر التصميم</span>';
        if (root.Icons?.hydrate) root.Icons.hydrate();
      });
    }

    // Reset button
    const resetBtn = $('designResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('هل أنت متأكد؟ سيتم استعادة الإعدادات الافتراضية لتصميم الموقع.')) {
          root.KenoDesign?.reset();
          setTimeout(syncFormToCurrent, 100);
        }
      });
    }
  }

  // ── Public init (called when admin workspace is revealed) ───────────────
  root.initDesignAdminPanel = function () {
    if (!document.getElementById('adminDesign')) return;
    syncFormToCurrent();
    wireControls();
  };

})(typeof window !== 'undefined' ? window : this);
