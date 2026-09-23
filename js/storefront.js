/** Keno storefront composition and motion. No pricing, payment or admin state is stored here.
 * render() always receives the active validated catalog, including admin preview/live updates.
 * Exported selectors are pure and can be tested with node --test tests/storefront.test.cjs.
 */
(function (root) {
  'use strict';
  const isOrderable = service => service.visible === true && service.available !== false && service.status !== 'unavailable';
  const lowestPlan = service => (service.plans || []).filter(p => p.available === true && Number.isFinite(p.price) && p.price > 0)
    .reduce((best, plan) => !best || plan.price < best.price ? plan : best, null);
  function selectPicks(data, limit = 4) {
    const eligible = (data.services || []).filter(isOrderable).filter(s => lowestPlan(s));
    const ordered = [...eligible.filter(s => s.featured), ...eligible.filter(s => !s.featured)];
    const chosen = [];
    // Show different needs first, then fill with other real available services.
    for (const category of ['games', 'entertainment', 'ai', 'apps']) {
      const service = ordered.find(s => s.category === category);
      if (service && chosen.length < limit) chosen.push(service);
    }
    for (const service of ordered) if (chosen.length < limit && !chosen.includes(service)) chosen.push(service);
    return chosen.map(service => ({ service, plan: lowestPlan(service) }));
  }
  function collections(data) {
    return (data.categories || []).map(category => ({ ...category,
      count: (data.services || []).filter(s => s.visible && s.category === category.id).length
    })).filter(c => c.count > 0);
  }
  const api = { isOrderable, lowestPlan, selectPicks, collections };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let data = null;
  let observer = null;
  const observed = new WeakSet();
  function updateMotion() {
    document.body.classList.toggle('motion-paused', reduced.matches);
    document.documentElement.classList.toggle('motion-paused', reduced.matches);
  }
  function refresh() {
    if (!observer && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          if (!reduced.matches) entry.target.classList.add('motion-arrive');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08 });
    }
    if (observer) document.querySelectorAll('#storefront .collection-tile, #storefront .pick-card, #serviceGrid .service-card, #storefront .payment-tile, #storefront .steps-grid article').forEach(el => {
      if (!observed.has(el)) { observed.add(el); observer.observe(el); }
    });
  }
  function render(catalog, utils) {
    data = catalog;
    const { esc, icon, money } = utils;
    if ($('collectionGrid')) $('collectionGrid').innerHTML = collections(data).map(c => `
      <button type="button" class="collection-tile" data-collection="${esc(c.id)}" aria-pressed="false">
        <span class="collection-symbol">${icon(c.icon)}</span><b>${esc(c.name)}</b><small>${c.count} خدمة</small>
      </button>`).join('');
    const picks = selectPicks(data);
    if ($('picks')) $('picks').hidden = picks.length === 0;
    if ($('picksGrid')) $('picksGrid').innerHTML = picks.map(({service: s, plan: p}) => {
      const category = data.categories.find(c => c.id === s.category);
      const image = s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy" decoding="async">` : '';
      return `<button type="button" class="pick-card" data-open-service="${esc(s.id)}" data-plan="${esc(p.id)}" aria-label="${esc(`${s.name}، ${p.label}، ${money(p.price)} جنيه`)}">
        <span class="pick-art">${image || `<strong dir="auto">${esc(s.mark || s.name)}</strong>${icon(s.icon)}`}</span>
        <span class="pick-content"><small>${esc(category?.name || '')}</small><b>${esc(s.name)}</b><span class="pick-plan">${esc(p.label)}</span>
        <span class="pick-bottom"><span class="pick-price"><bdi>${money(p.price)}</bdi> <small>جنيه</small></span><span class="pick-arrow" aria-hidden="true">${icon('arrow-left')}</span></span></span>
      </button>`;
    }).join('');
    $('picksGrid')?.querySelectorAll('img').forEach(img => img.addEventListener('error', () => {
      const card = img.closest('[data-open-service]');
      const service = data.services.find(s => s.id === card.dataset.openService);
      if (service) img.parentElement.innerHTML = `<strong dir="auto">${esc(service.mark || service.name)}</strong>${icon(service.icon)}`;
    }, { once: true }));
    if ($('stageMiniOffers')) $('stageMiniOffers').innerHTML = picks.filter(p => ['ai','entertainment'].includes(p.service.category)).slice(0,2).map(({service: s, plan: p}) => `
      <button type="button" class="mini-offer" data-open-service="${esc(s.id)}" data-plan="${esc(p.id)}">
        ${icon(s.icon)}<span><b>${esc(s.name)}</b><small>${esc(p.label)} · <bdi>${money(p.price)}</bdi> جنيه</small></span>
      </button>`).join('');
    const methods = (data.paymentMethods || []).filter(m => m.enabled);
    if ($('payments')) $('payments').hidden = methods.length === 0;
    if ($('paymentShowcaseGrid')) $('paymentShowcaseGrid').innerHTML = methods.map(m => `
      <article class="payment-tile"><span class="payment-symbol">${icon(m.icon || 'wallet-cards')}</span>
        <h3>${esc(m.name.replace(/\s*\(.*?\)/g,''))}</h3><bdi>${esc(m.number || m.accountName || '')}</bdi>
        ${m.accountName ? `<small>${esc(m.accountName)}</small>` : ''}
        ${m.number ? `<button type="button" data-copy-method="${esc(m.id)}" aria-label="${esc('نسخ بيانات ' + m.name)}">${icon('copy')} نسخ البيانات</button>` : ''}
      </article>`).join('');
    // FAQ follows enabled payment methods, including later admin changes.
    const faqPhone = $('faqPayment');
    if (faqPhone) {
      const paragraph = faqPhone.closest('p');
      const lead = document.createTextNode(methods.length ? `طرق الدفع المتاحة: ${methods.map(m => m.name).join('، ')}. بيانات التحويل موضحة في قسم طرق الدفع وعند اختيار العرض. أكّد السعر والإتاحة على واتساب قبل التحويل.` : 'تواصل مع كينو لتأكيد وسيلة الدفع المتاحة قبل التحويل.');
      const anchor = document.createElement('bdi'); anchor.id = 'faqPayment'; anchor.hidden = true;
      paragraph.replaceChildren(lead, anchor);
    }
    refresh();
  }
  function discover(query, collection) {
    const input = $('searchInput');
    if (!input) return;
    const tab = [...($('categoryTabs')?.querySelectorAll('[data-category]') || [])].find(el => el.dataset.category === (collection || 'all'));
    // Clear a previous query before changing category so a category never looks empty accidentally.
    input.value = query || '';
    if ($('discoverySearch')) $('discoverySearch').value = input.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    tab?.click();
    location.hash = '#catalog';
    $('catalog')?.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
    input.focus({ preventScroll: true });
    document.querySelectorAll('[data-collection]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.collection === collection)));
  }
  document.addEventListener('DOMContentLoaded', () => {
    updateMotion();
    reduced.addEventListener?.('change', updateMotion);
    $('discoverySearchForm')?.addEventListener('submit', event => {
      event.preventDefault();
      discover($('discoverySearch').value.trim());
    });
    $('categoryTabs')?.addEventListener('click', event => {
      const tab = event.target.closest('[data-category]');
      if (tab) document.querySelectorAll('[data-collection]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.collection === tab.dataset.category)));
    });
    document.addEventListener('click', async event => {
      const tile = event.target.closest('[data-collection]');
      if (tile) discover('', tile.dataset.collection);
      const quick = event.target.closest('[data-discover-query]');
      if (quick) discover(quick.dataset.discoverQuery);
      const button = event.target.closest('[data-copy-method]');
      if (button && data) {
        const method = data.paymentMethods.find(m => m.enabled && m.id === button.dataset.copyMethod);
        if (!method?.number) return;
        const success = await root.KenoOrder?.copyToClipboard(method.number);
        const status = $('paymentCopyStatus');
        if (status) status.textContent = success ? `تم نسخ بيانات ${method.name}. تأكد من اسم المستلم قبل التحويل.` : `تعذّر النسخ التلقائي. انسخ البيانات يدويًا: ${method.number}`;
        button.focus({ preventScroll: true });
      }
    });
    // Stop continuous artwork animation when the tab is not visible.
    document.addEventListener('visibilitychange', () => document.body.classList.toggle('motion-background', document.hidden));
    refresh();
  });
  root.KenoStorefront = { ...api, render, refresh };
})(typeof window !== 'undefined' ? window : globalThis);
