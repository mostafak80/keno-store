/* Store content, media and domain settings. Text is inserted as text, never HTML. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=[];
  const dynamic=new Set(['announcementText','announcementPhone','announcementHours','footerTagline','footerStoreName','currentYear','serviceCount','faqPayment','serviceGrid','categoryTabs','heroFeature','collectionGrid','picksGrid','stageMiniOffers','paymentShowcaseGrid','trustGrid','testimonialsGrid']);
  // Stable keys are stamped in HTML; only static storefront content is editable here.
  document.querySelectorAll('[data-content]').forEach(el=>{
    [...el.childNodes].forEach((node,i)=>{
      if(node.nodeType!==3 || !node.textContent.trim() || dynamic.has(el.id))return;
      copy.push({key:el.dataset.content+'-'+i,node,original:node.textContent,label:node.textContent.trim()});
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
    $('contentSettingsEditor').innerHTML=`<details class="content-editor"><summary>محتوى الواجهة، أقسام الموقع، الدومين والتسجيلات</summary>
      <div class="form-grid"><label>لون العلامة الأساسي<input type="color" id="settingBrandColor" value="${esc(settings.brandColor || '#e52d3f')}"></label><label>صورة شعار المتجر<input id="settingLogo" value="${esc(settings.logo || 'assets/logo.png')}"><input type="file" id="settingLogoUpload" accept="image/png,image/jpeg,image/webp"></label></div>
      <label>العنوان المنشور للموقع<input id="settingSiteUrl" type="url" value="${esc(settings.siteUrl||'')}" placeholder="https://keno-store.vercel.app/"></label>
      <p>يحدّث canonical وبيانات المشاركة. عند تغيير الدومين نزّل ملفات SEO التالية وارفعها مع الموقع.</p>
      <button type="button" id="downloadSeo" class="button button-outline small">تنزيل sitemap.xml و robots.txt</button>
      <h4>إظهار وإخفاء أقسام الصفحة</h4><div class="form-grid">${Object.entries({home:'المقدمة',collections:'الأقسام',picks:'المختارات',payments:'طرق الدفع',trust:'ضمانات المتجر',how:'شرح الطلب',testimonials:'التعليقات',faq:'الأسئلة الشائعة'}).map(([id,label])=>`<label><input type="checkbox" data-section-setting="${id}" ${settings.sectionVisibility?.[id]!==false?'checked':''}>${label}</label>`).join('')}</div>
      <h4>تسجيلات مصرية عامة للخطوات الثلاث</h4><p>ارفع تسجيلاتك القصيرة حتى 100 كيلوبايت لكل ملف أو ضع روابط HTTPS. يمكن تخصيص التسجيلات لكل خدمة.</p><div id="globalAudioEditor" class="form-grid"></div>
      <h4>نصوص الواجهة والأسئلة والمساعدة</h4><p>السعر والخدمات والدفع تُعدّل في تبويباتها. النصوص التالية تُعرض كنص آمن.</p>
      <div class="form-grid">${copy.map(item=>`<label>${esc(item.label.slice(0,90))}<textarea data-content-setting="${item.key}" rows="2" maxlength="2000">${esc(settings.content?.[item.key]??item.original)}</textarea></label>`).join('')}</div>
      <h4>عبارات الثقة وسياسة استخدام البيانات</h4><div id="trustContentEditor">${(settings.trustBadges||[]).map((b,i)=>`<div class="form-grid" data-trust-row="${i}"><label>العنوان<input data-trust-title value="${esc(b.title)}" maxlength="100"></label><label>الوصف<textarea data-trust-desc maxlength="500">${esc(b.desc)}</textarea></label><input type="hidden" data-trust-icon value="${esc(b.icon)}"></div>`).join('')}</div></details>`;
    KenoCheckout.mediaEditor($('globalAudioEditor'),settings.stepAudio);
    $('settingLogoUpload').onchange=async event=>{try{$('settingLogo').value=await KenoCheckout.readMedia(event.target.files[0],'image');$('settingLogo').dispatchEvent(new Event('input',{bubbles:true}));}catch(e){root.alert(e.message);}};
    $('downloadSeo').onclick=()=>{
      try{
        const u=new URL($('settingSiteUrl').value);if(u.protocol!=='https:'||u.search||u.hash)throw Error();
        const base=u.href.replace(/\/$/,'')+'/';
        download('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>'+esc(base)+'</loc></url></urlset>','application/xml');
        download('robots.txt','User-agent: *\nAllow: /\nSitemap: '+base+'sitemap.xml\n','text/plain');
      }catch(_){root.alert('أدخل عنوان HTTPS صحيحًا للموقع أولًا.');}
    };
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
