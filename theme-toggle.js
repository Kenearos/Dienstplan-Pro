/**
 * Kanagawa Design System — Theme Toggle
 *
 * Einheitliches Dark/Light-Mode Handling fuer alle Projekte.
 *
 * Usage (Script-Tag):
 *   <script src="path/to/theme-toggle.js"></script>
 *
 * Usage (ES Module):
 *   import { KngTheme } from './theme-toggle.js';
 *   KngTheme.toggle();
 *
 * API:
 *   KngTheme.init()          — Automatisch beim Laden. Setzt Theme aus localStorage oder System.
 *   KngTheme.toggle()        — Wechselt Dark <-> Light.
 *   KngTheme.set('dark')     — Setzt explizit.
 *   KngTheme.get()           — Gibt aktuelles Theme zurueck ('dark' | 'light').
 *   KngTheme.reset()         — Entfernt Override, folgt wieder dem System.
 *   KngTheme.onChange(fn)    — Callback bei Theme-Wechsel: fn('dark' | 'light').
 *
 * HTML-Attribute:
 *   data-kng-toggle          — Click-Handler fuer Toggle-Buttons automatisch binden.
 *   data-kng-icon            — Inhalt wird auf Sonne/Mond gesetzt.
 *
 * Beispiel:
 *   <button data-kng-toggle>
 *     <span data-kng-icon></span>
 *   </button>
 */

(function (root, factory) {
  var kng = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KngTheme: kng };
  }
  if (typeof root !== 'undefined') {
    root.KngTheme = kng;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var STORAGE_KEY = 'kng_theme';
  var ATTR_THEME = 'data-theme';
  var ICON_NEON = '✦'; // neon skin marker (Kamigawa: Neon Dynasty)
  var THEME_ORDER = ['dark', 'light', 'neon'];
  var ICON_DARK = '\u2600'; // ☀ (zeigt Sonne = "klick fuer hell")
  var ICON_LIGHT = '\u263E'; // ☾ (zeigt Mond = "klick fuer dunkel")

  var listeners = [];

  function getSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }

  function getStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStored(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // localStorage nicht verfuegbar
    }
  }

  function removeStored() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // localStorage nicht verfuegbar
    }
  }

  function apply(theme) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute(ATTR_THEME, theme);
    }
    updateIcons(theme);
    notify(theme);
  }

  function updateIcons(theme) {
    if (typeof document === 'undefined') return;
    var icons = document.querySelectorAll('[data-kng-icon]');
    for (var i = 0; i < icons.length; i++) {
      icons[i].textContent = theme === 'neon' ? ICON_NEON : (theme === 'dark' ? ICON_DARK : ICON_LIGHT);
    }
  }

  function notify(theme) {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](theme);
      } catch (e) {
        // Listener-Fehler schlucken
      }
    }
  }

  function resolve() {
    return getStored() || getSystemTheme();
  }

  // --- Public API ---

  var KngTheme = {
    init: function () {
      var theme = resolve();
      apply(theme);

      // System-Wechsel beobachten
      if (typeof window !== 'undefined' && window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: light)');
        var handler = function () {
          if (!getStored()) {
            apply(getSystemTheme());
          }
        };
        if (mq.addEventListener) {
          mq.addEventListener('change', handler);
        } else if (mq.addListener) {
          mq.addListener(handler);
        }
      }

      // data-kng-toggle Buttons binden
      if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-kng-toggle]');
          if (btn) {
            KngTheme.toggle();
          }
        });
      }
    },

    get: function () {
      return resolve();
    },

    set: function (theme) {
      if (THEME_ORDER.indexOf(theme) === -1) return;
      setStored(theme);
      apply(theme);
    },

    toggle: function () {
      var current = resolve();
      var idx = THEME_ORDER.indexOf(current);
      if (idx === -1) idx = 0;
      var next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      KngTheme.set(next);
      return next;
    },

    reset: function () {
      removeStored();
      apply(getSystemTheme());
    },

    onChange: function (fn) {
      if (typeof fn === 'function') {
        listeners.push(fn);
      }
    }
  };

  // Auto-Init wenn im Browser
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { KngTheme.init(); });
    } else {
      KngTheme.init();
    }
  }

  return KngTheme;
});
