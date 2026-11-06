/*
 * Every word the game shows, in one table: Arabic first (right to left), then Indonesian, Malay and
 * English. Play itself is icons and numbers. {name} placeholders are filled by t(key, vars). Numbers
 * stay Western digits in every language, so the counter reads the same everywhere.
 */
(function (root) {
  'use strict';
  var LC = root.LC || (root.LC = {});

  var LANGS = ['ar', 'id', 'ms', 'en'];
  var NAMES = { ar: 'العربية', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu', en: 'English' };
  var RTL = { ar: true };

  // key: [ar, id, ms, en]
  var T = {
    title: ['Lampcourt', 'Lampcourt', 'Lampcourt', 'Lampcourt'],
    today: ['فناء اليوم', 'Halaman hari ini', 'Laman hari ini', 'Today’s courtyard'],
    lightToday: ['أضئ فناء اليوم', 'Terangi halaman hari ini', 'Terangi laman hari ini', 'Light today’s courtyard'],
    continueToday: ['تابع', 'Lanjutkan', 'Sambung', 'Continue'],
    seeResult: ['عرض النتيجة', 'Lihat hasil', 'Lihat keputusan', 'See result'],
    nightWalk: ['جولة ليلية', 'Jalan malam', 'Jalan malam', 'Night walk'],
    archive: ['الأرشيف', 'Arsip', 'Arkib', 'Archive'],
    settings: ['الإعدادات', 'Pengaturan', 'Tetapan', 'Settings'],
    streak: ['أيام متتالية: {n}', 'Beruntun {n} hari', 'Rentetan {n} hari', '{n} day streak'],
    bestStreak: ['أطول سلسلة: {n}', 'Terbaik {n} hari', 'Terbaik {n} hari', 'Best {n} days'],
    ramadanDay: ['{n} رمضان', '{n} Ramadan', '{n} Ramadan', '{n} Ramadan'],
    eidDay: ['عيد الفطر', 'Idulfitri', 'Aidilfitri', 'Eid al-Fitr'],
    ramadanSoon: ['فوانيس رمضان من {date}', 'Lentera Ramadan mulai {date}', 'Pelita Ramadan mulai {date}', 'Ramadan lanterns from {date}'],
    litOf: ['{lit} من {best}', '{lit} dari {best}', '{lit} daripada {best}', '{lit} of {best}'],
    percentOfBest: ['{p}% من الأفضل', '{p}% dari terbaik', '{p}% daripada terbaik', '{p}% of the best'],
    perfect: ['مثالي', 'Sempurna', 'Sempurna', 'Perfect'],
    newTomorrow: ['فناء جديد غدًا', 'Halaman baru besok', 'Laman baharu esok', 'A new courtyard tomorrow'],
    lanternJoined: ['فانوس جديد في سلسلتك', 'Lentera baru di untaianmu', 'Pelita baharu dalam rangkaianmu', 'A new lantern joins your string'],
    lanternsOf: ['الفوانيس: {n} من 30', 'Lentera: {n} dari 30', 'Pelita: {n} daripada 30', 'Lanterns: {n} of 30'],
    repairLine: ['فاتك يوم واحد. يمكن أن تبقى سلسلتك ({n}).', 'Kamu melewatkan satu hari. Beruntun {n} hari bisa tetap.', 'Anda terlepas satu hari. Rentetan {n} hari boleh kekal.', 'You missed one day. Your {n} day streak can stay.'],
    repairWatch: ['شاهد إعلانًا: احتفظ بسلسلتك', 'Tonton iklan: jaga beruntun', 'Tonton iklan: simpan rentetan', 'Watch an ad: keep your streak'],
    repairTake: ['احتفظ بسلسلتك', 'Jaga beruntunmu', 'Kekalkan rentetan', 'Keep your streak'],
    repairDone: ['سلسلتك باقية.', 'Beruntunmu tetap.', 'Rentetan anda kekal.', 'Your streak stays.'],
    chapter: ['الفصل {n}', 'Bab {n}', 'Bab {n}', 'Chapter {n}'],
    ch1: ['الدار', 'Riad', 'Riad', 'Riad'],
    ch2: ['الخان', 'Karavanserai', 'Karavanserai', 'Caravanserai'],
    ch3: ['حديقة القصر', 'Taman istana', 'Taman istana', 'Palace garden'],
    courtyardN: ['الفناء {n}', 'Halaman {n}', 'Laman {n}', 'Courtyard {n}'],
    starsOf: ['النجوم: {n} من {m}', 'Bintang: {n} dari {m}', 'Bintang: {n} daripada {m}', 'Stars: {n} of {m}'],
    hint: ['أظهر موضعًا', 'Tunjukkan satu titik', 'Tunjukkan satu tempat', 'Show one spot'],
    hintWatch: ['شاهد إعلانًا: أظهر موضعًا', 'Tonton iklan: lihat satu titik', 'Tonton iklan: lihat satu petak', 'Watch an ad: show one spot'],
    hintBody: ['يحدد مكان فانوس واحد من أفضل توزيع. النجوم التي تنالها بعده تحمل علامة.', 'Menandai tempat satu lentera dari susunan terbaik. Bintang yang diraih setelahnya diberi tanda.', 'Menandakan tempat satu pelita daripada susunan terbaik. Bintang yang diraih selepas itu diberi tanda.', 'Marks where one lantern of a best placement goes. Stars won after it carry a mark.'],
    close: ['إغلاق', 'Tutup', 'Tutup', 'Close'],
    yours: ['توزيعك', 'Milikmu', 'Milik anda', 'Yours'],
    bestOne: ['الأفضل', 'Terbaik', 'Terbaik', 'Best'],
    bestIs: ['الأفضل: {n}', 'Terbaik: {n}', 'Terbaik: {n}', 'Best: {n}'],
    next: ['التالي', 'Lanjut', 'Seterusnya', 'Next'],
    retry: ['أعد المحاولة', 'Coba lagi', 'Cuba lagi', 'Try again'],
    home: ['الرئيسية', 'Beranda', 'Utama', 'Home'],
    share: ['مشاركة', 'Bagikan', 'Kongsi', 'Share'],
    paused: ['إيقاف مؤقت', 'Dijeda', 'Dijeda', 'Paused'],
    resume: ['متابعة', 'Lanjutkan', 'Sambung', 'Resume'],
    restart: ['ابدأ من جديد', 'Ulangi', 'Mula semula', 'Start over'],
    archiveWatch: ['شاهد إعلانًا: افتح هذا اليوم', 'Tonton iklan: buka tanggal ini', 'Tonton iklan: buka tarikh ini', 'Watch an ad: open this day'],
    archiveTake: ['افتح هذا اليوم', 'Buka tanggal ini', 'Buka tarikh ini', 'Open this day'],
    archiveLeft: ['المتبقي اليوم: {n}', 'Sisa hari ini: {n}', 'Baki hari ini: {n}', '{n} left today'],
    archiveNone: ['تُفتح أيام أخرى غدًا', 'Tanggal lain terbuka besok', 'Tarikh lain dibuka esok', 'More past days open tomorrow'],
    archiveRecover: ['ويعيد فانوس ذلك اليوم', 'Sekaligus memulihkan lenteranya', 'Sekali gus memulihkan pelitanya', 'Also brings back its lantern'],
    archiveEmpty: ['تظهر هنا الأيام السابقة.', 'Hari-hari lalu muncul di sini.', 'Hari-hari lepas muncul di sini.', 'Past days appear here.'],
    notPlayed: ['لم يُلعب', 'Belum dimainkan', 'Belum dimainkan', 'Not played'],
    adNotReady: ['لا يوجد إعلان جاهز الآن. حاول بعد قليل.', 'Belum ada iklan. Coba lagi nanti.', 'Tiada iklan sedia. Cuba lagi nanti.', 'No ad is ready right now. Try again soon.'],
    adSkipped: ['لم يكتمل الإعلان، فلم تُمنح المكافأة.', 'Iklan tidak selesai, jadi tidak ada hadiah.', 'Iklan tidak selesai, jadi tiada ganjaran.', 'The ad did not finish, so no reward.'],
    language: ['اللغة', 'Bahasa', 'Bahasa', 'Language'],
    sound: ['الصوت', 'Suara', 'Bunyi', 'Sound'],
    ambience: ['أجواء الليل', 'Suasana malam', 'Suasana malam', 'Night ambience'],
    motion: ['تقليل الحركة', 'Kurangi gerakan', 'Kurangkan gerakan', 'Reduce motion'],
    on: ['تشغيل', 'Aktif', 'Hidup', 'On'],
    off: ['إيقاف', 'Mati', 'Mati', 'Off'],
    auto: ['حسب النظام', 'Sistem', 'Sistem', 'System'],
    ramadanStart: ['بداية رمضان', 'Awal Ramadan', 'Awal Ramadan', 'Ramadan start'],
    shiftEarlier: ['قبل يوم', 'Sehari lebih awal', 'Sehari lebih awal', 'A day earlier'],
    shiftNone: ['حسب الجدول', 'Sesuai jadwal', 'Ikut jadual', 'As listed'],
    shiftLater: ['بعد يوم', 'Sehari lebih lambat', 'Sehari lebih lewat', 'A day later'],
    shiftNote: ['يغيّر تواريخ رمضان فقط، لا الفناء اليومي.', 'Hanya menggeser tanggal Ramadan, bukan halaman harian.', 'Hanya menganjak tarikh Ramadan, bukan laman harian.', 'Moves only the Ramadan dates, never the daily.'],
    removeAds: ['إزالة الإعلانات والأرشيف', 'Bebas iklan dan arsip', 'Bebas iklan dan arkib', 'Remove ads and archive'],
    removeAdsBody: ['بلا إعلانات بين أفنية الجولة الليلية، وكل الأيام السابقة مفتوحة، ومكافآت بلا إعلان.', 'Tanpa iklan di antara halaman Jalan malam, semua hari lalu terbuka, bonus tanpa iklan.', 'Tiada iklan antara laman Jalan malam, semua hari lepas dibuka, bonus tanpa iklan.', 'No ads between Night walk courtyards, every past day open, bonuses without an ad.'],
    buy: ['شراء مقابل {price}', 'Beli {price}', 'Beli {price}', 'Buy for {price}'],
    buyPlain: ['شراء', 'Beli', 'Beli', 'Buy'],
    restore: ['استعادة المشتريات', 'Pulihkan pembelian', 'Pulihkan pembelian', 'Restore purchases'],
    adFreeOn: ['أزيلت الإعلانات. شكرًا لك.', 'Iklan dihapus. Terima kasih.', 'Iklan dibuang. Terima kasih.', 'Ads removed. Thank you.'],
    privacyOptions: ['خيارات الخصوصية', 'Opsi privasi', 'Pilihan privasi', 'Privacy options'],
    privacyPolicy: ['سياسة الخصوصية', 'Kebijakan privasi', 'Dasar privasi', 'Privacy policy'],
    howToPlay: ['طريقة اللعب', 'Cara bermain', 'Cara bermain', 'How to play'],
    credits: ['الخط: Readex Pro (OFL). الأيقونات: Phosphor (MIT).', 'Huruf: Readex Pro (OFL). Ikon: Phosphor (MIT).', 'Fon: Readex Pro (OFL). Ikon: Phosphor (MIT).', 'Font: Readex Pro (OFL). Icons: Phosphor (MIT).'],
    'buy.owned': ['هذا الحساب يملكه بالفعل.', 'Akun ini sudah memilikinya.', 'Akaun ini sudah memilikinya.', 'This account already owns it.'],
    'buy.pending': ['الدفع قيد الانتظار. يُفعَّل عند تأكيد Google Play.', 'Pembayaran tertunda. Aktif setelah Google Play mengonfirmasi.', 'Pembayaran belum selesai. Aktif selepas Google Play mengesahkan.', 'Payment pending. It unlocks once Google Play confirms.'],
    'buy.cancelled': ['أُلغي الشراء.', 'Pembelian dibatalkan.', 'Pembelian dibatalkan.', 'Purchase cancelled.'],
    'buy.unavailable': ['الشراء يتطلب متجر Google Play.', 'Pembelian memerlukan Google Play Store.', 'Pembelian memerlukan Google Play Store.', 'Purchases need the Google Play Store.'],
    'buy.notOffered': ['غير معروض للبيع هنا حاليًا.', 'Belum dijual di sini.', 'Belum dijual di sini.', 'Not on sale here right now.'],
    'buy.offline': ['تعذّر الوصول إلى Google Play. حاول عند الاتصال.', 'Google Play tidak terjangkau. Coba lagi saat online.', 'Google Play tidak dapat dihubungi. Cuba lagi dalam talian.', 'Google Play could not be reached. Try again online.'],
    'buy.failed': ['لم تكتمل عملية الشراء.', 'Pembelian tidak berhasil.', 'Pembelian tidak berjaya.', 'The purchase did not go through.'],
    'restore.found': ['استُعيد الشراء.', 'Pembelian dipulihkan.', 'Pembelian dipulihkan.', 'Purchase restored.'],
    'restore.none': ['لا يوجد شراء على هذا الحساب.', 'Tidak ada pembelian di akun ini.', 'Tiada pembelian pada akaun ini.', 'No purchase found on this account.'],
    'share.copied': ['نُسخ. الصقه أينما شئت.', 'Disalin. Tempel di mana saja.', 'Disalin. Tampal di mana-mana.', 'Copied. Paste it anywhere.'],
    'share.failed': ['تعذّرت المشاركة هنا.', 'Gagal membagikan di sini.', 'Gagal berkongsi di sini.', 'Sharing did not work here.'],
    greetRamadan: ['رمضان كريم', 'Selamat berpuasa', 'Selamat berpuasa', 'Ramadan Mubarak'],
    greetEid: ['عيد مبارك', 'Selamat Idulfitri', 'Selamat Hari Raya', 'Eid Mubarak'],
    how1: ['اسحب الفوانيس إلى الأرض. كل فانوس يضيء البلاط الذي يراه.', 'Seret lentera ke lantai. Setiap lentera menerangi ubin yang terlihat olehnya.', 'Seret pelita ke lantai. Setiap pelita menerangi jubin yang dilihatnya.', 'Drag lanterns onto the floor. Each lights the tiles it can see.'],
    how2: ['الأعمدة والجدران تلقي ظلالًا. الأقواس تمرّر الضوء. المشربيات تقصّر مداه.', 'Tiang dan dinding membuat bayangan. Lengkungan meneruskan cahaya. Kisi memperpendek jangkauannya.', 'Tiang dan dinding menghasilkan bayang. Gerbang melepaskan cahaya. Kekisi memendekkan jangkauannya.', 'Columns and walls cast shadows. Arches let light through. Screens shorten its reach.'],
    how3: ['أضئ أكبر عدد من البلاطات ثم اضغط زر الفانوس.', 'Terangi ubin sebanyak mungkin, lalu tekan tombol lentera.', 'Terangi seberapa banyak jubin, kemudian tekan butang pelita.', 'Light as many tiles as you can, then press the lantern button.'],
    how4: ['فناء واحد كل يوم، هو نفسه للجميع. تضيئه مرة واحدة ثم ترى الأفضل.', 'Satu halaman setiap hari, sama untuk semua. Nyalakan sekali, lalu lihat yang terbaik.', 'Satu laman setiap hari, sama untuk semua. Nyalakan sekali, kemudian lihat yang terbaik.', 'One courtyard a day, the same for everyone. You light it once, then see the best.'],
    'aria.board': ['مخطط الفناء', 'Denah halaman', 'Pelan laman', 'Courtyard plan'],
    'aria.light': ['أضئ', 'Nyalakan', 'Nyalakan', 'Light'],
    'aria.undo': ['تراجع', 'Urungkan', 'Buat asal', 'Undo'],
    'aria.pause': ['إيقاف مؤقت', 'Jeda', 'Jeda', 'Pause'],
    'aria.back': ['رجوع', 'Kembali', 'Kembali', 'Back'],
    'aria.lit': ['البلاطات المضاءة: {n}', 'Ubin menyala: {n}', 'Jubin menyala: {n}', 'Lit tiles: {n}'],
    'aria.left': ['الفوانيس المتبقية: {n}', 'Sisa lentera: {n}', 'Baki pelita: {n}', 'Lanterns left: {n}'],
    'aria.locked': ['مغلق', 'Terkunci', 'Berkunci', 'Locked'],
    'aria.hinted': ['بمساعدة', 'Dengan petunjuk', 'Dengan petunjuk', 'With a hint']
  };

  var lang = 'en';

  /** The best language for a list of BCP 47 tags (navigator.languages), English when none fits. */
  function detect(tags) {
    tags = tags || [];
    for (var i = 0; i < tags.length; i++) {
      var base = String(tags[i] || '').toLowerCase().split(/[-_]/)[0];
      if (base === 'in') base = 'id'; // old Java code for Indonesian
      if (base === 'zsm') base = 'ms';
      if (LANGS.indexOf(base) >= 0) return base;
    }
    return 'en';
  }

  function setLang(l) { lang = LANGS.indexOf(l) >= 0 ? l : 'en'; return lang; }
  function getLang() { return lang; }
  function dir(l) { return RTL[l || lang] ? 'rtl' : 'ltr'; }

  function t(key, vars, l) {
    var row = T[key];
    var s = row ? row[LANGS.indexOf(l || lang)] : key;
    if (s == null) s = row[3];
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
    return s;
  }

  var api = { LANGS: LANGS, NAMES: NAMES, TABLE: T, detect: detect, setLang: setLang, getLang: getLang, dir: dir, t: t };
  LC.strings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
