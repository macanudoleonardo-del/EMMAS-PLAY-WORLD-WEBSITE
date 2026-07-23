/* ═══════════════════════════════════════════════════════════
   Emma's Play World — behaviour
   Multi-language (EN · ES · ZH · KO, + room for a 5th) · theme
   · nav state · contact form
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ── language ───────────────────────────────────────────────
     Supported languages. To add the 5th language later:
       1) add its code here (e.g. 'pt'),
       2) add a matching <option> in the #langSelect dropdown,
       3) add data-<code>="…" on each translatable element.
     Any element missing a translation falls back to English,
     so a half-translated language still renders cleanly.
  ── */
  var LANGS = ['en', 'es', 'fr', 'zh', 'ko'];

  function applyLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'en';

    document.querySelectorAll('[data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v === null) v = el.getAttribute('data-en'); // graceful fallback
      if (v !== null) el.textContent = v;
    });

    document.querySelectorAll('[data-ph-en]').forEach(function (el) {
      var v = el.getAttribute('data-ph-' + lang);
      if (v === null) v = el.getAttribute('data-ph-en');
      if (v !== null) el.setAttribute('placeholder', v);
    });

    root.setAttribute('lang', lang);
    var sel = document.getElementById('langSelect');
    if (sel) sel.value = lang;
    store.set('epw-lang', lang);
  }

  var langSel = document.getElementById('langSelect');
  if (langSel) {
    langSel.addEventListener('change', function () { applyLang(langSel.value); });
  }

  // saved choice wins; otherwise follow the browser
  var savedLang = store.get('epw-lang');
  if (!savedLang) {
    var nav = (navigator.language || 'en').toLowerCase();
    savedLang = nav.indexOf('es') === 0 ? 'es'
              : nav.indexOf('fr') === 0 ? 'fr'
              : nav.indexOf('zh') === 0 ? 'zh'
              : nav.indexOf('ko') === 0 ? 'ko'
              : 'en';
  }
  applyLang(savedLang);

  /* ── theme ──────────────────────────────────────────────── */
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    store.set('epw-theme', theme);
  }

  var savedTheme = store.get('epw-theme');
  if (savedTheme) applyTheme(savedTheme);

  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      if (!current) {
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        current = prefersDark ? 'dark' : 'light';
      }
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  /* ── nav shadow on scroll ───────────────────────────────── */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── year ───────────────────────────────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ── contact form ───────────────────────────────────────────
     NOT CONNECTED yet. The Digital Authority Blueprint (Phase 2)
     calls for Resend API + WhatsApp routing to a parent/manager
     (partnerships@emmasplayworld.com). Until that's wired up, this
     validates and then says it isn't live rather than dropping the
     message. See MARKETING.md → "Tech stack".
  ── */
  var form = document.getElementById('contactForm');
  var msg = document.getElementById('contactMsg');

  var NOT_LIVE = {
    en: '⚠ Form not connected yet — hook up Resend/WhatsApp (see MARKETING.md).',
    es: '⚠ Formulario aún no conectado — configura Resend/WhatsApp (ver MARKETING.md).',
    zh: '⚠ 表单尚未连接——请配置 Resend/WhatsApp（见 MARKETING.md）。',
    ko: '⚠ 폼이 아직 연결되지 않았어요 — Resend/WhatsApp를 연결하세요 (MARKETING.md 참고).',
    fr: '⚠ Formulaire pas encore connecté — configurez Resend/WhatsApp (voir MARKETING.md).'
  };
  var FILL = {
    en: 'Please fill in the required fields.',
    es: 'Por favor completa los campos requeridos.',
    zh: '请填写必填项。',
    ko: '필수 항목을 입력해 주세요.',
    fr: 'Veuillez remplir les champs obligatoires.'
  };

  if (form && msg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lang = root.getAttribute('lang') || 'en';
      if (!(lang in NOT_LIVE)) lang = 'en';

      if (!form.checkValidity()) {
        msg.textContent = FILL[lang];
        var firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      msg.textContent = NOT_LIVE[lang];
      console.warn("[Emma's Play World] Contact form is a placeholder. See MARKETING.md → Tech stack.");
    });
  }
})();
