(function (global) {
  'use strict';

  const KEY = 'earnings-counter-config-v2';
  const PERIOD_KEY = 'earnings-counter-period';

  function detectSystemLanguage() {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const candidate of candidates) {
      const language = String(candidate || '').toLowerCase().split('-')[0];
      if (language === 'ru' || language === 'en' || language === 'zh') return language;
    }
    return 'en';
  }

  const DEFAULT_DAYS = [
    { off: false, start: '10:00', end: '19:00' },
    { off: false, start: '10:00', end: '19:00' },
    { off: false, start: '10:00', end: '19:00' },
    { off: false, start: '10:00', end: '19:00' },
    { off: false, start: '10:00', end: '19:00' },
    { off: true, start: '10:00', end: '19:00' },
    { off: true, start: '10:00', end: '19:00' }
  ];

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const DEFAULT_CONFIG = {
    salary: 0,
    language: detectSystemLanguage(),
    currency: '$',
    period: 'month',
    tailDigits: 2,
    theme: 'dark',
    useProductionCalendar: true,
    scheduleMode: 'weekly',
    shiftWorkDays: 1,
    shiftRestDays: 3,
    shiftStartDate: localDateString(),
    shiftStartTime: '10:00',
    shiftEndTime: '18:00',
    days: DEFAULT_DAYS.map(d => ({ ...d })),
    paydays: [10, 25],
    visibility: {
      workdays: true,
      paydays: true,
      dayrate: true,
      hourrate: true,
      shift: true,
      period: true,
      calendar: true
    }
  };

  const CURRENCIES = ['₽', '$', '€', '₸', '₴', '¥', '£'];
  const PERIODS = ['day', 'cycle', 'month', 'year'];
  const TAILS = [0, 2, 3, 4];
  const LANGUAGES = ['ru', 'en', 'zh'];
  const THEMES = ['dark', 'light', 'pink'];
  const SCHEDULE_MODES = ['weekly', 'shift'];

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function timeValid(v) {
    return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  }

  function dateValid(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function normalizeDay(raw, fallback) {
    if (!isPlainObject(raw)) return { ...fallback };
    const off = typeof raw.off === 'boolean' ? raw.off : fallback.off;
    const start = timeValid(raw.start) ? raw.start : fallback.start;
    const end = timeValid(raw.end) ? raw.end : fallback.end;
    return { off, start, end };
  }

  function normalizeDays(raw) {
    if (!Array.isArray(raw) || raw.length !== 7) {
      return DEFAULT_DAYS.map(d => ({ ...d }));
    }
    if (typeof raw[0] === 'boolean' || typeof raw[0] === 'number') {
      return DEFAULT_DAYS.map((d, i) => {
        const off = raw[i] === true || raw[i] === 0;
        return { ...d, off };
      });
    }
    return raw.map((d, i) => normalizeDay(d, DEFAULT_DAYS[i]));
  }

  function normalizePaydays(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') arr = raw.split(/[,\s]+/);
    const nums = arr
      .map(v => parseInt(v, 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 31);
    const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);
    return uniq.length ? uniq : DEFAULT_CONFIG.paydays.slice();
  }

  function normalizeVisibility(raw) {
    const fallback = DEFAULT_CONFIG.visibility;
    if (!isPlainObject(raw)) return { ...fallback };
    return Object.keys(fallback).reduce((result, key) => {
      result[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback[key];
      return result;
    }, {});
  }

  function normalize(raw) {
    const base = {
      salary: DEFAULT_CONFIG.salary,
      language: DEFAULT_CONFIG.language,
      currency: DEFAULT_CONFIG.currency,
      period: DEFAULT_CONFIG.period,
      tailDigits: DEFAULT_CONFIG.tailDigits,
      theme: DEFAULT_CONFIG.theme,
      useProductionCalendar: DEFAULT_CONFIG.useProductionCalendar,
      scheduleMode: DEFAULT_CONFIG.scheduleMode,
      shiftWorkDays: DEFAULT_CONFIG.shiftWorkDays,
      shiftRestDays: DEFAULT_CONFIG.shiftRestDays,
      shiftStartDate: DEFAULT_CONFIG.shiftStartDate,
      shiftStartTime: DEFAULT_CONFIG.shiftStartTime,
      shiftEndTime: DEFAULT_CONFIG.shiftEndTime,
      days: DEFAULT_DAYS.map(d => ({ ...d })),
      paydays: DEFAULT_CONFIG.paydays.slice(),
      visibility: { ...DEFAULT_CONFIG.visibility }
    };
    if (!isPlainObject(raw)) return base;

    const salary = Number(raw.salary);
    if (Number.isFinite(salary) && salary >= 0) base.salary = salary;
    if (LANGUAGES.includes(raw.language)) base.language = raw.language;

    if (CURRENCIES.includes(raw.currency)) base.currency = raw.currency;
    if (PERIODS.includes(raw.period)) base.period = raw.period;
    if (THEMES.includes(raw.theme)) base.theme = raw.theme;
    if (typeof raw.useProductionCalendar === 'boolean') {
      base.useProductionCalendar = raw.useProductionCalendar;
    }
    if (SCHEDULE_MODES.includes(raw.scheduleMode)) base.scheduleMode = raw.scheduleMode;
    const shiftWorkDays = Number(raw.shiftWorkDays);
    if (Number.isInteger(shiftWorkDays) && shiftWorkDays >= 1 && shiftWorkDays <= 365) {
      base.shiftWorkDays = shiftWorkDays;
    }
    const shiftRestDays = Number(raw.shiftRestDays);
    if (Number.isInteger(shiftRestDays) && shiftRestDays >= 1 && shiftRestDays <= 365) {
      base.shiftRestDays = shiftRestDays;
    }
    if (dateValid(raw.shiftStartDate)) base.shiftStartDate = raw.shiftStartDate;
    if (timeValid(raw.shiftStartTime)) base.shiftStartTime = raw.shiftStartTime;
    if (timeValid(raw.shiftEndTime)) base.shiftEndTime = raw.shiftEndTime;

    const tail = Number(raw.tailDigits);
    if (TAILS.includes(tail)) base.tailDigits = tail;

    base.days = normalizeDays(raw.days);
    base.paydays = normalizePaydays(raw.paydays);
    base.visibility = normalizeVisibility(raw.visibility);

    return base;
  }

  function load() {
    let raw = null;
    try {
      const str = localStorage.getItem(KEY);
      if (str) raw = JSON.parse(str);
    } catch (e) {
      raw = null;
    }
    const existed = raw !== null;
    const normalized = normalize(raw);

    if (!existed || JSON.stringify(raw) !== JSON.stringify(normalized)) {
      try { localStorage.setItem(KEY, JSON.stringify(normalized)); } catch (e) { }
    }
    return { config: normalized, existed };
  }

  function save(config) {
    const normalized = normalize(config);
    try { localStorage.setItem(KEY, JSON.stringify(normalized)); } catch (e) { }
    return normalized;
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(PERIOD_KEY);
    } catch (e) { }
  }

  function defaults() {
    return normalize(null);
  }

  function savePeriod(p) {
    try { localStorage.setItem(PERIOD_KEY, p); } catch (e) { }
  }

  function loadPeriod() {
    try { return localStorage.getItem(PERIOD_KEY); } catch (e) { return null; }
  }

  global.Storage = { load, save, clear, defaults, savePeriod, loadPeriod, KEY, PERIOD_KEY };
})(window);