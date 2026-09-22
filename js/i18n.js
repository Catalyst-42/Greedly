(function (global) {
  'use strict';

  const SUPPORTED = ['ru', 'en', 'zh'];
  const dictionaries = new Map();
  let current = 'ru';

  function load(language) {
    const requested = SUPPORTED.includes(language) ? language : 'ru';
    if (dictionaries.has(requested)) {
      current = requested;
      apply();
      return Promise.resolve();
    }

    return fetch(`i18n/${requested}.json`)
      .then(response => {
        if (!response.ok) throw new Error(`i18n ${response.status}`);
        return response.json();
      })
      .then(dictionary => {
        dictionaries.set(requested, dictionary);
        current = requested;
        apply();
      })
      .catch(error => {
        if (requested !== 'en') return load('en');
        throw error;
      });
  }

  function t(key) {
    const dictionary = dictionaries.get(current) || {};
    return dictionary[key] || key;
  }

  function apply() {
    const dictionary = dictionaries.get(current);
    if (!dictionary) return;
    document.documentElement.lang = current;
    document.title = dictionary.title;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const value = dictionary[element.dataset.i18n];
      if (value !== undefined && typeof value !== 'object') element.textContent = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-weekday]').forEach(element => {
      element.textContent = calendarDayLabels()[Number(element.dataset.weekday)] || '';
    });
  }

  function language() { return current; }
  function locale() { return (dictionaries.get(current) || {}).locale || 'ru-RU'; }
  function dayLabels() { return (dictionaries.get(current) || {}).weekdays || []; }
  function calendarDayLabels() {
    const labels = dayLabels();
    return current === 'en' ? [labels[6], ...labels.slice(0, 6)] : labels;
  }
  function currencyBefore() { return current === 'en'; }
  function weekStartsSunday() { return current === 'en'; }
  function languages() { return dictionaries.get(current)?.languages || {}; }
  function rateCurrency(symbol) {
    return dictionaries.get(current)?.rateCurrencies?.[symbol] || symbol;
  }

  global.I18n = {
    load, t, apply, language, locale, dayLabels, calendarDayLabels,
    currencyBefore, weekStartsSunday, languages, rateCurrency, supported: SUPPORTED
  };
})(window);
