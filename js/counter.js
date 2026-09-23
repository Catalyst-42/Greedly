(function (global) {
  'use strict';

  const Schedule = global.Schedule;

  const calendarCache = new Map();
  let calendarFetchPromise = null;

  const ISDAYOFF_BASE = 'https://isdayoff.ru/api/getdata';
  const CC = 'ru';

  function toYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  function parseCalendarString(str, startDate) {
    const result = new Map();
    if (!str) return result;
    const cursor = new Date(startDate);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i) - 48;
      if (code === 0 || code === 1 || code === 2) {
        result.set(toYYYYMMDD(cursor), code);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  function fetchRange(date1, date2) {
    const d1 = toYYYYMMDD(date1);
    const d2 = toYYYYMMDD(date2);
    const url = `${ISDAYOFF_BASE}?date1=${d1}&date2=${d2}&cc=${CC}`;
    return fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('isdayoff failed: ' + r.status);
        return r.text();
      })
      .then(text => parseCalendarString(text, date1))
      .then(map => {
        map.forEach((v, k) => calendarCache.set(k, v));
        return map;
      })
      .catch(() => new Map());
  }

  function usesProductionCalendar(config) {
    return config?.useProductionCalendar !== false
      && (!global.I18n || global.I18n.language() === 'ru');
  }

  function ensureCalendar(start, end, config) {
    if (!usesProductionCalendar(config)) return Promise.resolve();
    const startKey = toYYYYMMDD(start);
    const endKey = toYYYYMMDD(end);
    if (calendarCache.has(startKey) && calendarCache.has(endKey)) {
      return Promise.resolve();
    }
    if (calendarFetchPromise) {
      return calendarFetchPromise.then(() => {
        if (calendarCache.has(startKey) && calendarCache.has(endKey)) return;
        return fetchRange(start, end).then(() => undefined);
      });
    }
    calendarFetchPromise = fetchRange(start, end).then(() => {
      calendarFetchPromise = null;
    });
    return calendarFetchPromise;
  }

  function isProdWorkingDay(date, config) {
    if (!usesProductionCalendar(config)) return null;
    const key = toYYYYMMDD(date);
    if (!calendarCache.has(key)) return null;
    const code = calendarCache.get(key);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    if (isWeekend && code === 1) return null;
    if (!isWeekend && code === 1) return false;
    if (isWeekend && (code === 0 || code === 2)) return true;
    return null;
  }

  // Count working days in a given month (Date for any day of that month).
  function countWorkingDaysInMonth(anyDateInMonth, config) {
    const y = anyDateInMonth.getFullYear();
    const m = anyDateInMonth.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    let count = 0;
    let cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      if (isWorkingDay(cursor, config)) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  // Day rate for a given month.
  function dayRateForMonth(anyDateInMonth, config) {
    const wd = countWorkingDaysInMonth(anyDateInMonth, config);
    if (wd <= 0) return 0;
    return config.salary / wd;
  }

  // Is this date a working day per schedule + production calendar?
  function isWorkingDay(date, config) {
    const prod = isProdWorkingDay(date, config);
    if (prod !== null) return prod;
    const idx = (date.getDay() + 6) % 7;
    const day = config.days[idx];
    return day && !day.off;
  }

  function todayShift(now, config) {
    if (!isWorkingDay(now, config)) return { off: true };
    const idx = (now.getDay() + 6) % 7;
    const day = config.days[idx];
    if (!day || !day.off) return Schedule.todayShift(now, config);
    const overrideConfig = {
      ...config,
      days: config.days.map((item, index) => index === idx ? { ...item, off: false } : item)
    };
    return Schedule.todayShift(now, overrideConfig);
  }

  // Minutes worked on a specific day, up to `now` if it's today.
  function workedMinutesOnDay(date, config, now) {
    if (!isWorkingDay(date, config)) return 0;

    const idx = (date.getDay() + 6) % 7;
    const day = config.days[idx];
    const startMin = Schedule.parseHM(day.start);
    const endMin = Schedule.parseHM(day.end);
    if (endMin <= startMin) return 0;

    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (!isToday) {
      return endMin - startMin;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes() +
      now.getSeconds() / 60 + now.getMilliseconds() / 60000;
    if (nowMin <= startMin) return 0;
    if (nowMin >= endMin) return endMin - startMin;
    return nowMin - startMin;
  }

  // Total earned between startDate (inclusive) and now.
  function computeBase(config, period, now) {
    let start;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'day') {
      start = today;
    } else if (period === 'cycle') {
      start = Schedule.cycleStart(now, config);
    } else if (period === 'year') {
      start = Schedule.yearStart(now);
    } else {
      start = Schedule.monthStart(now);
    }

    // Sum over all days from start to today (inclusive).
    let total = 0;
    let cursor = new Date(start);
    while (cursor.getTime() <= today.getTime()) {
      // Day rate for the month this day belongs to.
      const dr = dayRateForMonth(cursor, config);
      const idx = (cursor.getDay() + 6) % 7;
      const day = config.days[idx];
      const shiftMin = day && isWorkingDay(cursor, config)
        ? Math.max(0, Schedule.parseHM(day.end) - Schedule.parseHM(day.start))
        : 0;

      if (shiftMin <= 0) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const perMin = dr / shiftMin;
      const worked = workedMinutesOnDay(cursor, config, now);
      total += worked * perMin;

      cursor.setDate(cursor.getDate() + 1);
    }

    return { base: total, at: now.getTime() };
  }

  // Rate per minute for the *current* day (used for light extension).
  function currentPerMinute(config, now) {
    const dr = dayRateForMonth(now, config);
    const idx = (now.getDay() + 6) % 7;
    const day = config.days[idx];
    if (!day || !isWorkingDay(now, config)) return 0;
    const shiftMin = Schedule.parseHM(day.end) - Schedule.parseHM(day.start);
    if (shiftMin <= 0) return 0;
    return dr / shiftMin;
  }

  // Is current time within working hours or is the workday finished?
  function isCurrentlyWorking(config, now) {
    const shift = todayShift(now, config);
    return !shift.off && (shift.working || shift.finished);
  }

  function currentValue(state, config, now) {
    const shift = todayShift(now, config);
    
    // If workday is finished, show the last calculated full amount
    if (shift.finished) {
      return state.base;
    }
    
    // Normal calculation for current time
    const elapsedMs = now.getTime() - state.at;
    const perMin = currentPerMinute(config, now);
    const perMs = perMin / 60000;
    return state.base + elapsedMs * perMs;
  }

  global.Counter = {
    computeBase,
    currentValue,
    ensureCalendar,
    isProdWorkingDay,
    countWorkingDaysInMonth,
    dayRateForMonth,
    isWorkingDay,
    todayShift,
    workedMinutesOnDay,
    isCurrentlyWorking,
    fetchRange
  };
})(window);