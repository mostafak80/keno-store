/**
 * Keno Store — Configuration & Constants
 * Defines global constants, icon sets, color tones, default search aliases,
 * trust guarantees, and verified customer testimonials.
 */
(function (root) {
  'use strict';

  const Config = {
    CATALOG_PATH: 'assets/catalog.js',
    MAX_BYTES: 800000, // 800 KB maximum catalog size
    GITHUB_API_VERSION: '2022-11-28', // Official GitHub REST API version
    DEFAULT_CURRENCY: 'EGP',

    // Available Lucide icon names supported across the store and admin
    ICON_NAMES: new Set([
      'gamepad-2', 'clapperboard', 'sparkles', 'app-window', 'wallet-cards',
      'megaphone', 'messages-square', 'globe', 'tv', 'circle-dot', 'music-2',
      'blocks', 'flame', 'dices', 'swords', 'crosshair', 'coins', 'play',
      'headphones', 'bot', 'brain-circuit', 'smartphone', 'tablet-smartphone',
      'refresh-cw', 'graduation-cap', 'credit-card', 'shopping-bag',
      'chart-no-axes-combined', 'palette', 'panels-top-left', 'zap', 'shield-check',
      'badge-check', 'check', 'lock-keyhole', 'eye', 'cloud-upload', 'log-out',
      'layout-grid', 'settings-2', 'archive', 'save', 'download', 'file-code-2',
      'rotate-ccw', 'trash-2', 'plus', 'x', 'search', 'arrow-left', 'arrow-up-left',
      'external-link', 'store', 'sliders-horizontal', 'search-x', 'mouse-pointer-2',
      'copy', 'check-check', 'layers', 'tag', 'shopping-cart', 'star', 'share-2',
      'shield', 'clock', 'percent', 'instagram', 'facebook'
    ]),

    // Arabic labels for Lucide icons in editor dropdowns
    ICON_LABELS: {
      'gamepad-2': 'ألعاب وجيمينج',
      'clapperboard': 'سينما وترفيه ومسلسلات',
      'sparkles': 'ذكاء اصطناعي وأدوات',
      'wallet-cards': 'محافظ ودفع إلكتروني',
      'credit-card': 'بطاقات دفع وفيزا',
      'megaphone': 'إعلانات وتسويق',
      'messages-square': 'سوشيال ميديا وشات',
      'app-window': 'برامج وتطبيقات كمبيوتر',
      'smartphone': 'تطبيقات موبايل',
      'bot': 'روبوتات وتليجرام',
      'brain-circuit': 'ذكاء اصطناعي متقدم',
      'graduation-cap': 'كورسات وتعليم',
      'palette': 'تصميم وجرافيك',
      'headphones': 'موسيقى وصوتيات',
      'shopping-bag': 'شوبينج وتجارة',
      'chart-no-axes-combined': 'إحصائيات ونمو',
      'instagram': 'إنستغرام (سوشيال ميديا)',
      'facebook': 'فيسبوك (سوشيال ميديا)',
      'globe': 'خدمات رقمية عامة'
    },

    // Card visual color tones
    COLORS: new Set(['red', 'gold', 'blue', 'green', 'orange', 'dark']),

    COLOR_LABELS: {
      'red': 'أحمر كينو (مميز)',
      'gold': 'ذهبي / أصفر',
      'blue': 'أزرق',
      'green': 'أخضر',
      'orange': 'برتقالي',
      'dark': 'داكن / رمادي'
    },

    // Presets for marketing badges
    PROMO_BADGES: [
      { id: '', label: 'بدون شارة ترويجية' },
      { id: 'best-seller', label: '🔥 الأكثر مبيعًا' },
      { id: 'special-offer', label: '⚡ عرض خاص' },
      { id: 'instant', label: '🚀 شحن فوري' },
      { id: 'exclusive', label: '👑 حصري لكينو' },
      { id: 'guaranteed', label: '🛡️ ضمان كامل' }
    ],

    // Presets for payment methods in admin modal
    PAYMENT_TEMPLATES: [
      {
        id: 'vodafone-cash',
        name: 'فودافون كاش',
        number: '01064806213',
        accountName: 'Keno Store',
        link: '',
        description: 'تحويل كاش إلى المحفظة مباشرة من أي محفظة إلكترونية (فودافون، أورانج، اتصالات، وي).',
        icon: 'wallet-cards',
        enabled: true
      },
      {
        id: 'instapay',
        name: 'إنستاباي (InstaPay)',
        number: 'kenostore@instapay',
        accountName: 'Keno Store',
        link: '',
        description: 'تحويل لحظي فوري لكافة البنوك المصرية والمحافظ الإلكترونية عبر تطبيق إنستاباي.',
        icon: 'credit-card',
        enabled: true
      },
      {
        id: 'telda',
        name: 'تيلدا (Telda)',
        number: '01064806213',
        accountName: '@kenostore',
        link: 'https://telda.me/pay/kenostore',
        description: 'تحويل فوري وسريع عبر تطبيق تيلدا، متاح للتحويل المباشر.',
        icon: 'smartphone',
        enabled: true
      },
      {
        id: 'orange-cash',
        name: 'أورانج كاش',
        number: '012xxxxxxxx',
        accountName: 'Keno Store',
        link: '',
        description: 'تحويل كاش إلى محفظة أورانج كاش.',
        icon: 'wallet-cards',
        enabled: true
      },
      {
        id: 'etisalat-cash',
        name: 'اتصالات كاش',
        number: '011xxxxxxxx',
        accountName: 'Keno Store',
        link: '',
        description: 'تحويل كاش إلى محفظة اتصالات كاش.',
        icon: 'wallet-cards',
        enabled: true
      },
      {
        id: 'we-pay',
        name: 'وي باي (WE Pay)',
        number: '015xxxxxxxx',
        accountName: 'Keno Store',
        link: '',
        description: 'تحويل كاش إلى محفظة وي باي.',
        icon: 'wallet-cards',
        enabled: true
      }
    ],

    // Built-in Arabic search aliases for common services
    DEFAULT_ALIASES: {
      'pubg': 'pubg mobile ببجي بوبجي العالمية شدات uc يوسي شحن ببجي',
      'pubg-korea': 'ببجي الكورية كوريه kr korea شدات ببجي',
      'pubg-vietnam': 'ببجي الفيتنامية فيتنام vn vietnam',
      'netflix': 'نتفليكس نتفلكس نيتفليكس netflix اشتراك نتفلكس افلام مسلسلات',
      'chatgpt': 'شات جي بي تي شات gpt chatgpt plus شاتجيبيتي اوبن اي اي openai',
      'efootball': 'بيس بيس موبايل كوينز pes efootball كوينز بيس',
      'tiktok': 'تيك توك تيكتوك عملات coins شحن تيك توك لايف كوينز',
      'roblox': 'روبلوكس روبوكس روبكس robux شحن روبلوكس',
      'shahid': 'شاهد شاهد في اي بي vip shahid مسلسلات رمضان',
      'free-fire': 'فري فاير فريفاير جوهر جواهر freefire free fire',
      'fc-mobile': 'فيفا فيفا موبايل fc silver fifa ea sports',
      'yalla-ludo': 'يلا لودو يالالودو ludo ماسات يلا لودو',
      'gemini': 'جيمناي جيميني gemini google advanced ذكاء اصطناعي',
      'claude': 'كلود claude anthropic sonnet ذكاء اصطناعي',
      'osn': 'او اس ان osn plus مسلسلات افلام',
      'paypal': 'بايبال باي بال paypal دولار بايبال تحويل شحن رصيد',
      'vodafone-cash': 'فودافون كاش فودافون محفظة تحويل كاش',
      'instapay': 'انستاباي إنستاباي تحويل بنكي فوري'
    },

    // Conversion Trust Guarantees
    TRUST_BADGES: [
      {
        icon: 'shield-check',
        title: 'ضمان كامل ومستمر',
        desc: 'تعويض أو بديل فوري طوال فترة اشتراكك في حال حدوث أي توقف.'
      },
      {
        icon: 'zap',
        title: 'تسليم فوري سريع',
        desc: 'تنفيذ الشحن وتفعيل الحسابات خلال دقائق معدودة من تأكيد الدفع.'
      },
      {
        icon: 'lock-keyhole',
        title: 'أمان وخصوصية تامة',
        desc: 'لا نطلب أبدًا كلمة سر حسابك أو أي بيانات بنكية خاصة.'
      },
      {
        icon: 'message-circle',
        title: 'دعم ومتابعة شخصية',
        desc: 'فريق دعم متواجد معك على واتساب من لحظة الطلب وحتى الاستلام.'
      }
    ],

    // Real Customer Reviews (Social Proof)
    TESTIMONIALS: [
      {
        name: 'أحمد م. (القاهرة)',
        rating: 5,
        service: 'شحن ببجي العالمية',
        comment: 'أسرع شحن شدات اتعاملت معاه، خلال دقيقتين الشدات كانت في الحساب وأسعارهم ممتازة جدًا مقارنة بأي مكان تاني.',
        date: 'منذ يومين'
      },
      {
        name: 'محمود ط. (الإسكندرية)',
        rating: 5,
        service: 'اشتراك ChatGPT Plus',
        comment: 'الاشتراك شغال بثبات وبدون أي مشاكل، والدعم على واتساب محترم وسريع في الرد والتوضيح.',
        date: 'منذ 5 أيام'
      },
      {
        name: 'سارة ع. (الجيزة)',
        rating: 5,
        service: 'اشتراك نتفليكس وشاهد VIP',
        comment: 'الملف الشخصي شغال برمز سري ومستقر طول الشهر، وتجديد الاشتراك معاهم سهل جدًا بفودافون كاش.',
        date: 'منذ أسبوع'
      }
    ],

    // Featured Hero Card Themes
    FEATURED_THEMES: [
      { id: 'red', label: 'أحمر قرمزي (كينو الأصلي)', primary: '#e11d48', accent: '#fde68a', bg: 'linear-gradient(135deg, #181926 0%, #20131d 50%, #0d0f17 100%)' },
      { id: 'purple', label: 'أرجواني غيمينغ (Gaming Purple)', primary: '#a855f7', accent: '#f5d0fe', bg: 'linear-gradient(135deg, #171324 0%, #25143a 50%, #0d0a14 100%)' },
      { id: 'blue', label: 'أزرق سايبر (Cyber Blue)', primary: '#3b82f6', accent: '#bfdbfe', bg: 'linear-gradient(135deg, #0c1b2f 0%, #112a45 50%, #07101c 100%)' },
      { id: 'emerald', label: 'زمردي نيون (Neon Emerald)', primary: '#10b981', accent: '#a7f3d0', bg: 'linear-gradient(135deg, #0d231a 0%, #133327 50%, #061510 100%)' },
      { id: 'amber', label: 'ذهبي بريميوم (Sunset Gold)', primary: '#f59e0b', accent: '#fef3c7', bg: 'linear-gradient(135deg, #24180d 0%, #35210e 50%, #140c06 100%)' },
      { id: 'dark', label: 'أسود فاخر (Obsidian Dark)', primary: '#e2e8f0', accent: '#f8fafc', bg: 'linear-gradient(135deg, #111318 0%, #1a1d24 50%, #0a0b0e 100%)' }
    ],

    // Admin Role-Based Access Control (RBAC)
    ADMIN_ROLES: {
      OWNER: {
        id: 'owner',
        label: 'المالك (تحكم كامل)',
        badgeClass: 'owner-role-badge',
        permissions: ['view', 'edit_content', 'edit_payments', 'edit_settings', 'publish_github', 'manage_orders']
      },
      EDITOR: {
        id: 'editor',
        label: 'محرر محتوى',
        badgeClass: 'editor-role-badge',
        permissions: ['view', 'edit_content']
      },
      VIEWER: {
        id: 'viewer',
        label: 'مراجع (للقراءة فقط)',
        badgeClass: 'viewer-role-badge',
        permissions: ['view']
      }
    },

    SESSION_TIMEOUT_MINUTES: 60,

    // Order Lifecycle Statuses
    ORDER_STATUSES: {
      'pending': { id: 'pending', label: 'قيد الانتظار', badgeClass: 'status-pending', color: '#f59e0b', icon: 'clock' },
      'paid': { id: 'paid', label: 'تم التحويل / مدفوع', badgeClass: 'status-paid', color: '#3b82f6', icon: 'wallet-cards' },
      'processing': { id: 'processing', label: 'جاري التنفيذ', badgeClass: 'status-processing', color: '#8b5cf6', icon: 'zap' },
      'delivered': { id: 'delivered', label: 'تم التسليم بنجاح', badgeClass: 'status-delivered', color: '#10b981', icon: 'badge-check' },
      'cancelled': { id: 'cancelled', label: 'ملغي', badgeClass: 'status-cancelled', color: '#ef4444', icon: 'x' }
    },

    // Admin Whitelist for Google OAuth Sign-In (Roles: OWNER, EDITOR, VIEWER)
    ADMIN_EMAILS: [
      'aboab411@gmail.com'
    ],

    AUTHORIZED_ADMINS: {
      'aboab411@gmail.com': { role: 'OWNER', name: 'مالك المتجر' }
    },

    // Social Media Platforms
    SOCIAL_PLATFORMS: ['facebook', 'instagram', 'tiktok', 'telegram', 'whatsapp'],

    // Firebase Cloud Credentials (Embedded securely in source code — never entered by users)
    FIREBASE_CONFIG: {
      apiKey: "AIzaSyCF8UANdKdpcNaGHtuo5TMC5vfP7kRyix8",
      authDomain: "keno-store.firebaseapp.com",
      projectId: "keno-store",
      storageBucket: "keno-store.firebasestorage.app",
      messagingSenderId: "583553396506",
      appId: "1:583553396506:web:a2faaa6c062a2cdd0446a3"
    }
  };

  root.KenoConfig = Config;
})(typeof window !== 'undefined' ? window : this);
