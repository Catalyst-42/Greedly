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

  function dateAtTime(dateString, timeString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hours, minutes] = timeString.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  function shiftWindow(date, config) {
    const start = new Date(date);
    const [hours, minutes] = config.shiftStartTime.split(':').map(Number);
    start.setHours(hours, minutes, 0, 0);
    const end = new Date(start);
    const [endHours, endMinutes] = config.shiftEndTime.split(':').map(Number);
    end.setHours(endHours, endMinutes, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    return { start, end };
  }

  function isShiftCycleWorkDate(date, config) {
    const cycleStart = dateAtTime(config.shiftStartDate, config.shiftStartTime);
    const startDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
    const currentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const elapsedDays = Math.floor((currentDay - startDay) / 86400000);
    const cycleLength = config.shiftWorkDays + config.shiftRestDays;
    const position = ((elapsedDays % cycleLength) + cycleLength) % cycleLength;
    return position < config.shiftWorkDays;
  }

  // Is this date a working day per schedule + production calendar?
  function isWorkingDay(date, config) {
    const prod = isProdWorkingDay(date, config);
    if (config.scheduleMode === 'shift') {
      if (prod !== null) return prod;
      return isShiftCycleWorkDate(date, config);
    }
    if (prod !== null) return prod;
    const idx = (date.getDay() + 6) % 7;
    const day = config.days[idx];
    return day && !day.off;
  }

  function todayShift(now, config) {
    if (config.scheduleMode === 'shift') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const candidates = [today, new Date(today.getTime() - 86400000)];
      for (const candidate of candidates) {
        if (!isWorkingDay(candidate, config)) continue;
        const window = shiftWindow(candidate, config);
        if (now >= window.start && now < window.end) {
          return {
            off: false,
            start: config.shiftStartTime,
            end: config.shiftEndTime,
            ratio: (now - window.start) / (window.end - window.start),
            finished: false,
            remainingMin: Math.max(0, (window.end - now) / 60000),
            working: true,
            durationMinutes: (window.end - window.start) / 60000,
            shiftDate: candidate
          };
        }
      }
      if (isWorkingDay(today, config)) {
        const window = shiftWindow(today, config);
        if (now < window.start) {
          return {
            off: false,
            start: config.shiftStartTime,
            end: config.shiftEndTime,
            ratio: 0,
            finished: false,
            remainingMin: (window.end - now) / 60000,
            working: false,
            durationMinutes: (window.end - window.start) / 60000,
            shiftDate: today
          };
        }
        return {
          off: false,
          start: config.shiftStartTime,
          end: config.shiftEndTime,
          ratio: 1,
          finished: true,
          remainingMin: 0,
          working: false,
          durationMinutes: (window.end - window.start) / 60000,
          shiftDate: today
        };
      }
      return { off: true };
    }
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
    if (config.scheduleMode === 'shift') {
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const limit = Math.min(now.getTime(), dayEnd.getTime());
      let total = 0;
      for (const shiftDate of [dayStart, new Date(dayStart.getTime() - 86400000)]) {
        if (!isWorkingDay(shiftDate, config)) continue;
        const window = shiftWindow(shiftDate, config);
        const from = Math.max(window.start.getTime(), dayStart.getTime());
        const to = Math.min(window.end.getTime(), limit);
        if (to > from) total += (to - from) / 60000;
      }
      return total;
    }
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

    if (config.scheduleMode === 'shift') {
      const periodStart = start.getTime();
      let total = 0;
      let cursor = new Date(start.getTime() - 86400000);
      while (cursor <= now) {
        if (isWorkingDay(cursor, config)) {
          const window = shiftWindow(cursor, config);
          const from = Math.max(window.start.getTime(), periodStart);
          const to = Math.min(window.end.getTime(), now.getTime());
          if (to > from) {
            const duration = (window.end - window.start) / 60000;
            const perMin = dayRateForMonth(cursor, config) / duration;
            total += (to - from) / 60000 * perMin;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return { base: total, at: now.getTime() };
    }

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
    if (config.scheduleMode === 'shift') {
      const shift = todayShift(now, config);
      if (shift.off || !shift.working || !shift.durationMinutes) return 0;
      return dayRateForMonth(shift.shiftDate, config) / shift.durationMinutes;
    }
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