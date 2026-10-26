// Source of truth for extension/_locales/*/messages.json. Run: node scripts/locales.src.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** key: [ru, en, kk] */
const M = {
  extName: ['Сохранить картинку как… — PNG, JPG, WebP', 'Save Picture As… — PNG, JPG, WebP', 'Суретті PNG, JPG, WebP ретінде сақтау'],
  extShortName: ['PNG/JPG/WebP', 'PNG/JPG/WebP', 'PNG/JPG/WebP'],
  extDescription: [
    'Правый клик по картинке: сохранить как PNG, JPG или WebP, скопировать как PNG. Конвертация прямо в браузере, без серверов.',
    'Right-click any image: save it as PNG, JPG or WebP, or copy it as PNG. Converted locally in your browser, no servers.',
    'Суретті тінтуірдің оң жағымен басып, PNG, JPG не WebP етіп сақтаңыз немесе PNG етіп көшіріңіз. Барлығы браузердің ішінде.',
  ],
  actionTitle: ['Сохранить картинку как… — настройки', 'Save Picture As… — settings', 'Суретті сақтау — баптаулар'],

  menuParent: ['Сохранить картинку как…', 'Save picture as…', 'Суретті сақтау…'],
  menuSaveAs: ['Сохранить как $1', 'Save as $1', '$1 етіп сақтау'],
  menuCopyPng: ['Скопировать как PNG', 'Copy as PNG', 'PNG етіп көшіру'],
  menuOriginal: ['Сохранить оригинал (без конвертации)', 'Save the original (no conversion)', 'Түпнұсқаны сақтау (түрлендірусіз)'],

  close: ['Закрыть', 'Close', 'Жабу'],
  actionOriginal: ['Сохранить оригинал', 'Save original', 'Түпнұсқаны сақтау'],
  copied: ['Картинка скопирована как PNG ($1)', 'Image copied as PNG ($1)', 'Сурет PNG етіп көшірілді ($1)'],
  saved: ['Сохранено: $1', 'Saved: $1', 'Сақталды: $1'],
  noteFirstFrame: [
    'Картинка анимированная — сохранён только первый кадр. Чтобы сохранить анимацию, нажмите «Сохранить оригинал».',
    'This image is animated — only the first frame was saved. To keep the animation, click "Save original".',
    'Сурет анимацияланған — тек бірінші кадр сақталды. Анимацияны сақтау үшін «Түпнұсқаны сақтау» батырмасын басыңыз.',
  ],
  noteSvgReduced: [
    'SVG очень большой — сохранён в уменьшенном размере, чтобы браузер справился.',
    'The SVG is very large — it was saved at a reduced size so the browser can handle it.',
    'SVG тым үлкен — браузер көтере алуы үшін кішірейтіліп сақталды.',
  ],
  errHttp: ['Не удалось загрузить картинку: сервер ответил ошибкой $1.', 'Could not load the image: the server returned error $1.', 'Суретті жүктеу мүмкін болмады: сервер $1 қатесін қайтарды.'],
  errNetwork: ['Не удалось загрузить картинку: сервер недоступен или не отдаёт её расширению.', 'Could not load the image: the server is unreachable or refuses to serve it.', 'Суретті жүктеу мүмкін болмады: сервер қолжетімсіз немесе оны бермейді.'],
  errNotImage: ['По этому адресу не картинка (возможно, страница-заглушка или ошибка сервера).', 'This address does not return an image (maybe a placeholder page or a server error).', 'Бұл мекенжайда сурет жоқ (мүмкін, сервер қатесі).'],
  errTooLarge: ['Картинка слишком большая для конвертации в браузере. Её можно сохранить как есть.', 'The image is too large to convert in the browser. You can save it as is.', 'Сурет браузерде түрлендіру үшін тым үлкен. Оны сол күйінде сақтауға болады.'],
  errDecode: ['Браузер не смог прочитать эту картинку. Её можно сохранить как есть.', 'The browser could not decode this image. You can save it as is.', 'Браузер бұл суретті оқи алмады. Оны сол күйінде сақтауға болады.'],
  errEncode: ['Этот браузер не умеет сохранять в выбранный формат. Выберите PNG или JPG.', 'This browser cannot encode the selected format. Choose PNG or JPG.', 'Бұл браузер таңдалған пішімде сақтай алмайды. PNG не JPG таңдаңыз.'],
  errBlob: ['Картинка больше недоступна: страница уже освободила её. Обновите страницу и попробуйте снова.', 'The image is no longer available: the page has released it. Reload the page and try again.', 'Сурет енді қолжетімсіз. Бетті жаңартып, қайталап көріңіз.'],
  errUnreachable: ['Эту картинку нельзя прочитать на этой странице.', 'This image cannot be read on this page.', 'Бұл суретті осы бетте оқу мүмкін емес.'],
  errCopy: ['Не удалось скопировать: браузер не дал доступ к буферу обмена. Попробуйте ещё раз или сохраните файл.', 'Copy failed: the browser denied clipboard access. Try again or save the file instead.', 'Көшіру мүмкін болмады: браузер алмасу буферіне рұқсат бермеді. Қайталаңыз немесе файлды сақтаңыз.'],
  errCopyInsecure: ['Копирование картинок работает только на защищённых (https) страницах. Сохраните файл вместо копирования.', 'Copying images works only on secure (https) pages. Save the file instead.', 'Суретті көшіру тек қорғалған (https) беттерде жұмыс істейді. Файлды сақтаңыз.'],

  permTitle: ['Нужен доступ к сайту с картинкой', 'Access to the image host is needed', 'Сурет орналасқан сайтқа рұқсат керек'],
  permLead: ['Чтобы сохранить эту картинку, расширению нужно скачать её с сервера:', 'To save this image, the extension needs to download it from:', 'Бұл суретті сақтау үшін кеңейтім оны мына серверден жүктеуі керек:'],
  permWhy: [
    'Картинка лежит на другом сервере, и страница не даёт прочитать её напрямую. Расширение скачает её с этого адреса само — как браузер при открытии картинки — и конвертирует на вашем компьютере.',
    'The image is hosted on another server and the page does not allow reading it directly. The extension will download it from this address itself, just like the browser does when it opens the image, and convert it on your computer.',
    'Сурет басқа серверде орналасқан, ал бет оны тікелей оқуға мүмкіндік бермейді. Кеңейтім оны осы мекенжайдан өзі жүктеп, компьютеріңізде түрлендіреді.',
  ],
  permPrivacy: [
    'Доступ используется только для скачивания картинок, которые вы сами выберете в меню. Его можно отозвать в настройках расширения в любой момент.',
    'The access is used only to download images you pick in the menu. You can revoke it in the extension settings at any time.',
    'Рұқсат тек мәзірден өзіңіз таңдаған суреттерді жүктеу үшін қолданылады. Оны кез келген уақытта баптауларда қайтарып алуға болады.',
  ],
  permAllowHost: ['Разрешить для этого сайта', 'Allow for this site', 'Осы сайт үшін рұқсат ету'],
  permAllowAll: ['Разрешить для всех сайтов', 'Allow for all sites', 'Барлық сайттар үшін рұқсат ету'],
  permDenied: ['Доступ не выдан. Картинку можно открыть в новой вкладке и сохранить оттуда.', 'Access was not granted. You can open the image in a new tab and save it from there.', 'Рұқсат берілмеді. Суретті жаңа қойындыда ашып, сол жерден сақтауға болады.'],
  permGranted: ['Готово, сохраняю картинку…', 'Done, saving the image…', 'Дайын, суретті сақтап жатырмын…'],
  permExpired: ['Запрос устарел. Щёлкните по картинке правой кнопкой ещё раз.', 'This request has expired. Right-click the image again.', 'Сұрау ескірді. Суретті оң жақпен қайта басыңыз.'],
  cancel: ['Отмена', 'Cancel', 'Болдырмау'],

  optionsTitle: ['Сохранить картинку как… — настройки', 'Save Picture As… — settings', 'Суретті сақтау — баптаулар'],
  optionsLead: [
    'Щёлкните правой кнопкой по любой картинке → «Сохранить картинку как…» → PNG, JPG или WebP.',
    'Right-click any image → "Save picture as…" → PNG, JPG or WebP.',
    'Кез келген суретті оң жақпен басыңыз → «Суретті сақтау…» → PNG, JPG не WebP.',
  ],
  sectionFormat: ['Формат', 'Format', 'Пішім'],
  defaultFormat: ['Формат по умолчанию (первый пункт меню)', 'Default format (first menu item)', 'Әдепкі пішім (мәзірдегі бірінші тармақ)'],
  formatsHint: [
    'PNG — без потерь и с прозрачностью. JPG — открывается везде. WebP — компактный, с прозрачностью.',
    'PNG: lossless, keeps transparency. JPG: opens everywhere. WebP: compact, keeps transparency.',
    'PNG — сапасы жоғалмайды, мөлдірлік сақталады. JPG — барлық жерде ашылады. WebP — ықшам, мөлдірлікпен.',
  ],
  quality: ['Качество JPG и WebP', 'JPG and WebP quality', 'JPG және WebP сапасы'],
  background: ['Фон вместо прозрачности (для JPG)', 'Background for transparent areas (JPG)', 'Мөлдір аймақтардың фоны (JPG үшін)'],
  white: ['Белый', 'White', 'Ақ'],
  svgScale: ['Векторные картинки (SVG)', 'Vector images (SVG)', 'Векторлық суреттер (SVG)'],
  svgScale2: ['В 2 раза крупнее — чётко на экранах высокой чёткости', '2× larger: sharp on high-resolution screens', '2 есе үлкен — жоғары ажыратымдылықты экрандарда анық'],
  svgScale1: ['В натуральную величину', 'Natural size', 'Табиғи өлшемде'],
  sectionSave: ['Сохранение', 'Saving', 'Сақтау'],
  askWhere: ['Спрашивать, куда сохранить файл', 'Ask where to save each file', 'Файлды қайда сақтау керектігін сұрау'],
  toastOnSave: ['Показывать уведомление на странице после сохранения', 'Show a notice on the page after saving', 'Сақтағаннан кейін бетте хабарлама көрсету'],
  pattern: ['Имя файла', 'File name', 'Файл атауы'],
  insertToken: ['Вставить метку', 'Insert a tag', 'Белгі қою'],
  patternHelp: [
    'Нажмите на метку, чтобы вставить её. «/» создаёт папку внутри «Загрузок», например {site}/{name}.',
    'Click a tag to insert it. "/" creates a folder inside Downloads, e.g. {site}/{name}.',
    'Белгіні қою үшін оны басыңыз. «/» «Жүктеулер» ішінде қалта жасайды, мысалы {site}/{name}.',
  ],
  example: ['Пример:', 'Example:', 'Мысал:'],
  patternEmpty: ['Имя файла не может быть пустым.', 'The file name cannot be empty.', 'Файл атауы бос болмауы керек.'],
  patternUnknown: ['Неизвестная метка $1.', 'Unknown tag $1.', 'Белгісіз белгі: $1.'],
  token_name: ['имя из адреса картинки или её описание', 'name from the image address or its alt text', 'сурет мекенжайынан не сипаттамасынан алынған атау'],
  token_alt: ['описание картинки (alt)', 'image alt text', 'сурет сипаттамасы (alt)'],
  token_title: ['заголовок страницы', 'page title', 'бет тақырыбы'],
  token_site: ['сайт', 'site', 'сайт'],
  token_date: ['дата (ГГГГ-ММ-ДД)', 'date (YYYY-MM-DD)', 'күн (ЖЖЖЖ-АА-КК)'],
  token_time: ['время (ЧЧ-ММ-СС)', 'time (HH-MM-SS)', 'уақыт (СС-ММ-СС)'],
  token_width: ['ширина в пикселях', 'width in pixels', 'ені (пиксель)'],
  token_height: ['высота в пикселях', 'height in pixels', 'биіктігі (пиксель)'],
  token_format: ['формат (PNG, JPG…)', 'format (PNG, JPG…)', 'пішім (PNG, JPG…)'],
  sectionAccess: ['Доступ к сайтам', 'Site access', 'Сайттарға рұқсат'],
  accessLead: [
    'Обычно картинка читается прямо со страницы, на которой вы щёлкнули, — без доступа к сайтам. Если она лежит на другом сервере (CDN), расширение один раз спросит разрешение для этого сервера.',
    'Usually the image is read right from the page you clicked on, with no site access. If it is hosted on another server (a CDN), the extension asks once for access to that server.',
    'Әдетте сурет сіз басқан беттің өзінен оқылады, сайттарға рұқсат қажет емес. Егер ол басқа серверде (CDN) болса, кеңейтім сол сервер үшін бір рет рұқсат сұрайды.',
  ],
  allSitesOn: ['Доступ ко всем сайтам: разрешён', 'Access to all sites: allowed', 'Барлық сайттарға рұқсат: берілген'],
  allSitesOff: ['Доступ ко всем сайтам: нет (спрашивать для каждого сервера)', 'Access to all sites: no (ask per server)', 'Барлық сайттарға рұқсат: жоқ (әр сервер үшін сұрау)'],
  grantAll: ['Разрешить для всех', 'Allow for all', 'Барлығына рұқсат ету'],
  revokeAll: ['Отозвать', 'Revoke', 'Қайтарып алу'],
  revoke: ['Убрать', 'Remove', 'Алып тастау'],
  hostsEmpty: ['Разрешений для отдельных сайтов пока нет.', 'No per-site permissions yet.', 'Жеке сайттарға рұқсаттар әзірге жоқ.'],
  sectionAbout: ['О расширении', 'About', 'Кеңейтім туралы'],
  aboutText: [
    'Конвертация идёт прямо в браузере: картинки никуда не отправляются. Анимированные GIF и WebP сохраняются первым кадром — оригинал можно сохранить пунктом «Сохранить оригинал».',
    'Conversion happens right in the browser: images are never uploaded anywhere. Animated GIF and WebP are saved as the first frame; use "Save the original" to keep the animation.',
    'Түрлендіру браузердің ішінде жүреді: суреттер ешқайда жіберілмейді. Анимацияланған GIF пен WebP бірінші кадрмен сақталады — анимацияны «Түпнұсқаны сақтау» арқылы сақтауға болады.',
  ],
  privacyShort: ['Нет аналитики, рекламы и аккаунтов. Открытый код, лицензия MIT.', 'No analytics, ads or accounts. Open source, MIT license.', 'Аналитика, жарнама және тіркелгі жоқ. Ашық код, MIT лицензиясы.'],
  reset: ['Сбросить настройки', 'Reset settings', 'Баптауларды қалпына келтіру'],
  resetDone: ['Настройки сброшены', 'Settings reset', 'Баптаулар қалпына келтірілді'],
  savedSettings: ['Сохранено', 'Saved', 'Сақталды'],
  otherExtensions: ['Другие расширения автора', "The author's other extensions", 'Автордың басқа кеңейтімдері'],
  privacyLink: ['Политика конфиденциальности', 'Privacy policy', 'Құпиялылық саясаты'],
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', '_locales');
['ru', 'en', 'kk'].forEach((lang, i) => {
  /** @type {Record<string, {message: string}>} */
  const out = {};
  for (const [k, v] of Object.entries(M)) out[k] = { message: v[i] };
  mkdirSync(join(root, lang), { recursive: true });
  writeFileSync(join(root, lang, 'messages.json'), JSON.stringify(out, null, 2) + '\n');
});
console.log('locales written:', Object.keys(M).length, 'keys');
