/* Purchase-linked review submissions; public reviews never contain claim secrets. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id), key='keno.review.claims.v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog,loaded=false;
  function newToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  function claims(){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch(_){return [];}}
  function remember(order){try{const list=claims().filter(c=>c.id!==order.id);list.unshift({id:order.id,token:order.reviewToken,serviceIds:order.serviceIds});localStorage.setItem(key,JSON.stringify(list.slice(0,50)));}catch(_){} refreshClaims();}
  function refreshClaims(){if(!$('reviewClaim'))return;const list=claims();$('reviewClaim').innerHTML='<option value="">اختار طلبك أو استخدم رابط التقييم من المتجر</option>'+list.map(c=>`<option value="${esc(c.id)}">${esc(c.id)}</option>`).join('');}
  function show(rows){
    rows = rows.filter(r=>Number.isInteger(r.rating) && r.rating>=1 && r.rating<=5 && Number.isFinite(r.timestamp));
    $('testimonialsGrid').innerHTML=rows.length?rows.sort((a,b)=>b.timestamp-a.timestamp).map(r=>`<article class="testimonial-card"><div class="testimonial-header"><span aria-label="${r.rating} من 5">${'★'.repeat(r.rating)}</span><time datetime="${new Date(r.timestamp).toISOString()}">${new Date(r.timestamp).toLocaleDateString('ar-EG')}</time></div><p>${esc(r.comment)}</p><strong>${esc(r.name)}</strong><p>${esc(catalog.services.find(s=>s.id===r.serviceId)?.name||r.serviceName||'خدمة من المتجر')}</p></article>`).join(''):'<p>لا توجد تعليقات منشورة بعد. اشتريت خدمة؟ شاركنا تجربتك بعد تسليم الطلب.</p>';
  }
  function render(data){
    catalog=data;
    if(!$('reviewForm')){
      const form=document.createElement('form');form.id='reviewForm';form.className='review-form';
      form.innerHTML=`<h3>علّق على الخدمة اللي اشتريتها</h3><p>بعد تسليم طلبك، اختاره من هذا الجهاز أو اطلب رابط تقييم من المتجر. يظهر التعليق بعد المراجعة بدون تغيير رأيك أو عدد النجوم.</p><div class="form-grid"><label>طلب الشراء<select id="reviewClaim"></select></label><label>الخدمة<select id="reviewService" required></select></label><label>اسمك الظاهر<input id="reviewName" maxlength="80" required></label><label>التقييم<select id="reviewRating">${[5,4,3,2,1].map(i=>`<option value="${i}">${i} من 5</option>`).join('')}</select></label><label class="span-2">تعليقك<textarea id="reviewComment" maxlength="1500" required></textarea></label></div><button class="button button-red" type="submit">إرسال التعليق</button><p id="reviewStatus" role="status"></p>`;
      $('testimonials').append(form);refreshClaims();
      $('reviewClaim').onchange=()=>{
        const c=claims().find(c=>c.id===$('reviewClaim').value);
        const services=c?.serviceIds?.length?catalog.services.filter(s=>c.serviceIds.includes(s.id)):catalog.services;
        $('reviewService').innerHTML=services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      };
      form.onsubmit=async event=>{
        event.preventDefault();const claim=claims().find(c=>c.id===$('reviewClaim').value);
        if(!claim){$('reviewStatus').textContent='اختار طلبك أو اطلب رابط التقييم من المتجر.';return;}
        const button=form.querySelector('button[type="submit"]');button.disabled=true;
        try{
          await KenoFirebase.submitReview({orderId:claim.id,token:claim.token,serviceId:$('reviewService').value,name:$('reviewName').value.trim(),rating:Number($('reviewRating').value),comment:$('reviewComment').value.trim()});
          $('reviewStatus').textContent='وصل تعليقك للمراجعة. شكرًا لمشاركة تجربتك.';
        }catch(error){$('reviewStatus').textContent='تعذر إرسال التعليق. تأكد أن الطلب تم تسليمه وأنك لم تقيّم هذه الخدمة من نفس الطلب سابقًا. '+error.message;}
        finally{button.disabled=false;}
      };
      $('reviewClaim').onchange();
    }
    readLink();
    if(!loaded){loaded=true;show([]);KenoFirebase.listReviews().then(show).catch(()=>{$('reviewStatus').textContent='تعذر تحميل التعليقات من السحابة حاليًا.';loaded=false;});}
  }
  function readLink(){
    const match=location.hash.match(/^#review\/([A-Z0-9-]+)\/([a-f0-9]{48})$/);
    if(!match || !$('reviewForm'))return;
    remember({id:match[1],reviewToken:match[2],serviceIds:[]});$('reviewClaim').value=match[1];$('reviewClaim').onchange();
    $('testimonials').hidden=false;$('reviewForm').scrollIntoView();
  }
  async function admin(){
    if(!$('reviewAdmin')){
      const panel=document.createElement('section');panel.id='reviewAdmin';panel.className='panel';panel.innerHTML=`<h3>تعليقات المشترين</h3><p>تنشر التقييم كما كتبه العميل، بدون وسم توثيق تلقائي. رابط التقييم متاح للطلبات المسلمة فقط.</p><label>رقم طلب مكتمل<input id="reviewInviteOrder" placeholder="KENO-..."></label><label>للطلبيات القديمة فقط: اربط الخدمة المشتراة بعد مراجعة تفاصيل الطلب<select id="reviewLegacyService"><option value="">استخدام الخدمات المسجلة بالطلب</option>${(catalog?.services||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><button type="button" id="reviewInvite" class="button button-outline small">إنشاء / نسخ رابط التقييم</button><p id="reviewAdminStatus" role="status"></p><div id="reviewQueue"></div>`;$('adminOrders').append(panel);
      $('reviewInvite').onclick=async()=>{try{const order=await KenoFirebase.reviewInvite($('reviewInviteOrder').value.trim(),$('reviewLegacyService').value);const base=catalog?.settings.siteUrl||new URL('./',location.href).href;const url=base+'#review/'+order.id+'/'+order.reviewToken;await KenoOrder.copyToClipboard(url);$('reviewAdminStatus').textContent='رابط التقييم: '+url;}catch(e){$('reviewAdminStatus').textContent=e.message;}};
    }
    try{
      const rows=await KenoFirebase.listReviewSubmissions();
      $('reviewQueue').innerHTML=rows.length?rows.map(r=>`<article class="review-moderation"><strong>${esc(r.name)} — ${r.rating} / 5</strong><p>${esc(r.comment)}</p><small>${esc(r.orderId)} — ${esc(r.serviceId)} — ${new Date(r.timestamp).toLocaleDateString('ar-EG')}</small><div><button type="button" class="button button-outline small" data-publish-review="${esc(r.id)}">نشر التعليق</button><button type="button" class="button button-outline small" data-hide-review="${esc(r.id)}">إخفاء من الموقع</button></div></article>`).join(''):'<p>لا توجد تعليقات مرسلة.</p>';
      $('reviewQueue').onclick=async e=>{
        const button=e.target.closest('[data-publish-review],[data-hide-review]');if(!button)return;button.disabled=true;
        try{await KenoFirebase.moderateReview(button.dataset.publishReview||button.dataset.hideReview,Boolean(button.dataset.publishReview));$('reviewAdminStatus').textContent='تم تحديث ظهور التعليق.';loaded=false;render(catalog);}catch(err){$('reviewAdminStatus').textContent=err.message;}finally{button.disabled=false;}
      };
    }catch(e){$('reviewAdminStatus').textContent='التعليقات تحتاج اتصالًا بالسحابة وصلاحية إدارة، ونشر قواعد Firestore الجديدة.';}
  }
  addEventListener('hashchange',readLink);
  root.KenoReviews={newToken,remember,render,admin};
})(window);
