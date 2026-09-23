/* Service-specific fulfillment UI. No category-based credential inference. */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = ['اختار الباقة', 'اكتب بيانات الشحن', 'راجع وافتح واتساب'];
  let active, step = 1, audio, onChange, allPlans = false;
  const fallback = { title:'بيانات الحساب / الشحن', description:'وضّح المطلوب وسنتفق على التنفيذ عبر واتساب.', securityNote:'لا ترسل بيانات بطاقتك البنكية أو رموز التحقق.', fields:[], audio:[] };
  function config(service) { return service?.fulfillment || fallback; }
  function renderFields(container, service, values = {}, prefix = 'fulfill') {
    const f = config(service);
    container.innerHTML = `<p>${esc(f.description)}</p>` + f.fields.map(field => {
      if (field.type === 'password') return `<div class="fulfillment-field"><strong>🔒 ${esc(field.label)}</strong><p>${esc(field.hint || 'تحتاج هذه الخدمة بيانات دخول. اتفق مع المتجر على طريقة التنفيذ وإرسالها في المحادثة؛ لا تُدخل كلمة المرور داخل الموقع.')}</p></div>`;
      const id = `${prefix}-${field.id}`, value = values[field.id] || '';
      const attrs = `id="${esc(id)}" data-fulfillment-field="${esc(field.id)}" data-kind="${esc(field.type)}" maxlength="800" ${field.required ? 'required' : ''} placeholder="${esc(field.placeholder)}" aria-describedby="${esc(id)}-hint"`;
      return `<div class="fulfillment-field"><label for="${esc(id)}">${esc(field.label)} ${field.required ? '<span aria-label="مطلوب">*</span>' : '(اختياري)'}</label>
        ${field.type === 'textarea' ? `<textarea ${attrs} rows="3">${esc(value)}</textarea>` : `<input ${attrs} type="${['email','url','tel','password'].includes(field.type) ? field.type : 'text'}" value="${esc(value)}" dir="auto" autocomplete="${field.type === 'password' ? 'new-password' : 'off'}">`}
        <small id="${esc(id)}-hint">${esc(field.hint)}</small>
        ${field.helpImage ? `<details class="field-help"><summary>🖼 أجيبه منين؟</summary><img src="${esc(field.helpImage)}" alt="${esc(field.helpAlt || field.hint || field.label)}" loading="lazy"><p>${esc(field.helpAlt)}</p></details>` : ''}</div>`;
    }).join('') + `<p class="fulfillment-security">🔒 ${esc(f.securityNote)}</p>`;
  }
  function values(container, includeSecrets = true) {
    return Object.fromEntries([...container.querySelectorAll('[data-fulfillment-field]')].filter(el => includeSecrets || el.dataset.kind !== 'password').map(el => [el.dataset.fulfillmentField, el.value.trim()]));
  }
  function validate(container) {
    for (const el of container.querySelectorAll('[data-fulfillment-field]')) {
      if (el.required && !el.value.trim()) el.setCustomValidity('اكتب البيانات المطلوبة.');
      else if (el.type === 'url' && el.value && !/^https?:\/\//i.test(el.value)) el.setCustomValidity('اكتب رابطًا يبدأ بـ https://');
      else el.setCustomValidity('');
      if (!el.reportValidity()) return false;
    }
    return true;
  }
  function format(service, data, mask = false) {
    return config(service).fields.filter(f => data?.[f.id]).map(f => `${f.label}: ${f.type === 'password' ? (mask ? '•••••• (تُرسل في المحادثة بعد الاتفاق)' : 'سيتم الاتفاق على إرسالها في المحادثة') : data[f.id]}`).join('\n');
  }
  function entries(service, data) {
    // Credentials are intentionally excluded from browser storage and WhatsApp URLs.
    return config(service).fields.filter(f => f.type !== 'password' && data?.[f.id]).map(f => ({id:f.id,label:f.label,value:data[f.id]}));
  }
  function stopAudio() { if (audio) { audio.pause(); audio = null; } }
  function audioButton(button, url) {
    button.disabled = !url;
    button.title = url ? 'تشغيل تسجيل الخطوة' : 'لم يضف المتجر تسجيلًا لهذه الخطوة بعد';
    button.onclick = async () => {
      stopAudio(); audio = new Audio(url);
      try { await audio.play(); } catch (_) { root.alert('تعذر تشغيل التسجيل. يمكنك متابعة النص أو طلب المساعدة على واتساب.'); }
    };
  }
  function setStep(next) {
    step = Math.max(1, Math.min(3, next)); stopAudio();
    ['planSelectionSection','accountInfoSection','paymentSelectionSection'].forEach((id,i) => { $(id).hidden = i !== step-1; });
    $('serviceDialog').querySelector('.checkout-summary-section').hidden = step !== 3;
    $('orderButton').hidden = step !== 3;
    $('copyOrderButton').hidden = step !== 3;
    $('serviceNext').hidden = step === 3;
    $('servicePrev').hidden = step === 1;
    $('serviceStepLabel').textContent = `${step} / 3 — ${labels[step-1]}`;
    $('addToCartBtn').hidden = step !== 3 || active?.available === false;
    $('serviceReview').textContent = format(active, values($('fulfillmentFields')), true) || 'لا توجد بيانات إضافية مطلوبة.';
    $('reviewConfirmed').checked = false;
    audioButton($('serviceListen'), config(active).audio?.[step-1] || root.KenoCheckout.settings?.stepAudio?.[step-1]);
    $('serviceDialog').querySelector('.checkout-scroll-body').scrollTop = 0;
    $('serviceStepLabel').focus({preventScroll:true});
  }
  function nextStep() {
    if (step === 1 && active.plans.length && !$('planGroups').querySelector('input:checked:not(:disabled)')) return;
    if (step === 1 && !active.plans.length && !$('quoteDetails').value.trim()) { $('quoteDetails').focus(); return; }
    if (step === 2 && !validate($('fulfillmentFields'))) return;
    setStep(step+1);
  }
  function filterPlans() {
    const input = $('planBudget'), budget = input.value.trim() ? Number(input.value) : Infinity;
    const configured = config(active).featuredPlanIds || [];
    const selected = $('planGroups').querySelector('input:checked')?.value;
    const candidates = active.plans.filter(p => p.available);
    const picks = configured.length ? configured : [...candidates].sort((a,b)=>a.price-b.price).slice(0,4).map(p=>p.id);
    let count = 0;
    $('planGroups').querySelectorAll('.plan-option').forEach(el => {
      const p = active.plans.find(p=>p.id === el.dataset.planId);
      el.hidden = !p || p.price > budget || (!allPlans && budget === Infinity && !picks.includes(p.id) && p.id !== selected);
      if (!el.hidden) count++;
    });
    $('planGroups').querySelectorAll('.plan-group').forEach(el => { el.hidden = !el.querySelector('.plan-option:not([hidden])'); });
    $('planFilterStatus').textContent = count ? `${count} باقة بالسعر الموضح` : 'مفيش باقة بالميزانية دي. جرّب مبلغ أكبر أو ابعتلنا فويس.';
    $('allPlans').textContent = allPlans ? 'الباقات المختارة' : 'كل الباقات';
    const chosen = active.plans.find(p=>p.id === selected);
    $('budgetSelectionNotice').textContent = chosen && chosen.price > budget ? `الباقة المختارة سعرها ${chosen.price} جنيه وتتجاوز الميزانية. اختار باقة مناسبة أو عدّل الميزانية.` : '';
    $('serviceNext').disabled = Boolean(chosen && chosen.price > budget) || Boolean(active.plans.length && !chosen) || active.available === false || active.status === 'unavailable';
  }
  function open(service, settings, callback) {
    active = service; root.KenoCheckout.settings = settings; onChange = callback;
    const f = config(service);
    $('accountStepTitle').textContent = f.title;
    $('accountFieldDesc').textContent = f.description;
    renderFields($('fulfillmentFields'), service);
    $('fulfillmentFields').oninput = () => { $('reviewConfirmed').checked = false; onChange?.(); };
    $('planBudget').value = ''; allPlans = false; filterPlans(); setStep(1);
    $('serviceNext').onclick = nextStep;
    $('servicePrev').onclick = () => setStep(step-1);
    $('allPlans').onclick = () => { allPlans = !allPlans; filterPlans(); };
    $('planBudget').oninput = filterPlans;
    $('planGroups').onchange = filterPlans;
    $('serviceDialog').addEventListener('close', stopAudio, {once:true});
  }
  function ready() {
    if (active?.available === false || active?.status === 'unavailable') return false;
    if (!validate($('fulfillmentFields'))) { setStep(2); validate($('fulfillmentFields')); return false; }
    if (step !== 3 || !$('reviewConfirmed').checked) { setStep(3); $('reviewConfirmed').focus(); return false; }
    return true;
  }

  // The same editor drives both newly created and existing services.
  function fieldRow(field = {}) {
    const el = document.createElement('fieldset'); el.className = 'fulfillment-editor-row';
    const text = (name,label,value) => `<label>${label}<input data-prop="${name}" value="${esc(value)}" maxlength="${name === 'helpImage' ? 160000 : 500}"></label>`;
    el.innerHTML = `<legend>خانة بيانات</legend><div class="form-grid">${text('id','معرّف ثابت بالإنجليزية',field.id || 'field-'+Math.random().toString(36).slice(2,8))}${text('label','الاسم الظاهر للعميل',field.label || '')}
      <label>نوع البيانات<select data-prop="type">${Object.entries({text:'نص',id:'رقم لاعب / ID',email:'بريد إلكتروني',url:'رابط',tel:'هاتف',textarea:'تفاصيل متعددة الأسطر',password:'كلمة مرور — يتم الاتفاق عليها في المحادثة'}).map(([v,l])=>`<option value="${v}" ${field.type===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-prop="required" ${field.required?'checked':''}> خانة مطلوبة</label>
      ${text('placeholder','مثال داخل الخانة',field.placeholder)}${text('hint','شرح تحت الخانة',field.hint)}${text('helpImage','رابط صورة الشرح',field.helpImage)}${text('helpAlt','وصف الصورة والمثال للقارئ',field.helpAlt)}
      <label>رفع صورة شرح (حتى 100 كيلوبايت)<input type="file" accept="image/png,image/jpeg,image/webp" data-upload="image"></label></div>
      <button type="button" data-remove-field class="button button-outline small">حذف الخانة</button>`;
    el.querySelector('[data-remove-field]').onclick = () => { el.remove(); $('serviceForm').dispatchEvent(new Event('input',{bubbles:true})); };
    el.querySelector('[data-upload]').onchange = async event => {
      try { el.querySelector('[data-prop="helpImage"]').value = await readMedia(event.target.files[0], 'image'); $('serviceForm').dispatchEvent(new Event('input',{bubbles:true})); }
      catch(error) { root.alert(error.message); }
    };
    return el;
  }
  async function readMedia(file, kind) {
    if (!file) return '';
    const types = kind === 'image' ? ['image/png','image/jpeg','image/webp'] : ['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm'];
    if (!types.includes(file.type) || file.size > 100000) throw new Error('اختر ملفًا مدعومًا حجمه حتى 100 كيلوبايت، أو استخدم رابط HTTPS لملف أكبر.');
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('تعذر قراءة الملف'));reader.readAsDataURL(file);});
  }
  function mediaEditor(container, audioValues = []) {
    container.innerHTML = labels.map((l,i)=>`<label>تسجيل مصري: ${l}<input data-audio-index="${i}" value="${esc(audioValues[i] || '')}" placeholder="رابط HTTPS أو ارفع تسجيلًا قصيرًا"><input type="file" data-audio-upload="${i}" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm"><audio controls preload="none" ${audioValues[i] ? `src="${esc(audioValues[i])}"` : ''}></audio></label>`).join('');
    container.querySelectorAll('[data-audio-upload]').forEach(el=>{el.onchange=async()=>{try{const input=container.querySelector(`[data-audio-index="${el.dataset.audioUpload}"]`); input.value=await readMedia(el.files[0],'audio');input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){root.alert(e.message);}};});
    container.querySelectorAll('[data-audio-index]').forEach(el=>{el.oninput=()=>{el.parentElement.querySelector('audio').src=el.value;};});
  }
  function loadEditor(service) {
    const f = config(service);
    $('fulfillmentTitle').value = f.title; $('fulfillmentDescription').value = f.description; $('fulfillmentSecurity').value = f.securityNote;
    $('fulfillmentEditorFields').replaceChildren(...f.fields.map(fieldRow));
    $('addFulfillmentField').onclick = () => { $('fulfillmentEditorFields').append(fieldRow()); $('serviceForm').dispatchEvent(new Event('input',{bubbles:true})); };
    $('featuredPlanChoices').innerHTML = service.plans.map(p=>`<label><input type="checkbox" value="${esc(p.id)}" ${(f.featuredPlanIds||[]).includes(p.id)?'checked':''}>${esc(p.label)} — ${p.price} جنيه</label>`).join('');
    mediaEditor($('serviceAudioEditor'),f.audio);
  }
  function readEditor() {
    return {title:$('fulfillmentTitle').value,description:$('fulfillmentDescription').value,securityNote:$('fulfillmentSecurity').value,
      fields:[...$('fulfillmentEditorFields').children].map(el=>Object.fromEntries([...el.querySelectorAll('[data-prop]')].map(input=>[input.dataset.prop,input.type==='checkbox'?input.checked:input.value.trim()]))),
      featuredPlanIds:[...$('featuredPlanChoices').querySelectorAll('input:checked')].map(el=>el.value),
      audio:[...$('serviceAudioEditor').querySelectorAll('[data-audio-index]')].map(el=>el.value.trim())};
  }
  root.KenoCheckout = {config,renderFields,values,validate,format,entries,open,ready,loadEditor,readEditor,mediaEditor,readMedia,audioButton,stopAudio,filterPlans,get active(){return active;}};
})(window);
