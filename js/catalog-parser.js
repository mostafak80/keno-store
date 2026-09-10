/**
 * Keno Store — Catalog Validation, Parser & Serializer
 * Enforces schema integrity, phone auto-normalization, category management checks,
 * service keywords / aliases, InstaPay settings, promo badges, and strikethrough original prices.
 */
(function (root) {
  'use strict';

  const plainObject = x => x && typeof x === 'object' && !Array.isArray(x);

  function requireString(value, max, label, allowEmpty = false) {
    if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) {
      throw new Error(`قيمة غير صالحة في ${label}.`);
    }
    return value.trim();
  }

  function validId(id) {
    return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
  }

  /**
   * Normalizes Egyptian and international phone numbers.
   * Converts 010... -> 2010... and strips +, spaces, dashes.
   */
  function normalizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/[^\d]/g, '');
    if (/^01[0125]\d{8}$/.test(digits)) {
      digits = '2' + digits;
    }
    return digits;
  }

  const KenoCatalogParser = {
    /**
     * Validates and normalizes the entire catalog data object.
     * @param {Object} raw
     * @returns {Object} Validated catalog
     */
    validate(raw) {
      if (!plainObject(raw) || raw.schemaVersion !== 1 || !plainObject(raw.settings)) {
        throw new Error('ملف البيانات غير صالح أو لا يتبع بنية متجر كينو.');
      }

      const s = raw.settings;
      const currency = s.currency || 'EGP';
      if (currency !== 'EGP') {
        throw new Error('عملة المتجر يجب أن تكون EGP (جنيه مصري).');
      }

      // Phone normalization
      const whatsapp = normalizePhone(s.whatsapp);
      if (!/^[1-9][0-9]{7,14}$/.test(whatsapp)) {
        throw new Error('رقم واتساب غير صالح. يرجى إدخال الرقم بكود الدولة (مثال: 201012345678).');
      }

      const paymentPhone = String(s.paymentPhone || '').replace(/[^\d]/g, '');
      if (!/^01[0125][0-9]{8}$/.test(paymentPhone)) {
        throw new Error('رقم فودافون كاش غير صالح. يجب أن يكون رقمًا مصريًا يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقمًا.');
      }

      // Optional InstaPay address
      const instapay = typeof s.instapay === 'string' ? s.instapay.slice(0, 100).trim() : '';

      // Optional working hours
      const workingHours = typeof s.workingHours === 'string' ? s.workingHours.slice(0, 100).trim() : 'متاحون يوميًا من 10 ص حتى 2 ص';

      // Facebook validation
      let facebook = requireString(s.facebook || '', 500, 'رابط Facebook', true);
      if (facebook) {
        let u;
        try {
          u = new URL(facebook);
        } catch (_) {
          throw new Error('رابط صفحة Facebook غير صحيح.');
        }
        if (u.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'].includes(u.hostname.toLowerCase())) {
          throw new Error('رابط Facebook يجب أن يبدأ بـ https://facebook.com/.');
        }
      }

      // Instagram validation
      let instagram = requireString(s.instagram || '', 500, 'رابط Instagram', true);
      if (instagram) {
        let u;
        try {
          u = new URL(instagram);
        } catch (_) {
          throw new Error('رابط صفحة Instagram غير صحيح.');
        }
        if (u.protocol !== 'https:' || !['instagram.com', 'www.instagram.com', 'instagr.am'].includes(u.hostname.toLowerCase())) {
          throw new Error('رابط Instagram يجب أن يبدأ بـ https://instagram.com/.');
        }
      }

      // TikTok validation
      let tiktok = requireString(s.tiktok || '', 500, 'رابط TikTok', true);
      if (tiktok) {
        let u;
        try {
          u = new URL(tiktok);
        } catch (_) {
          throw new Error('رابط صفحة TikTok غير صحيح.');
        }
        if (u.protocol !== 'https:' || !['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'].includes(u.hostname.toLowerCase())) {
          throw new Error('رابط TikTok يجب أن يبدأ بـ https://tiktok.com/.');
        }
      }

      // Telegram validation
      let telegram = requireString(s.telegram || '', 500, 'رابط Telegram', true);
      if (telegram) {
        let u;
        try {
          u = new URL(telegram);
        } catch (_) {
          throw new Error('رابط قناة أو حساب Telegram غير صحيح.');
        }
        if (u.protocol !== 'https:' || !['t.me', 'telegram.me'].includes(u.hostname.toLowerCase())) {
          throw new Error('رابط Telegram يجب أن يبدأ بـ https://t.me/.');
        }
      }

      const facebookEnabled = typeof s.facebookEnabled === 'boolean' ? s.facebookEnabled : true;
      const instagramEnabled = typeof s.instagramEnabled === 'boolean' ? s.instagramEnabled : true;
      const tiktokEnabled = typeof s.tiktokEnabled === 'boolean' ? s.tiktokEnabled : true;
      const telegramEnabled = typeof s.telegramEnabled === 'boolean' ? s.telegramEnabled : true;

      const settings = {
        storeName: requireString(s.storeName, 80, 'اسم المتجر'),
        tagline: requireString(s.tagline, 140, 'الجملة التعريفية'),
        whatsapp,
        paymentPhone,
        instapay,
        workingHours,
        facebook,
        facebookEnabled,
        instagram,
        instagramEnabled,
        tiktok,
        tiktokEnabled,
        telegram,
        telegramEnabled,
        announcement: requireString(s.announcement, 180, 'الشريط الإعلاني العلوي'),
        currency: 'EGP'
      };

      // Validate Categories
      if (!Array.isArray(raw.categories) || raw.categories.length < 1 || raw.categories.length > 30) {
        throw new Error('يجب أن يحتوي المتجر على قسم واحد على الأقل، وبحد أقصى 30 قسمًا.');
      }

      const iconNames = root.KenoConfig?.ICON_NAMES || new Set();
      const colorNames = root.KenoConfig?.COLORS || new Set(['red', 'gold', 'blue', 'green', 'orange', 'dark']);

      const categoryIds = new Set();
      const categories = raw.categories.map(c => {
        if (!plainObject(c) || !validId(c.id) || categoryIds.has(c.id)) {
          throw new Error(`قسم غير صالح أو مكرر: ${c?.id || 'بدون معرّف'}`);
        }
        categoryIds.add(c.id);
        const icon = iconNames.has(c.icon) ? c.icon : 'globe';
        return {
          id: c.id,
          name: requireString(c.name, 80, 'اسم القسم'),
          icon
        };
      });

      // Validate Services
      if (!Array.isArray(raw.services) || raw.services.length > 500) {
        throw new Error('قائمة الخدمات غير صالحة أو تجاوزت الحد الأقصى (500 خدمة).');
      }

      let totalPlanCount = 0;
      const serviceIds = new Set();
      const services = raw.services.map(service => {
        if (!plainObject(service) || !validId(service.id) || serviceIds.has(service.id)) {
          throw new Error(`معرّف خدمة غير صالح أو مكرر: ${service?.id}`);
        }
        serviceIds.add(service.id);

        if (!categoryIds.has(service.category)) {
          throw new Error(`الخدمة "${service.name}" مرتبطة بقسم غير موجود (${service.category}).`);
        }

        const icon = iconNames.has(service.icon) ? service.icon : 'globe';
        const color = colorNames.has(service.color) ? service.color : 'red';

        if (typeof service.visible !== 'boolean' || typeof service.featured !== 'boolean') {
          throw new Error(`حالة الظهور أو التمييز للخدمة "${service.name}" غير صالحة.`);
        }

        const notes = Array.isArray(service.notes)
          ? service.notes.slice(0, 30).map(n => requireString(n, 500, 'شروط الخدمة'))
          : [];

        // Validate Plans
        const plans = Array.isArray(service.plans) ? service.plans : [];
        if (plans.length > 300) {
          throw new Error(`عدد باقات الخدمة "${service.name}" كبير جدًا.`);
        }

        const planIds = new Set();
        const validPlans = plans.map(plan => {
          if (!plainObject(plan) || !validId(plan.id) || planIds.has(plan.id)) {
            throw new Error(`معرّف باقة غير صالح أو مكرر في خدمة "${service.name}".`);
          }
          planIds.add(plan.id);

          const price = Number(plan.price);
          if (!Number.isFinite(price) || price <= 0 || price > 10000000) {
            throw new Error(`سعر الباقة "${plan.label}" غير صالح (يجب أن يكون رقمًا أكبر من الصفر).`);
          }

          // Optional originalPrice for discount strikethrough
          let originalPrice = null;
          if (plan.originalPrice !== undefined && plan.originalPrice !== null && plan.originalPrice !== '') {
            const num = Number(plan.originalPrice);
            if (Number.isFinite(num) && num > price) {
              originalPrice = Math.round(num * 100) / 100;
            }
          }

          totalPlanCount++;
          return {
            id: plan.id,
            label: requireString(plan.label, 150, 'اسم الباقة'),
            price: Math.round(price * 100) / 100,
            originalPrice,
            group: requireString(plan.group || 'الباقات', 80, 'مجموعة الباقة'),
            note: requireString(plan.note || '', 500, 'ملاحظة الباقة', true),
            available: typeof plan.available === 'boolean' ? plan.available : true
          };
        });

        // Optional custom keywords / aliases for search
        const aliases = typeof service.aliases === 'string'
          ? service.aliases.slice(0, 400).trim()
          : '';

        // Optional promotional badge
        const badge = typeof service.badge === 'string'
          ? service.badge.slice(0, 50).trim()
          : '';

        // Safe Image handling
        const image = root.KenoImage
          ? root.KenoImage.sanitizeUrl(service.image)
          : (typeof service.image === 'string' ? service.image.trim() : '');

        return {
          id: service.id,
          name: requireString(service.name, 100, 'اسم الخدمة'),
          category: service.category,
          description: requireString(service.description, 500, 'وصف الخدمة'),
          mark: requireString(service.mark || 'KENO', 20, 'شعار البطاقة'),
          icon,
          color,
          image,
          aliases,
          badge,
          plans: validPlans,
          notes,
          featured: service.featured,
          visible: service.visible
        };
      });

      // Validate Payment Methods (Dynamic System)
      let rawPaymentMethods = raw.paymentMethods;
      if (!Array.isArray(rawPaymentMethods)) {
        // Backward-compatibility synthesis for catalogs or backups missing paymentMethods
        rawPaymentMethods = [
          {
            id: 'vodafone-cash',
            name: 'فودافون كاش',
            number: settings.paymentPhone || '01064806213',
            accountName: 'Keno Store',
            link: '',
            description: 'تحويل كاش إلى المحفظة مباشرة من أي محفظة إلكترونية.',
            icon: 'wallet-cards',
            enabled: true
          },
          {
            id: 'instapay',
            name: 'إنستاباي (InstaPay)',
            number: settings.instapay || 'kenostore@instapay',
            accountName: 'Keno Store',
            link: '',
            description: 'تحويل لحظي فوري لكافة البنوك المصرية والمحافظ الإلكترونية.',
            icon: 'credit-card',
            enabled: Boolean(settings.instapay)
          },
          {
            id: 'telda',
            name: 'تيلدا (Telda)',
            number: settings.paymentPhone || '01064806213',
            accountName: '@kenostore',
            link: 'https://telda.me/pay/kenostore',
            description: 'تحويل فوري وسريع عبر تطبيق تيلدا.',
            icon: 'smartphone',
            enabled: true
          }
        ];
      }

      if (rawPaymentMethods.length > 30) {
        throw new Error('قائمة طرق الدفع تجاوزت الحد الأقصى المسموح (30 وسيلة).');
      }

      const pmIds = new Set();
      const paymentMethods = rawPaymentMethods.map(pm => {
        if (!plainObject(pm) || !validId(pm.id) || pmIds.has(pm.id)) {
          throw new Error(`معرّف وسيلة دفع غير صالح أو مكرر: ${pm?.id || 'بدون معرّف'}`);
        }
        pmIds.add(pm.id);

        const icon = iconNames.has(pm.icon) ? pm.icon : 'wallet-cards';

        let link = requireString(pm.link || '', 500, 'رابط الدفع', true);
        if (link) {
          try {
            const u = new URL(link);
            if (!['http:', 'https:'].includes(u.protocol)) {
              throw new Error();
            }
          } catch (_) {
            throw new Error(`رابط الدفع غير صالح في وسيلة "${pm.name || pm.id}".`);
          }
        }

        return {
          id: pm.id,
          name: requireString(pm.name, 80, 'اسم وسيلة الدفع'),
          number: requireString(pm.number, 80, 'رقم أو معرّف الدفع'),
          accountName: requireString(pm.accountName || '', 80, 'اسم صاحب الحساب', true),
          link,
          description: requireString(pm.description || '', 300, 'وصف وسيلة الدفع', true),
          icon,
          enabled: typeof pm.enabled === 'boolean' ? pm.enabled : true
        };
      });

      // Bidirectional sync: keep settings.paymentPhone and settings.instapay in sync with primary methods
      const vodafoneMethod = paymentMethods.find(m => m.id === 'vodafone-cash' || m.id.includes('vodafone'));
      if (vodafoneMethod) {
        if (settings.paymentPhone && vodafoneMethod.number !== settings.paymentPhone) {
          vodafoneMethod.number = settings.paymentPhone;
        } else if (vodafoneMethod.number && /^01[0125][0-9]{8}$/.test(vodafoneMethod.number.replace(/[^\d]/g, ''))) {
          settings.paymentPhone = vodafoneMethod.number.replace(/[^\d]/g, '');
        }
      }
      const instapayMethod = paymentMethods.find(m => m.id === 'instapay' || m.id.includes('insta'));
      if (instapayMethod) {
        if (settings.instapay && instapayMethod.number !== settings.instapay) {
          instapayMethod.number = settings.instapay;
        } else if (instapayMethod.number) {
          settings.instapay = instapayMethod.number;
        }
      }

      const updatedAt = requireString(raw.updatedAt || new Date().toISOString(), 50, 'تاريخ التحديث');
      if (!Number.isFinite(Date.parse(updatedAt))) {
        throw new Error('تاريخ التحديث غير صالح.');
      }

      // Validate & Normalize Dynamic Featured Card
      let featuredCard = null;
      if (raw.featuredCard && plainObject(raw.featuredCard)) {
        const fc = raw.featuredCard;
        const icon = typeof fc.icon === 'string' && iconNames.has(fc.icon) ? fc.icon : 'gamepad-2';
        const allowedThemes = ['red', 'purple', 'blue', 'emerald', 'amber', 'dark'];
        const theme = typeof fc.theme === 'string' && allowedThemes.includes(fc.theme) ? fc.theme : 'red';

        featuredCard = {
          enabled: typeof fc.enabled === 'boolean' ? fc.enabled : true,
          badge: requireString(fc.badge || 'الأكثر طلبًا', 40, 'شارة البطاقة المميزة', true),
          icon,
          titleLine1: requireString(fc.titleLine1 || 'PLAY MORE', 60, 'السطر الأول للعنوان', true),
          titleLine2: requireString(fc.titleLine2 || 'WITH KENO.', 60, 'السطر الثاني للعنوان', true),
          description: requireString(fc.description || '', 250, 'وصف البطاقة المميزة', true),
          serviceId: typeof fc.serviceId === 'string' ? fc.serviceId.trim() : '',
          planId: typeof fc.planId === 'string' ? fc.planId.trim() : '',
          offerQuantity: requireString(fc.offerQuantity || '', 60, 'كمية أو مسمى العرض', true),
          offerPrice: requireString(fc.offerPrice || '', 60, 'سعر العرض المميز', true),
          buttonText: requireString(fc.buttonText || 'اكتشف الباقات', 60, 'نص زر الطلب', true),
          theme,
          tagline: requireString(fc.tagline || 'KENO / FEATURED', 40, 'العلامة السفلية للبطاقة', true)
        };
      } else {
        featuredCard = {
          enabled: true,
          badge: 'الأكثر طلبًا',
          icon: 'gamepad-2',
          titleLine1: 'PLAY MORE',
          titleLine2: 'WITH KENO.',
          description: 'شحن ببجي العالمية — شحن فوري وآمن بالـ ID',
          serviceId: 'pubg',
          planId: 'pubg-3',
          offerQuantity: '325 شدة',
          offerPrice: '270 جنيه',
          buttonText: 'شوف كل باقات ببجي',
          theme: 'red',
          tagline: 'KENO / FEATURED'
        };
      }

      const data = {
        schemaVersion: 1,
        updatedAt,
        settings,
        categories,
        paymentMethods,
        services,
        featuredCard
      };

      const maxBytes = root.KenoConfig?.MAX_BYTES || 800000;
      if (new TextEncoder().encode(JSON.stringify(data)).length > maxBytes) {
        throw new Error('حجم ملف البيانات الإجمالي كبير جدًا. يرجى تقليل حجم الصور المرفوعة أو عدد الباقات.');
      }

      return data;
    },

    /**
     * Parses raw catalog.js source code.
     * @param {string} source
     * @returns {Object} Validated catalog
     */
    parse(source) {
      if (typeof source !== 'string') {
        throw new Error('محتوى ملف البيانات غير صالح.');
      }
      const maxBytes = root.KenoConfig?.MAX_BYTES || 800000;
      if (new TextEncoder().encode(source).length > maxBytes) {
        throw new Error('ملف البيانات أكبر من الحد الأقصى المسموح.');
      }

      const match = source.trim().match(/^window\.KENO_CATALOG\s*=\s*([\s\S]+);$/);
      if (!match) {
        throw new Error('صيغة ملف catalog.js غير متوافقة مع متجر كينو.');
      }

      let raw;
      try {
        raw = JSON.parse(match[1]);
      } catch (_) {
        throw new Error('تعذّر تحليل بيانات JSON من ملف الأسعار.');
      }

      return this.validate(raw);
    },

    /**
     * Serializes catalog object to a clean JavaScript string for catalog.js.
     * @param {Object} data
     * @returns {string} File content
     */
    serialize(data) {
      const validated = this.validate(data);
      const jsonString = JSON.stringify(validated, null, 2)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

      return `window.KENO_CATALOG = ${jsonString};\n`;
    }
  };

  root.KenoCatalogParser = KenoCatalogParser;
})(typeof window !== 'undefined' ? window : this);
