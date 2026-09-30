/* Purchase-linked reviews: public text never includes order identifiers or claim secrets. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id), key='keno.review.claims.v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog,loaded=false,loading=null,rows=[],visibleCount=6,lastLink='',submitting=false;
  const validId=id=>typeof id==='string'&&/^KENO-[A-Z0-9-]{1,60}$/.test(id);
  function normalizeClaims(value){
    if(!Array.isArray(value))return [];
    return value.filter(c=>c&&validId(c.id)&&/^[a-f0-9]{48}$/.test(c.token||'')).slice(0,50).map(c=>({id:c.id,token:c.token,serviceIds:Array.isArray(c.serviceIds)?[...new Set(c.serviceIds.filter(s=>typeof s==='string'&&s.length<=80))]:[],submittedServiceIds:Array.isArray(c.submittedServiceIds)?c.submittedServiceIds.filter(s=>typeof s==='string'):[]}));
  }
  function parseLink(value){
    if(typeof value!=='string')return null;
    const hash=value.slice(value.indexOf('#'));
    const match=hash.match(/^#review\/(KENO-[A-Z0-9-]{1,60})\/([a-f0-9]{48})(?:\/([^\s#?]+))?$/);
    if(!match)return null;
    try{return {id:match[1],token:match[2],serviceIds:match[3]?match[3].split(',').map(decodeURIComponent).filter(s=>s&&s.length<=80):[]};}catch(_){return null;}
  }
  function buildLink(base,order){
    const url=new URL(base,location.href);url.hash='';url.search='';
    url.hash='review/'+order.id+'/'+order.reviewToken+(order.serviceIds?.length?'/'+order.serviceIds.map(encodeURIComponent).join(','):'');
    return url.href;
  }
  function newToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  function claims(){try{return normalizeClaims(JSON.parse(localStorage.getItem(key)||'[]'));}catch(_){return [];}}
  function saveClaims(list){try{localStorage.setItem(key,JSON.stringify(list));}catch(_){}}
  function remember(order){
    const list=claims(),previous=list.find(c=>c.id===order.id&&c.token===order.reviewToken);
    const current=normalizeClaims([{id:order.id,token:order.reviewToken,serviceIds:order.serviceIds?.length?order.serviceIds:previous?.serviceIds||[],submittedServiceIds:previous?.submittedServiceIds||[]}])[0];
    if(!current)return;
    saveClaims([current,...list.filter(c=>c.id!==current.id)].slice(0,50));refreshClaims();
  }
  function selectedClaim(){return claims().find(c=>c.id===$('reviewClaim')?.value);}
  function status(message,kind='info'){$('reviewStatus').textContent=message;$('reviewStatus').dataset.kind=kind;}
  function refreshClaims(){
    if(!$('reviewClaim'))return;const selected=$('reviewClaim').value,list=claims();
    $('reviewClaim').innerHTML='<option value="">اختار رقم طلبك</option>'+list.map(c=>`<option value="${esc(c.id)}">${esc(c.id)}</option>`).join('');
    if(list.some(c=>c.id===selected))$('reviewClaim').value=selected;
    $('reviewNoOrders').hidden=Boolean(list.length);updateServices();
  }
  function updateServices(){
    if(!catalog||!$('reviewService'))return;
    const claim=selectedClaim(),selected=$('reviewService').value;
    const services=claim?catalog.services.filter(s=>(!claim.serviceIds.length||claim.serviceIds.includes(s.id))&&!claim.submittedServiceIds.includes(s.id)):[];
    $('reviewService').innerHTML='<option value="">'+(claim&&!services.length?'تم تقييم الخدمات المتاحة لهذا الطلب':'اختار الخدمة اللي استلمتها')+'</option>'+services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    if(services.some(s=>s.id===selected))$('reviewService').value=selected;
    else if(services.length===1)$('reviewService').value=services[0].id;
    $('reviewService').disabled=!claim||!services.length;
    $('reviewOrderHint').textContent=!claim?'اختار الطلب أولًا، وبعدها تظهر الخدمات المرتبطة به.':claim.serviceIds.length?'التقييم متاح بعد تسليم الطلب، مرة واحدة لكل خدمة.':'رابط قديم: اختار الخدمة الموجودة في طلبك. يتم التأكد من ارتباطها بالطلب عند الإرسال.';
    updateFormState();
  }
  function updateFormState(){
    const ready=Boolean(selectedClaim()&&$('reviewService').value),rating=Number($('reviewRating').value);
    $('reviewClaim').disabled=submitting;
    $('reviewService').disabled=submitting||!selectedClaim()||$('reviewService').options.length<=1;
    $('reviewLinkInput').disabled=submitting;$('reviewApplyLink').disabled=submitting;
    for(const id of ['reviewName','reviewRating','reviewComment'])$(id).disabled=!ready||submitting;
    for(const button of $('reviewStars').querySelectorAll('button')){button.disabled=!ready||submitting;button.setAttribute('aria-pressed',String(Number(button.dataset.rating)===rating));button.classList.toggle('filled',Number(button.dataset.rating)<=rating);}
    $('reviewSubmit').disabled=!ready||submitting;
    $('reviewSubmit').textContent=submitting?'جاري إرسال تقييمك…':'إرسال التقييم';
    $('reviewCommentCount').textContent=$('reviewComment').value.length+' / 1500';
  }
  function validRows(data){return (Array.isArray(data)?data:[]).filter(r=>r&&Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5&&Number.isFinite(r.timestamp)&&r.timestamp>0&&r.timestamp<=8640000000000000&&typeof r.comment==='string'&&typeof r.name==='string');}
  function show(){
    const filtered=rows.filter(r=>!$('reviewFilter').value||r.serviceId===$('reviewFilter').value).sort((a,b)=>b.timestamp-a.timestamp);
    $('reviewSummary').hidden=!rows.length;
    if(rows.length){$('reviewAverage').textContent=(rows.reduce((sum,r)=>sum+r.rating,0)/rows.length).toLocaleString('ar-EG',{maximumFractionDigits:1,minimumFractionDigits:1});$('reviewPublishedCount').textContent=rows.length.toLocaleString('ar-EG')+' تقييم منشور';}
    $('reviewControls').hidden=!rows.length;
    $('testimonialsGrid').innerHTML=filtered.length?filtered.slice(0,visibleCount).map(r=>{
      const service=catalog.services.find(s=>s.id===r.serviceId),date=new Date(r.timestamp);
      return `<article class="testimonial-card purchase-review-card"><div class="testimonial-header"><span class="purchase-review-stars" aria-label="${r.rating} من 5">${'★'.repeat(r.rating)}<span aria-hidden="true">${'☆'.repeat(5-r.rating)}</span></span><time datetime="${date.toISOString()}">${date.toLocaleDateString('ar-EG')}</time></div><p class="testimonial-comment">${esc(r.comment)}</p><div class="purchase-review-author"><span class="review-avatar" aria-hidden="true">${esc(Array.from(r.name.trim())[0]||'ك')}</span><div><strong>${esc(r.name)}</strong><small>${esc(service?.name||r.serviceName||'خدمة من المتجر')}</small></div></div></article>`;
    }).join(''):`<div class="review-empty"><span class="review-empty-icon" aria-hidden="true">☆</span><h3>${rows.length?'لا توجد تقييمات لهذه الخدمة بعد':'أول تجربة تستاهل تتحكي'}</h3><p>${rows.length?'اختار كل الخدمات لمشاهدة باقي تجارب العملاء.':'بعد استلام خدمتك، شاركنا رأيك. التقييمات المنشورة هتظهر هنا بتاريخها الحقيقي.'}</p></div>`;
    $('reviewLoadMore').hidden=filtered.length<=visibleCount;
  }
  function deadline(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('timeout'),{code:'review/timeout'})),12000);})]).finally(()=>clearTimeout(timer));}
  async function loadReviews(force=false){
    if(loading)return loading;if(loaded&&!force){show();return;}
    $('testimonialsGrid').setAttribute('aria-busy','true');$('reviewRefresh').disabled=true;$('reviewLoadMore').hidden=true;
    $('testimonialsGrid').innerHTML='<div class="review-empty" role="status"><span class="review-loading-dot" aria-hidden="true"></span><p>بنحمّل تجارب العملاء…</p></div>';
    loading=(async()=>{try{rows=validRows(await deadline(root.KenoFirebase.listReviews()));loaded=true;visibleCount=6;show();}
      catch(_){loaded=false;$('reviewSummary').hidden=true;$('reviewControls').hidden=true;$('testimonialsGrid').innerHTML='<div class="review-empty review-unavailable" role="status"><span class="review-empty-icon" aria-hidden="true">↻</span><h3>التعليقات غير متاحة مؤقتًا</h3><p>جرّب إعادة التحميل. بيانات تقييمك تفضل محفوظة أثناء المحاولة.</p><button type="button" class="button button-outline" id="reviewRetry">إعادة تحميل التعليقات</button></div>';$('reviewRetry').onclick=()=>loadReviews(true);}
      finally{$('testimonialsGrid').setAttribute('aria-busy','false');$('reviewRefresh').disabled=false;loading=null;}})();return loading;
  }
  function createUI(){
    const toolbar=document.createElement('div');toolbar.className='reviews-toolbar';
    toolbar.innerHTML='<div id="reviewSummary" class="review-summary" hidden><strong id="reviewAverage"></strong><span><span class="purchase-review-stars" aria-hidden="true">★</span> من ٥<small id="reviewPublishedCount"></small></span></div><div id="reviewControls" class="reviews-controls" hidden><label>تجارب خدمة محددة<select id="reviewFilter"><option value="">كل الخدمات</option></select></label><button type="button" id="reviewRefresh" class="button button-outline small" aria-label="تحديث التقييمات">↻ تحديث</button></div>';
    $('testimonialsGrid').before(toolbar);
    const more=document.createElement('button');more.id='reviewLoadMore';more.type='button';more.className='button button-outline review-load-more';more.textContent='عرض تقييمات أكتر';more.hidden=true;$('testimonialsGrid').after(more);more.onclick=()=>{visibleCount+=6;show();};
    $('reviewRefresh').onclick=()=>loadReviews(true);$('reviewFilter').onchange=()=>{visibleCount=6;show();};
    const form=document.createElement('form');form.id='reviewForm';form.className='review-form purchase-review-form';
    form.innerHTML=`<div class="review-form-heading"><span class="review-form-icon" aria-hidden="true">☆</span><div><span class="review-form-eyebrow">تجربتك تفرق</span><h3>قيّم الخدمة اللي استلمتها</h3><p>اختار الطلب والخدمة، واحكيلنا تجربتك. يظهر رأيك بعد المراجعة بنفس كلامك وعدد النجوم.</p></div></div><div class="review-order-step"><label for="reviewClaim">١. اختار طلب الشراء</label><select id="reviewClaim" required aria-describedby="reviewOrderHint"></select><p id="reviewOrderHint" class="field-hint"></p><p id="reviewNoOrders" class="review-no-orders">مفيش طلبات محفوظة على الجهاز ده. لو استلمت خدمتك، استخدم رابط التقييم من المتجر.</p><details class="review-link-entry"><summary>معاك رابط تقييم؟</summary><label for="reviewLinkInput">الصق رابط التقييم اللي وصلك</label><div><input id="reviewLinkInput" type="text" inputmode="url" autocomplete="off" spellcheck="false" dir="ltr" placeholder="https://keno-store.vercel.app/#review/…"><button type="button" id="reviewApplyLink" class="button button-outline small">استخدام الرابط</button></div></details></div><div class="form-grid"><label>٢. الخدمة اللي استلمتها<select id="reviewService" required></select></label><label>اسمك اللي هيظهر للناس<input id="reviewName" maxlength="80" required autocomplete="nickname" placeholder="اكتب اسمك"></label><div class="review-rating-field span-2"><label for="reviewRating">٣. تقييم تجربتك</label><div id="reviewStars" class="review-star-picker" role="group" aria-label="اختار التقييم من 1 إلى 5">${[1,2,3,4,5].map(i=>`<button type="button" data-rating="${i}" aria-label="${i} من 5" aria-pressed="false">★</button>`).join('')}</div><select id="reviewRating" required aria-label="عدد نجوم التقييم"><option value="">اختار عدد النجوم</option>${[5,4,3,2,1].map(i=>`<option value="${i}">${i} من 5</option>`).join('')}</select></div><label class="span-2">٤. احكيلنا تجربتك<textarea id="reviewComment" rows="4" maxlength="1500" required placeholder="إيه رأيك في الخدمة وطريقة تنفيذ الطلب؟" aria-describedby="reviewPrivacyHint reviewCommentCount"></textarea></label></div><div class="review-comment-meta"><p id="reviewPrivacyHint">اكتب رأيك بحرية، ومن غير أرقام حسابات أو بيانات خاصة.</p><span id="reviewCommentCount">0 / 1500</span></div><div class="review-submit-row"><p>تقييم واحد لكل خدمة في الطلب، بعد تسليمها.</p><button id="reviewSubmit" class="button button-red" type="submit">إرسال التقييم</button></div><p id="reviewStatus" class="review-status" role="status" aria-live="polite"></p>`;
    $('testimonials').append(form);
    $('reviewClaim').onchange=()=>{status('');updateServices();};$('reviewService').onchange=()=>{status('');updateFormState();};$('reviewRating').onchange=updateFormState;$('reviewComment').oninput=updateFormState;
    $('reviewStars').onclick=e=>{const button=e.target.closest('[data-rating]');if(!button||button.disabled)return;$('reviewRating').value=button.dataset.rating;updateFormState();};
    $('reviewApplyLink').onclick=()=>{const claim=parseLink($('reviewLinkInput').value.trim());if(!claim){status('الرابط مش صحيح. انسخ رابط التقييم كاملًا من رسالة المتجر.','error');return;}applyClaim(claim);$('reviewLinkInput').value='';$('reviewLinkInput').closest('details').open=false;status('تم اختيار الطلب من الرابط. اختار الخدمة واكتب تقييمك.');};
    form.onsubmit=submit;
  }
  async function submit(event){
    event.preventDefault();if(submitting)return;const claim=selectedClaim();
    if(!claim||!$('reviewService').value){status('اختار الطلب والخدمة اللي استلمتها أولًا.','error');return;}
    if(!catalog.services.some(s=>s.id===$('reviewService').value)||claim.serviceIds.length&&!claim.serviceIds.includes($('reviewService').value)){status('الخدمة مش مرتبطة بالطلب المختار.','error');return;}
    const review={orderId:claim.id,token:claim.token,serviceId:$('reviewService').value,name:$('reviewName').value.trim(),rating:Number($('reviewRating').value),comment:$('reviewComment').value.trim()};
    if(!review.name||!review.comment||!Number.isInteger(review.rating)||review.rating<1||review.rating>5){status('اكتب اسمك وتعليقك واختار عدد النجوم.','error');return;}
    submitting=true;status('جاري إرسال تقييمك…');updateFormState();
    try{await deadline(root.KenoFirebase.submitReview(review));const list=claims(),saved=list.find(c=>c.id===claim.id);if(saved){saved.submittedServiceIds.push(review.serviceId);saveClaims(list);}status('وصل تقييمك للمراجعة. شكرًا لمشاركة تجربتك!','success');$('reviewComment').value='';$('reviewRating').value='';updateServices();}
    catch(error){const message=String(error?.code||'');status(message==='review/timeout'?'الإرسال أخد وقت أطول من المتوقع، ولم نتمكن من تأكيد وصوله. كلامك ما زال محفوظًا هنا. تأكد من الاتصال، ويمكنك مراجعة المتجر لمعرفة حالة تقييمك.':/permission-denied|already-exists/.test(message)?'لم يُرسل التقييم. لازم الطلب يكون تم تسليمه، والخدمة تكون ضمنه، ولم يتم تقييمها من نفس الطلب قبل كده. لو محتاج مساعدة، اطلب رابط تقييم من المتجر.':'تعذر الإرسال الآن. تقييمك ما زال هنا؛ تأكد من اتصال الإنترنت وحاول مرة تانية.','error');}
    finally{submitting=false;updateFormState();}
  }
  function applyClaim(claim){remember({id:claim.id,reviewToken:claim.token,serviceIds:claim.serviceIds});$('reviewClaim').value=claim.id;updateServices();}
  function readLink(){const claim=parseLink(location.hash);if(!claim||!$('reviewForm')||lastLink===location.hash)return;lastLink=location.hash;applyClaim(claim);$('testimonials').hidden=false;$('reviewForm').scrollIntoView({block:'start'});}
  function render(data){
    catalog=data;if(!$('testimonialsGrid'))return;if(!$('reviewForm'))createUI();
    const selected=$('reviewFilter').value;$('reviewFilter').innerHTML='<option value="">كل الخدمات</option>'+catalog.services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');if(catalog.services.some(s=>s.id===selected))$('reviewFilter').value=selected;
    refreshClaims();readLink();if(loaded)show();else loadReviews();
  }
  async function admin(){
    if(!$('reviewAdmin')){
      const panel=document.createElement('section');panel.id='reviewAdmin';panel.className='panel review-admin-panel';panel.innerHTML=`<h3>تقييمات العملاء</h3><p>رابط التقييم يخص الخدمات المسجلة في طلب تم تسليمه. نشر التعليق يحافظ على رأي العميل وعدد النجوم والتاريخ.</p><div class="form-grid"><label>رقم طلب تم تسليمه<input id="reviewInviteOrder" placeholder="KENO-..." dir="ltr"></label><label>للطلبيات القديمة: الخدمة المشتراة<select id="reviewLegacyService"><option value="">استخدام الخدمات المسجلة بالطلب</option>${(catalog?.services||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div><button type="button" id="reviewInvite" class="button button-outline small">إنشاء ونسخ رابط التقييم</button><p id="reviewAdminStatus" role="status"></p><div id="reviewQueue"></div>`;$('adminOrders').append(panel);
      $('reviewInvite').onclick=async()=>{const button=$('reviewInvite');button.disabled=true;try{const order=await root.KenoFirebase.reviewInvite($('reviewInviteOrder').value.trim(),$('reviewLegacyService').value);const url=buildLink(catalog?.settings.siteUrl||new URL('./',location.href).href,order);await root.KenoOrder.copyToClipboard(url);$('reviewAdminStatus').textContent='تم نسخ الرابط. افتحه للتأكد، ثم أرسله لصاحب الطلب: '+url;}catch(e){$('reviewAdminStatus').textContent=e.message;}finally{button.disabled=false;}};
    }
    try{const submissions=await root.KenoFirebase.listReviewSubmissions();$('reviewQueue').innerHTML=submissions.length?submissions.map(r=>`<article class="review-moderation"><strong>${esc(r.name)} — ${r.rating} / 5</strong><p>${esc(r.comment)}</p><small>${esc(r.orderId)} — ${esc(catalog?.services.find(s=>s.id===r.serviceId)?.name||r.serviceId)} — ${new Date(r.timestamp).toLocaleDateString('ar-EG')}</small><div><button type="button" class="button button-outline small" data-publish-review="${esc(r.id)}">نشر التعليق</button><button type="button" class="button button-outline small" data-hide-review="${esc(r.id)}">إخفاء من الموقع</button></div></article>`).join(''):'<p class="field-hint">مفيش تقييمات مرسلة للمراجعة حاليًا.</p>';
      $('reviewQueue').onclick=async e=>{const button=e.target.closest('[data-publish-review],[data-hide-review]');if(!button)return;button.disabled=true;try{await root.KenoFirebase.moderateReview(button.dataset.publishReview||button.dataset.hideReview,Boolean(button.dataset.publishReview));$('reviewAdminStatus').textContent='تم تحديث ظهور التعليق.';loaded=false;await loadReviews(true);}catch(_){$('reviewAdminStatus').textContent='تعذر تحديث التعليق. تأكد من الاتصال وصلاحية الإدارة وحاول مرة تانية.';}finally{button.disabled=false;}};
    }catch(_){$('reviewAdminStatus').textContent='تعذر تحميل التقييمات المرسلة. تأكد من صلاحيات التقييمات في Firebase واتصال السحابة.';}
  }
  addEventListener('hashchange',readLink);
  root.KenoReviews={newToken,remember,render,admin,parseLink,buildLink,normalizeClaims,loadReviews};
})(window);
