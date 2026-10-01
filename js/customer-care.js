/* Customer care: private tracking, current-price reorders, opt-in reminders and a measured funnel. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const detailLabels = {accountType:'نوع الحساب', duration:'المدة', devices:'الأجهزة / الاستخدام', activation:'طريقة التفعيل', delivery:'وقت التنفيذ', compensation:'شروط التعويض'};
  const statuses = ['pending','paid','processing','delivered'];
  const labels = {pending:'بانتظار تأكيد الدفع',paid:'تم تأكيد الدفع',processing:'جاري التنفيذ',delivered:'تم التسليم',cancelled:'تم إلغاء الطلب'};
  const memory = new Map(), seen = new Set();
  let catalog, hubTab = 'orders', trackingUnsubscribe, requestTarget, lastTrack = '', adminBusy = false;
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem('keno.care.'+key)) ?? fallback; } catch (_) { return memory.get(key) ?? fallback; } }
  function write(key, value) { memory.set(key,value); try { localStorage.setItem('keno.care.'+key,JSON.stringify(value)); return true; } catch (_) { return false; } }
  function token() { const bytes=new Uint8Array(24); root.crypto.getRandomValues(bytes); return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  function current() { return root.getStoreCatalog?.() || catalog || root.KENO_CATALOG; }
  function message(text) { root.showToast?.(text); }
  function deadline(promise) { let timer; return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('تعذر تأكيد الاتصال الآن. حاول مرة أخرى.')),9000);})]).finally(()=>clearTimeout(timer)); }
  function icon(name) { return `<i data-icon="${name}"></i>`; }
  function hydrate() { root.hydrateIcons?.($('customerCare')); root.hydrateIcons?.($('customerHub')); root.hydrateIcons?.($('careRequestDialog')); root.hydrateIcons?.($('planSelectionSection')); }
  function trackingLink(order) { return /^[a-f0-9]{48}$/.test(order?.trackingToken || '') ? `${location.origin}${location.pathname}#track/${order.trackingToken}` : ''; }
  function projection(order) {
    return {id:order.id,status:order.status,timestamp:order.timestamp,updatedAt:order.updatedAt || order.timestamp,
      expectedAt:order.expectedAt || 0,total:order.total,
      items:(order.items||[]).map(i=>({serviceId:i.serviceId,planId:i.planId || '',serviceName:i.serviceName,planLabel:i.planLabel,quantity:i.quantity,price:i.price}))};
  }
  function prepareOrder(order) { order.trackingToken=order.trackingToken || token(); }
  function remember(order) {
    if (!order?.id) return;
    const list=read('orders',[]).filter(i=>i.id!==order.id);
    list.unshift({...projection(order),trackingToken:order.trackingToken || '',cloud:order.cloud === true});
    write('orders',list.slice(0,60)); updateCount();
  }
  function updateCount() { if ($('careOrderCount')) $('careOrderCount').textContent=read('orders',[]).length; }
  function event(name, serviceId='', step='', unique='') {
    if (location.hash.startsWith('#admin') || root.KenoFirebase?.getCurrentUser?.()) return;
    const supported=['service_view','checkout_step','cart_step','whatsapp_open','reorder'];
    if (!supported.includes(name)) return;
    const key=[name,serviceId,step,unique].join(':'); if(seen.has(key))return; seen.add(key);
    const list=read('events',[]), entry={id:token(),name,serviceId:String(serviceId).slice(0,80),step:String(step).slice(0,3),timestamp:Date.now()};
    write('events',[...list,entry].slice(-500));
    if(seen.size<=100) root.KenoFirebase?.recordCareEvent?.(entry).catch(()=>{});
  }
  function whatsappOpened(order) { remember(order); event('whatsapp_open',order.type==='cart'?'':order.items[0]?.serviceId || '', '', order.id); }
  function refresh(data) { catalog=data;updateCount();if($('customerHub')?.open&&hubTab==='alerts')renderAlerts(); }
  function openService(service) {
    if(!$('carePlanTools')) {
      const tools=document.createElement('div');tools.id='carePlanTools';tools.className='care-plan-tools';
      $('planGroups').before(tools);
    }
    const unavailable=service.available===false||service.status==='unavailable';
    const unavailablePlans=service.plans.filter(p=>!p.available);
    $('carePlanTools').innerHTML=unavailable?`<button type="button" class="button button-outline" data-care-notify-service="${esc(service.id)}">${icon('bell')} بلغني لما الخدمة تتوفر</button>`:unavailablePlans.length?`<button type="button" class="button button-outline small" data-care-notify-service="${esc(service.id)}">${icon('bell')} تنبيه للعروض غير المتاحة (${unavailablePlans.length})</button>`:'';
    event('service_view',service.id);hydrate();
  }
  function loadPlanEditor(plan) { Object.keys(detailLabels).forEach(key=>{if($('careDetail-'+key))$('careDetail-'+key).value=plan?.details?.[key]||'';}); }
  function readPlanEditor() { return Object.fromEntries(Object.keys(detailLabels).map(key=>[key,$('careDetail-'+key)?.value.trim()||''])); }
  function buildDialogs() {
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="customerHub" class="care-dialog" aria-labelledby="customerHubTitle"><div class="care-dialog-head"><div><span class="care-kicker">كينو معاك</span><h2 id="customerHubTitle">طلباتي وتنبيهاتي</h2></div><button type="button" class="icon-btn" data-care-close="customerHub" aria-label="إغلاق طلباتي">${icon('x')}</button></div>
        <div class="care-hub-tabs" role="tablist" aria-label="خدمات العملاء"><button id="careOrdersTab" type="button" role="tab" aria-selected="true" aria-controls="careOrdersPanel" data-care-tab="orders">${icon('shopping-bag')} طلباتي</button><button id="careTrackingTab" type="button" role="tab" aria-selected="false" aria-controls="careTrackingPanel" tabindex="-1" data-care-tab="tracking">${icon('map-pin')} متابعة طلب</button><button id="careAlertsTab" type="button" role="tab" aria-selected="false" aria-controls="careAlertsPanel" tabindex="-1" data-care-tab="alerts">${icon('bell')} تنبيهاتي</button></div>
        <div class="care-dialog-body"><section id="careOrdersPanel" role="tabpanel" aria-labelledby="careOrdersTab"><p class="care-muted">طلباتك المحفوظة على هذا الجهاز. احتفظ برابط المتابعة لفتح الطلب من جهاز آخر.</p><div id="careOrdersList"></div></section>
        <section id="careTrackingPanel" role="tabpanel" aria-labelledby="careTrackingTab" hidden><form id="careTrackingForm"><label for="careTrackingInput">رابط المتابعة الخاص بطلبك</label><div class="care-inline-form"><input id="careTrackingInput" required dir="ltr" maxlength="2000" placeholder="الصق رابط المتابعة هنا" autocomplete="off"><button class="button button-yellow" type="submit">تابع الطلب</button></div><small class="care-muted">هتلاقي الرابط في رسالة طلبك على واتساب. احتفظ به لنفسك.</small></form><p id="careTrackingStatus" role="status" aria-live="polite"></p><div id="careTrackingResult"></div></section>
        <section id="careAlertsPanel" role="tabpanel" aria-labelledby="careAlertsTab" hidden><div id="careAlertsList"></div></section></div>
      </dialog>
      <dialog id="careRequestDialog" class="care-dialog care-request-dialog" aria-labelledby="careRequestTitle"><div class="care-dialog-head"><h2 id="careRequestTitle">تنبيه التوفر</h2><button type="button" class="icon-btn" data-care-close="careRequestDialog" aria-label="إغلاق طلب التنبيه">${icon('x')}</button></div><form id="careRequestForm" class="care-dialog-body"><p id="careRequestDescription"></p><div class="care-form-stack"><label>الخدمة أو العرض<select id="careRequestItem"></select></label><label id="careExpiryLabel" hidden>تاريخ انتهاء الاشتراك<input id="careExpiry" type="date"></label><label>رقم واتساب (اختياري للتذكير بالتجديد)<input id="careRequestPhone" type="tel" dir="ltr" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="010xxxxxxxx"></label><label class="care-check"><input id="careRequestConsent" type="checkbox"><span>أوافق أن يتواصل كينو معي على الرقم ده بخصوص هذا التنبيه فقط.</span></label><p class="care-muted" id="careRequestHint"></p><p id="careRequestStatus" role="status" aria-live="polite"></p><button id="careRequestSubmit" type="submit" class="button button-yellow">حفظ التنبيه</button></div></form></dialog>`);
    $('customerHub').addEventListener('close',()=>{trackGeneration++;trackingUnsubscribe?.();trackingUnsubscribe=null;});
    $('careRequestForm').addEventListener('submit',submitRequest);
    $('careTrackingForm').addEventListener('submit',e=>{e.preventDefault();track($('careTrackingInput').value);});
    $('openCustomerHub').addEventListener('click',()=>openHub());
    $('navCustomerHub').addEventListener('click',e=>{e.preventDefault();openHub();});
    $('refreshCareAdmin').addEventListener('click',renderAdmin);
    document.addEventListener('click',handleClick);
    $('customerHub').querySelector('[role="tablist"]').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll('[role="tab"]')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowLeft'?1:2))%3;setHubTab(buttons[next].dataset.careTab);buttons[next].focus();});
    root.addEventListener('hashchange',readTrackLink);
    hydrate();updateCount();
  }
  function setHubTab(tab) {
    hubTab=tab;
    const names={orders:'Orders',tracking:'Tracking',alerts:'Alerts'};
    Object.entries(names).forEach(([key,name])=>{$('care'+name+'Panel').hidden=key!==tab;const btn=$('care'+name+'Tab');btn.setAttribute('aria-selected',String(key===tab));btn.tabIndex=key===tab?0:-1;});
    if(tab!=='tracking'){trackGeneration++;trackingUnsubscribe?.();trackingUnsubscribe=null;}
    if(tab==='orders')renderOrders();if(tab==='alerts')renderAlerts();
  }
  function openHub(tab='orders') { if(!$('customerHub').open)$('customerHub').showModal();setHubTab(tab); }
  function empty(title, text, name='shopping-bag') {return `<div class="care-empty">${icon(name)}<h3>${title}</h3><p>${text}</p></div>`;}
  function date(ms) { return ms ? new Date(ms).toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'}) : 'لم يحدد بعد'; }
  function card(order) {
    const content=(order.items||[]).map(it=>`<div class="care-order-item"><div><strong>${esc(it.serviceName)}</strong><small>${esc(it.planLabel)}${it.quantity>1?' × '+it.quantity:''}</small></div><span><bdi>${Number(it.price*it.quantity).toLocaleString('ar-EG')}</bdi> ج.م</span></div>`).join('');
    return `<article class="care-order-card"><header><bdi>${esc(order.id)}</bdi><span class="care-status ${order.status==='delivered'?'is-done':''}">${esc(labels[order.status]||'بانتظار التحديث')}</span></header><small class="care-muted">${date(order.timestamp)}</small>${content}<div class="care-order-actions"><button type="button" class="button button-outline small" data-care-track="${esc(order.id)}">${icon('map-pin')} متابعة</button><button type="button" class="button button-yellow small" data-care-repeat="${esc(order.id)}">${icon('rotate-ccw')} اطلبه تاني</button>${order.status==='delivered'?`<button type="button" class="button button-outline small" data-care-renew="${esc(order.id)}">${icon('bell')} تذكير التجديد</button>`:''}${order.trackingToken?`<button type="button" class="button button-outline small" data-care-copy="${esc(order.id)}">${icon('copy')} رابط المتابعة</button>`:''}</div></article>`;
  }
  async function renderOrders() {
    const list=read('orders',[]);
    $('careOrdersList').innerHTML=list.length?list.map(card).join(''):empty('أول طلب ليك يبدأ من هنا','اختار خدمتك من المتجر، وبعد تجهيز الطلب هتلاقيه هنا.');hydrate();
  }
  function getSaved(id) { return read('orders',[]).find(o=>o.id===id); }
  function parseToken(value) {
    if(/^[a-f0-9]{48}$/.test(value))return value;
    try { const url=new URL(value,location.origin); if(url.origin!==location.origin)return '';return /^#track\/([a-f0-9]{48})$/.exec(url.hash)?.[1]||''; }catch(_){return '';}
  }
  let trackGeneration=0;
  async function track(value) {
    const generation=++trackGeneration;trackingUnsubscribe?.();trackingUnsubscribe=null;
    const claim=parseToken(value);if(!claim){$('careTrackingResult').innerHTML='';$('careTrackingStatus').textContent='الصق رابط المتابعة الصحيح من رسالة طلبك.';return;}
    $('careTrackingResult').innerHTML='';$('careTrackingStatus').textContent='جاري التحقق من آخر تحديث…';
    try {
      const order=await deadline(root.KenoFirebase.getTracking(claim));if(generation!==trackGeneration)return;
      if(!order)throw new Error('لم نجد هذا الطلب. تأكد من الرابط أو تواصل مع كينو.');
      const full={...order,trackingToken:claim,cloud:true};remember(full);renderTracking(full,true);$('careTrackingStatus').textContent='آخر حالة محفوظة لدى المتجر.';
      const unsubscribe=await root.KenoFirebase.subscribeTracking(claim, next=>{if(generation!==trackGeneration||hubTab!=='tracking')return;if(next){const updated={...next,trackingToken:claim,cloud:true};remember(updated);renderTracking(updated,true);}else{$('careTrackingResult').innerHTML='';$('careTrackingStatus').textContent='لم يعد الطلب متاحًا عبر هذا الرابط. تواصل مع كينو.';}},()=>{if(generation===trackGeneration)$('careTrackingStatus').textContent='توقفت التحديثات المباشرة. المعروض هو آخر تحديث وصل؛ يمكنك إعادة المحاولة.';});
      if(generation!==trackGeneration||!$('customerHub').open)unsubscribe?.();else trackingUnsubscribe=unsubscribe;
    } catch(error) {
      if(generation!==trackGeneration)return;
      const saved=read('orders',[]).find(o=>o.trackingToken===claim);
      if(saved){renderTracking(saved,false);$('careTrackingStatus').textContent='تعذر الوصول للسحابة. المعروض نسخة محفوظة على جهازك، وليست تأكيدًا للحالة الحالية.';}
      else {$('careTrackingStatus').textContent='تعذر تأكيد حالة الطلب. راجع الرابط والاتصال أو تواصل مع كينو.';}
    }
    hydrate();
  }
  function renderTracking(order, online) {
    const position=statuses.indexOf(order.status);
    $('careTrackingResult').innerHTML=`<div class="care-tracking-heading"><span class="care-kicker">${online?'متابعة الطلب':'نسخة محفوظة'}</span><h3>${esc(labels[order.status]||'بانتظار التحديث')}</h3><bdi>${esc(order.id)}</bdi></div>${order.status==='cancelled'?'<p class="care-note">تم إلغاء الطلب. تواصل مع المتجر لمعرفة التفاصيل.</p>':`<ol class="care-timeline">${statuses.map((status,index)=>`<li class="${index<=position?'is-reached':''} ${index===position?'is-current':''}" ${index===position?'aria-current="step"':''}><span>${index<position?'✓':index+1}</span><strong>${labels[status]}</strong></li>`).join('')}</ol>`}<div class="care-tracking-meta"><div><small>آخر تحديث</small><strong>${date(order.updatedAt)}</strong></div><div><small>موعد التنفيذ المتوقع</small><strong>${order.expectedAt?new Date(order.expectedAt).toLocaleString('ar-EG'):'يؤكده المتجر بعد مراجعة الطلب'}</strong></div></div>${card(order)}`;hydrate();
  }
  function readTrackLink() {
    const claim=/^#track\/([a-f0-9]{48})$/.exec(location.hash)?.[1];if(!claim){lastTrack='';return;}if(lastTrack===claim)return;
    lastTrack=claim;openHub('tracking');$('careTrackingInput').value=trackingLink({trackingToken:claim});track(claim);
  }
  function openRequest(kind, serviceId, planId, order) {
    requestTarget={kind,serviceId,planId,order};
    const service=current().services.find(s=>s.id===serviceId);
    $('careRequestTitle').textContent=kind==='renewal'?'اشتراكك يتجدد في معاده':'أول ما يتوفر، خليك عارف';
    $('careRequestDescription').textContent=kind==='renewal'?'حدد تاريخ انتهاء اشتراكك الفعلي. هنجهز تذكيرًا قبل الموعد بيومين.':service?.name||'تنبيه توفر الخدمة';
    $('careExpiryLabel').hidden=kind!=='renewal';$('careExpiry').required=kind==='renewal';$('careExpiry').min=new Date().toLocaleDateString('en-CA');$('careExpiry').value='';
    $('careRequestPhone').value='';$('careRequestConsent').checked=false;$('careRequestStatus').textContent='';
    $('careRequestHint').textContent=kind==='renewal'?'يمكنك إضافة التذكير إلى تقويمك. لو كتبت رقمك ووافقت، هيوصل طلب التذكير لفريق كينو أيضًا.':'رقمك يستخدم للتواصل عن العرض ده فقط. التنبيه هيظهر هنا أيضًا عند عودة العرض.';
    const items=kind==='renewal'?(order.items||[]).map((it,index)=>({id:String(index),label:it.serviceName+' — '+it.planLabel})):
      (planId?service.plans.filter(p=>p.id===planId):service.plans.filter(p=>!p.available||!root.KenoOrder.isAvailable(service))).map(p=>({id:p.id,label:p.label}));
    if(kind==='availability')items.unshift({id:'',label:'الخدمة — أي عرض متاح'});
    $('careRequestItem').innerHTML=items.map(i=>`<option value="${esc(i.id)}">${esc(i.label)}</option>`).join('');
    if(kind==='availability'&&planId)$('careRequestItem').value=planId;
    $('careRequestDialog').showModal();
  }
  async function submitRequest(e) {
    e.preventDefault();const target=requestTarget,button=$('careRequestSubmit');if(button.disabled||!target)return;
    const phone=root.KenoOrder.cleanWhatsAppNumber($('careRequestPhone').value),consent=$('careRequestConsent').checked;
    if((phone&&!root.KenoOrder.isValidWhatsAppNumber(phone))||(phone&&!consent)||(target.kind==='availability'&&(!phone||!consent))) {
      $('careRequestStatus').textContent=!phone?'اكتب رقم واتساب ووافق على التواصل بخصوص العرض.':!consent?'وافق على التواصل بهذا الرقم، أو امسح الرقم للتذكير على تقويمك فقط.':'راجع رقم واتساب.';return;
    }
    const itemIndex=Number($('careRequestItem').value),item=target.kind==='renewal'?target.order.items[itemIndex]:null;
    const expiresAt=target.kind==='renewal'?new Date($('careExpiry').value+'T12:00:00').getTime():0;
    if(target.kind==='renewal'&&(!Number.isFinite(expiresAt)||expiresAt<Date.now())){$('careRequestStatus').textContent='اختار تاريخ انتهاء صحيح من اليوم أو بعده.';return;}
    const record={id:token(),kind:target.kind,serviceId:item?.serviceId||target.serviceId,planId:item?.planId||$('careRequestItem').value,phone,consent,expiresAt,timestamp:Date.now(),status:'pending'};
    const duplicate=read('requests',[]).some(r=>r.status==='pending'&&r.kind===record.kind&&r.serviceId===record.serviceId&&r.planId===record.planId&&r.expiresAt===record.expiresAt);
    if(duplicate){$('careRequestStatus').textContent='التنبيه ده محفوظ بالفعل في تنبيهاتي.';return;}
    button.disabled=true;$('careRequestStatus').textContent='جاري حفظ التنبيه…';
    try {
      if(phone)await deadline(root.KenoFirebase.createCareRequest(record));
      const stored=write('requests',[record,...read('requests',[])].slice(0,100));
      if(!stored&&!phone)throw new Error('المتصفح لا يسمح بحفظ التنبيه. اسمح بالتخزين ثم حاول مرة أخرى.');
      $('careRequestDialog').close();if(target.kind==='renewal')downloadCalendar(record);openHub('alerts');
      message(phone?'وصل طلب التنبيه لكينو.':'تم حفظ التذكير وتجهيز ملف التقويم.');
    } catch(error){$('careRequestStatus').textContent='لم نتمكن من تأكيد حفظ التنبيه. '+error.message;}
    finally{button.disabled=false;}
  }
  function isAvailable(record) {const service=current()?.services.find(s=>s.id===record.serviceId);return root.KenoOrder.isAvailable(service)&&(!record.planId?(!service.plans.length||service.plans.some(p=>p.available)):service.plans.some(p=>p.id===record.planId&&p.available));}
  function renderAlerts() {
    const requests=read('requests',[]).filter(r=>r.status!=='cancelled');
    $('careAlertsList').innerHTML=requests.length?requests.map(r=>{
      const service=current()?.services.find(s=>s.id===r.serviceId),plan=service?.plans.find(p=>p.id===r.planId),ready=r.kind==='availability'&&isAvailable(r);
      return `<article class="care-order-card"><header><strong>${esc(service?.name||'خدمة سابقة')}</strong><span class="care-status ${ready?'is-done':''}">${r.kind==='renewal'?'تذكير تجديد':ready?'متاح الآن':'في انتظار التوفر'}</span></header><p>${esc(plan?.label||'أي عرض متاح')}</p>${r.kind==='renewal'?`<p class="care-muted">ينتهي ${date(r.expiresAt)} · التذكير ${date(r.expiresAt-2*86400000)}</p><button type="button" class="button button-outline small" data-care-calendar="${r.id}">${icon('calendar')} إضافة للتقويم</button>`:''}${service?.visible&&(ready||r.kind==='renewal')?`<button type="button" class="button button-yellow small" data-open-service="${esc(r.serviceId)}" ${r.planId?`data-plan="${esc(r.planId)}"`:''} data-care-open-alert>شوف العرض الحالي</button>`:''}<button type="button" class="button button-outline small" data-care-cancel-request="${r.id}">إلغاء التنبيه</button></article>`;
    }).join(''):empty('التنبيهات اللي تهمك بس','اطلب تنبيهًا لعرض غير متاح، أو جهز تذكير تجديد من طلب تم تسليمه.','bell');hydrate();
  }
  function calendar(record) {
    const fmt=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const clean=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const service=current()?.services.find(s=>s.id===record.serviceId),start=record.expiresAt,alarm=Math.max(Date.now()+60000,start-2*86400000);
    const body=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Keno Store//Renewals//AR\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:${record.id}@keno-store\r\nDTSTAMP:${fmt(Date.now())}\r\nDTSTART:${fmt(start)}\r\nDTEND:${fmt(start+1800000)}\r\nSUMMARY:${clean('تجديد '+(service?.name||'اشتراك كينو'))}\r\nDESCRIPTION:${clean('راجع سعر العرض الحالي وتواصل مع كينو لتأكيد التجديد.')}\r\nURL:${location.origin}${location.pathname}#service/${encodeURIComponent(record.serviceId)}\r\nBEGIN:VALARM\r\nTRIGGER;VALUE=DATE-TIME:${fmt(alarm)}\r\nACTION:DISPLAY\r\nDESCRIPTION:موعد تجديد اشتراك كينو\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    // RFC 5545 folds lines at 75 UTF-8 octets, including continuation whitespace.
    return body.split('\r\n').map(line=>{let output='',bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>73){output+='\r\n ';bytes=1;}output+=char;bytes+=size;}return output;}).join('\r\n');
  }
  function downloadCalendar(record) {const url=URL.createObjectURL(new Blob([calendar(record)],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='keno-renewal.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function handleClick(e) {
    const button=e.target.closest('button,[data-care-open-alert]');if(!button)return;
    if(button.dataset.careClose){$(button.dataset.careClose).close();return;}
    if(button.dataset.careTab){setHubTab(button.dataset.careTab);return;}
    if(button.hasAttribute('data-care-notify-service')){openRequest('availability',button.dataset.careNotifyService);return;}
    if(button.hasAttribute('data-care-open-alert')){$('customerHub').close();return;}
    for(const action of ['track','repeat','copy','renew']) {
      const id=button.dataset['care'+action[0].toUpperCase()+action.slice(1)];if(!id)continue;const saved=getSaved(id);if(!saved)return;
      if(action==='track'){openHub('tracking');if(saved.trackingToken){$('careTrackingInput').value=trackingLink(saved);track(saved.trackingToken);}else{$('careTrackingStatus').textContent='الطلب قديم. تواصل مع المتجر للحصول على رابط متابعة.';}}
      if(action==='copy'){const ok=await root.KenoOrder.copyToClipboard(trackingLink(saved));message(ok?'تم نسخ رابط المتابعة الخاص بك.':'تعذر النسخ. افتح متابعة الطلب وانسخ الرابط.');}
      if(action==='renew')openRequest('renewal',saved.items[0]?.serviceId,'',saved);
      if(action==='repeat'){const local=await root.KenoOrderStore.getOrder(saved.id);$('customerHub').close();if(root.repeatKenoOrder(local||saved))event('reorder',saved.items[0]?.serviceId||'');}
      return;
    }
    if(button.dataset.careCalendar){const r=read('requests',[]).find(r=>r.id===button.dataset.careCalendar);if(r)downloadCalendar(r);return;}
    if(button.dataset.careCancelRequest){const requests=read('requests',[]),r=requests.find(r=>r.id===button.dataset.careCancelRequest);if(!r)return;button.disabled=true;try{if(r.phone)await deadline(root.KenoFirebase.cancelCareRequest(r.id));r.status='cancelled';write('requests',requests);renderAlerts();message(r.kind==='renewal'?'تم إلغاء التنبيه. لو أضفت التذكير لتقويمك، احذفه من التقويم أيضًا.':'تم إلغاء تنبيه التوفر.');}catch(_){message('لم يتأكد إلغاء التنبيه. حاول مرة أخرى.');button.disabled=false;}return;}
    if(button.dataset.careContact){contactRequest(button.dataset.careContact);return;}
    if(button.dataset.careDismiss){button.disabled=true;try{await root.KenoFirebase.closeCareRequest(button.dataset.careDismiss);await renderAdmin();}catch(_){message('تعذر حفظ حالة التنبيه.');button.disabled=false;}}
  }
  let adminRequests=[];
  function renderOrderAdmin(order) {
    if(!$('careOrderSchedule')){
      const panel=document.createElement('section');panel.id='careOrderSchedule';panel.className='care-panel';
      $('orderModalItemsBody').closest('.panel').before(panel);
    }
    const local=order.expectedAt?new Date(order.expectedAt-new Date(order.expectedAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
    $('careOrderSchedule').innerHTML=`<h3>موعد التنفيذ ورابط المتابعة</h3><div class="care-order-schedule"><label>موعد التنفيذ المتوقع<input id="careExpectedAt" type="datetime-local" value="${local}"></label><button type="button" class="button button-outline small" id="careSaveSchedule">حفظ الموعد</button><button type="button" class="button button-yellow small" id="careCopyAdminTracking">نسخ رابط العميل</button></div><p id="careScheduleStatus" role="status">الرابط يعرض حالة الطلب والخدمات فقط، بدون بيانات العميل أو إيصال الدفع.</p>`;
    const save=async copy=>{
      const input=$('careExpectedAt').value,expectedAt=input?new Date(input).getTime():0;
      $('careSaveSchedule').disabled=true;$('careCopyAdminTracking').disabled=true;
      try {
        if(!order.trackingToken||order.expectedAt!==expectedAt)order=await deadline(root.KenoFirebase.saveTrackingSchedule(order.id,expectedAt));
        if(copy){const ok=await root.KenoOrder.copyToClipboard(trackingLink(order));$('careScheduleStatus').textContent=ok?'تم نسخ الرابط الخاص بالعميل.':'تعذر النسخ. حاول مرة أخرى.';}
        else $('careScheduleStatus').textContent='تم حفظ موعد التنفيذ وتحديث صفحة العميل.';
      }catch(_) {$('careScheduleStatus').textContent='لم يتأكد حفظ التغيير. راجع الاتصال والصلاحيات وحاول مرة أخرى.';}
      finally{$('careSaveSchedule').disabled=false;$('careCopyAdminTracking').disabled=false;}
    };
    $('careSaveSchedule').onclick=()=>save(false);$('careCopyAdminTracking').onclick=()=>save(true);
  }
  async function contactRequest(id) {
    let request;
    try {request=await deadline(root.KenoFirebase.getCareRequest(id));}catch(_){message('تعذر التحقق من موافقة العميل الآن. حدّث البيانات وحاول مرة أخرى.');return;}
    if(!request?.consent||request.status!=='pending'){message('التنبيه اتلغى أو انتهت متابعته. حدّث البيانات قبل التواصل.');return;}
    const service=current().services.find(s=>s.id===request.serviceId),plan=service?.plans.find(p=>p.id===request.planId);
    const text=request.kind==='availability'?`مرحبًا، طلبت تنبيهًا عند توفر ${service?.name||'الخدمة'}${plan?' — '+plan.label:''}. العرض متاح الآن، راجع السعر الحالي قبل تأكيد الطلب: ${location.origin}${location.pathname}#service/${request.serviceId}`:`مرحبًا، ده تذكير التجديد اللي طلبته لاشتراك ${service?.name||'كينو'}، تاريخ الانتهاء ${date(request.expiresAt)}. تواصل معنا لتأكيد العرض والسعر الحالي.`;
    root.KenoOrder.openWhatsApp(root.KenoOrder.formatWhatsAppUrl(request.phone,text));
  }
  async function renderAdmin() {
    if(adminBusy)return;adminBusy=true;$('refreshCareAdmin').disabled=true;$('careAdminStatus').textContent='جاري تحميل الإحصائيات والتنبيهات…';
    try {
      const result=await deadline(root.KenoFirebase.getCareDashboard());adminRequests=result.requests;
      const events=result.events,counts=name=>events.filter(e=>e.name===name).length;
      const orders=result.orders,delivered=orders.filter(o=>o.status==='delivered');
      const values=[['فتح خدمة',counts('service_view')],['بيانات الطلب',events.filter(e=>e.name==='checkout_step'&&e.step==='2').length],['مراجعة الطلب',events.filter(e=>e.name==='checkout_step'&&e.step==='3').length],['فتح واتساب',counts('whatsapp_open')],['طلبات مسلّمة',delivered.length]];
      $('careAnalytics').innerHTML=values.map(([label,value],index)=>`<article class="care-metric"><span class="care-metric-number">0${index+1}</span><strong>${value.toLocaleString('ar-EG')}</strong><span>${label}</span></article>`).join('');
      const grouped=new Map();events.filter(e=>e.name==='service_view').forEach(e=>grouped.set(e.serviceId,(grouped.get(e.serviceId)||0)+1));
      $('carePopular').innerHTML=`<div class="care-panel"><h3>الخدمات الأكثر فتحًا</h3>${[...grouped.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,n])=>`<div class="care-popular-row"><span>${esc(current().services.find(s=>s.id===id)?.name||id)}</span><meter min="0" max="${Math.max(...grouped.values())}" value="${n}">${n}</meter><b>${n}</b></div>`).join('')||'<p class="care-muted">تظهر هنا بعد وصول زيارات جديدة.</p>'}</div>`;
      const row=r=>`<article class="care-queue-row"><strong>${esc(current().services.find(s=>s.id===r.serviceId)?.name||r.serviceId)}</strong><small>${esc(current().services.find(s=>s.id===r.serviceId)?.plans.find(p=>p.id===r.planId)?.label||'أي عرض متاح')} · ${r.kind==='renewal'?date(r.expiresAt):isAvailable(r)?'متاح الآن':'بانتظار التوفر'}</small><bdi>${esc(r.phone)}</bdi><div><button type="button" class="button button-outline small" data-care-contact="${r.id}" ${r.kind==='availability'&&!isAvailable(r)?'disabled':''}>فتح رسالة واتساب</button><button type="button" class="button button-outline small" data-care-dismiss="${r.id}">إنهاء المتابعة</button></div></article>`;
      const wait=result.requests.filter(r=>r.kind==='availability'&&r.status==='pending').sort((a,b)=>Number(isAvailable(b))-Number(isAvailable(a))),renew=result.requests.filter(r=>r.kind==='renewal'&&r.status==='pending').sort((a,b)=>a.expiresAt-b.expiresAt);
      $('careWaitlist').innerHTML=wait.map(row).join('')||'<p class="care-muted">لا توجد طلبات تنبيه مفتوحة.</p>';
      $('careRenewals').innerHTML=renew.map(row).join('')||'<p class="care-muted">لا توجد تذكيرات تجديد مفتوحة.</p>';
      $('careAdminStatus').textContent='آخر 30 يومًا: حتى 1000 حدث و500 طلب و200 تنبيه. الأرقام لكل مرحلة مستقلة؛ فتح واتساب لا يثبت البيع. أحداث التصفح تُحسب مرة لكل خدمة وخطوة في الزيارة، بدون بيانات العميل.';
    } catch(_) {
      $('careAdminStatus').textContent='تعذر تحميل بيانات المتجر من السحابة. لم يتم عرض أرقام محلية باعتبارها زيارات جميع العملاء.';
      for(const id of ['careAnalytics','carePopular','careWaitlist','careRenewals'])$(id).innerHTML='';
    } finally {adminBusy=false;$('refreshCareAdmin').disabled=false;}
  }
  root.KenoCare={refresh,openService,loadPlanEditor,readPlanEditor,prepareOrder,trackingLink,projection,remember,whatsappOpened,event,renderAdmin,renderOrderAdmin,calendar,parseToken};
  buildDialogs();root.addEventListener('DOMContentLoaded',readTrackLink);
})(window);
