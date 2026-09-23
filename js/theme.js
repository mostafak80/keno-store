/** One theme owner, loaded before styles to avoid flashing the wrong palette. */
(function () {
  'use strict';
  const root = document.documentElement;
  const key = 'keno-theme';
  const valid = value => value === 'dark' || value === 'light';
  let preference = null;
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch (_) {}
  function apply(theme) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#101114' : '#f5f6f8';
    const button = document.getElementById('themeToggle');
    if (button) {
      const label = theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع المظلم';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(theme === 'light'));
      button.title = label;
    }
  }
  const current = () => preference || 'dark';
  apply(current());
  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch (_) {}
      apply(preference);
    });
  }, { once: true });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply(current());
  });
})();
