(function (global) {
  'use strict';

  function parseHM(str) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(str || '');
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function jsDayToIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  // Worked minutes for a specific calendar day, given config.days.
  function workedMinutesForDay(date, config, now) {
    const idx = jsDayToIndex(date.getDay());
    const day = config.days[idx];
    if (!day || day.off) return 0;

    const startMin = parseHM(day.start);
    const endMin = parseHM(day.end);
    if (endMin <= startMin) return 0;

    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (!isToday) {
      return endMin - startMin;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;

    if (nowMin <= startMin) return 0;
    if (nowMin >= endMin) return endMin - startMin;
    return nowMin - startMin;
  }

  function workedMinutesBetween(startDate, endDate, config, now) {
    let total = 0;
    let cursor = startOfDay(startDate);
    const last = startOfDay(endDate);
    while (cursor.getTime() <= last.getTime()) {
      total += workedMinutesForDay(cursor, config, now);
      cursor = addDays(cursor, 1);
    }
    return total;
  }

  function cycleStart(now, config) {
    const paydays = config.paydays;
    if (!paydays || !paydays.length) {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.getDate();

    let candidate = null;
    for (let i = paydays.length - 1; i >= 0; i--) {
      if (paydays[i] <= today) { candidate = paydays[i]; break; }
    }
    if (candidate !== null) {
      return new Date(y, m, candidate);
    }
    const prevMonth = m === 0 ? 11 : m - 1;
    const prevYear = m === 0 ? y - 1 : y;
    const lastPayday = paydays[paydays.length - 1];
    return new Date(prevYear, prevMonth, lastPayday);
  }

  function monthStart(now) {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  function yearStart(now) {
    return new Date(now.getFullYear(), 0, 1);
  }

  function nextPayday(now, config) {
    const paydays = config.paydays;
    if (!paydays || !paydays.length) return null;
    const y = now.getFullYear();
    const m = now.getMonth();
    const today = now.getDate();
    for (let i = 0; i < paydays.length; i++) {
      if (paydays[i] > today) return new Date(y, m, paydays[i]);
    }
    const nextMonth = m === 11 ? 0 : m + 1;
    const nextYear = m === 11 ? y + 1 : y;
    return new Date(nextYear, nextMonth, paydays[0]);
  }

  function formatDate(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}.${m}.${date.getFullYear()}`;
  }

  function todayShift(now, config) {
    const idx = jsDayToIndex(now.getDay());
    const day = config.days[idx];
    if (!day || day.off) return { off: true };

    const startMin = parseHM(day.start);
    const endMin = parseHM(day.end);
    if (endMin <= startMin) return { off: true };

    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;

    let ratio = 0;
    let finished = false;
    if (nowMin <= startMin) ratio = 0;
    else if (nowMin >= endMin) { ratio = 1; finished = true; }
    else ratio = (nowMin - startMin) / (endMin - startMin);

    const remainingMin = Math.max(0, endMin - nowMin);

    return {
      off: false,
      start: day.start,
      end: day.end,
      ratio,
      finished,
      remainingMin,
      working: nowMin >= startMin && nowMin < endMin
    };
  }

  global.Schedule = {
    parseHM,
    workedMinutesForDay,
    workedMinutesBetween,
    cycleStart,
    monthStart,
    yearStart,
    nextPayday,
    formatDate,
    todayShift,
    startOfDay,
    addDays
  };
})(window);