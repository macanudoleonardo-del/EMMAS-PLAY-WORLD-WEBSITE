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
  var LANGS = ['en', 'es', 'fr', 'zh', 'ko', 'pt'];

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

  // mobile hamburger menu
  var burger = document.getElementById('navBurger');
  var navEl = document.getElementById('nav');
  var navLinks = document.getElementById('navLinks');
  if (burger && navEl) {
    burger.addEventListener('click', function () {
      var open = navEl.classList.toggle('nav--open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (navLinks) navLinks.addEventListener('click', function (e) {
      if (e.target.closest('a')) { navEl.classList.remove('nav--open'); burger.setAttribute('aria-expanded', 'false'); }
    });
  }

  // saved choice wins; else this page's own language (pre-rendered /es/ /fr/ …);
  // else follow the browser.
  var savedLang = store.get('epw-lang');
  if (!savedLang) {
    var pageMeta = document.querySelector('meta[name="epw-lang"]');
    var pageLang = pageMeta && pageMeta.getAttribute('content');
    if (pageLang && LANGS.indexOf(pageLang) !== -1) {
      savedLang = pageLang;
    } else {
      var nav = (navigator.language || 'en').toLowerCase();
      savedLang = nav.indexOf('es') === 0 ? 'es'
                : nav.indexOf('fr') === 0 ? 'fr'
                : nav.indexOf('pt') === 0 ? 'pt'
                : nav.indexOf('zh') === 0 ? 'zh'
                : nav.indexOf('ko') === 0 ? 'ko'
                : 'en';
    }
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
     The unavailable notice appears before the disabled fields.
     Keep submission blocked until message delivery is configured.
  ── */
  var form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
    });
  }
})();
