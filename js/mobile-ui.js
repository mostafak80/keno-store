/* Reference-inspired mobile presentation. Catalog and checkout own all business data. */
(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brands={netflix:'netflix',chatgpt:'openai',gemini:'googlegemini',music:'spotify',tiktok:'tiktok','tiktok-ads':'tiktok','instagram-ads':'instagram',roblox:'roblox','google-play':'googleplay','facebook-ads':'facebook','facebook-pages':'facebook',paypal:'paypal'};
  function artwork(service){
    const id=service.id,brand=brands[id];
    const customImg = service.mobileImage || service.image;
    if(customImg){
      const word = id==='shahid'?'شاهد':service.mark||service.name.split('—')[0].trim();
      const showWordmark = service.mobileShowWordmark !== false;
      return `<div class="mobile-service-art art-custom" aria-hidden="true" style="background:#080c25;">
        <img src="${esc(customImg)}" alt="${esc(service.name)}" loading="lazy" style="width:100%;height:100%;object-fit:var(--kd-m-image-fit,cover);position:absolute;inset:0;">
        ${showWordmark ? `<b class="pubg-wordmark custom-wordmark" style="position:absolute;bottom:8%;left:50%;transform:translateX(-50%);color:#ffc72c;border:2px solid #ffc72c;padding:2px 8px;font:900 16px/.9 Impact,'Arial Narrow',Arial,sans-serif;text-shadow:0 2px 2px #000;background:#080709cc;border-radius:4px;white-space:nowrap;">${esc(word)}</b>` : ''}
      </div>`;
    }
    if(id.startsWith('pubg'))return '<div class="mobile-service-art art-pubg" aria-hidden="true"><img src="assets/brands/pubg-hero.png" alt="" loading="lazy"><b class="pubg-wordmark">PUBG<small>MOBILE</small></b></div>';
    const word=id==='shahid'?'شاهد':service.mark||service.name;
    return `<div class="mobile-service-art art-${esc(brand||service.color||'violet')}" aria-hidden="true"><span class="art-orbit"></span>${brand?`<img class="brand-glyph" src="assets/brands/${brand}.svg" alt="" loading="lazy">`:`<b class="art-wordmark">${esc(word)}</b>`}${id==='chatgpt'?'<b class="art-caption">PLUS</b>':''}</div>`;
  }
  function refresh(data){
    const select=document.getElementById('mobileCategoryFilter');if(!select)return;
    const selected=document.querySelector('#categoryTabs [aria-pressed="true"]')?.dataset.category||'all';
    select.innerHTML='<option value="all">الكل</option>'+data.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    select.value=selected;
    const brand=document.querySelector('.brand');
    brand?.classList.toggle('has-custom-logo',Boolean(data.settings.logo&&data.settings.logo!=='assets/logo.png'));
    const name=document.getElementById('mobileBrandName');if(name)name.textContent=(data.settings.storeName||'KENO STORE').toUpperCase();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const $=id=>document.getElementById(id),menu=$('mobileMoreDialog');
    document.querySelector('.brand')?.addEventListener('click',event=>{if(matchMedia('(max-width:780px)').matches){event.preventDefault();location.hash='#catalog';$('catalog').scrollIntoView({behavior:'smooth',block:'start'})}});
    // Keep packages ahead of optional budget controls on narrow screens.
    if(matchMedia('(max-width:780px)').matches){
      const section=$('planSelectionSection');
      for(const el of [section.querySelector('.plan-tools'),$('planFilterStatus'),$('budgetSelectionNotice')])if(el)section.append(el);
    }
    const syncAccount=()=>{
      const user=$('headerUserName')?.textContent;
      $('mobileAccountStatus').textContent=user?`أهلًا، ${user}`:'تسجيل الدخول اختياري. تقدر تطلب من غير حساب.';
      $('mobileLoginAction').hidden=Boolean(user);$('mobileLogoutAction').hidden=!user;
      $('mobileSort').value=$('sortSelect').value;
    };
    $('mobileCategoryFilter')?.addEventListener('change',e=>{
      [...document.querySelectorAll('#categoryTabs [data-category]')].find(b=>b.dataset.category===e.target.value)?.click();
    });
    $('mobileMoreBtn')?.addEventListener('click',()=>{syncAccount();menu.showModal()});
    $('mobileAccountBtn')?.addEventListener('click',()=>{
      const user=$('headerUserName')?.textContent;
      $('mobileAccountStatus').textContent=user?`أهلًا، ${user}`:'تسجيل الدخول اختياري. تقدر تطلب من غير حساب.';
      $('mobileLoginAction').hidden=Boolean(user);$('mobileLogoutAction').hidden=!user;menu.showModal();
    });
    $('mobileLoginAction')?.addEventListener('click',()=>{menu.close();$('headerGoogleLoginBtn')?.click()});
    $('mobileLogoutAction')?.addEventListener('click',()=>{menu.close();$('headerSignOutBtn')?.click()});
    $('mobileThemeAction')?.addEventListener('click',()=>$('themeToggle')?.click());
    menu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>menu.close()));
    $('mobileSort')?.addEventListener('change',e=>{$('sortSelect').value=e.target.value;$('sortSelect').dispatchEvent(new Event('change'));menu.close()});
    $('discoverySearch')?.addEventListener('input',e=>{
      if(!matchMedia('(max-width:780px)').matches)return;
      $('searchInput').value=e.target.value;$('searchInput').dispatchEvent(new Event('input'));
    });
  });
  root.KenoMobileUI={artwork,refresh};
})(window);
