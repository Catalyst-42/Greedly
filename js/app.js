(function (global) {
  'use strict';

  const Storage = global.Storage;
  const Schedule = global.Schedule;
  const Counter = global.Counter;

  let config = null;
  let period = 'month';
  let baseState = null;
  let baseInterval = null;
  let odometerFrame = null;
  let odometer = null;
  let settingsSnapshot = null;
  let settingsPeriodSnapshot = null;

  const els = {};

  function cacheEls() {
    els.odometer = document.getElementById('odometer');
    els.shiftBlock = document.getElementById('shift-progress');
    els.shiftBar = document.getElementById('shift-bar');
    els.shiftStart = document.getElementById('shift-start');
    els.shiftEnd = document.getElementById('shift-end');
    els.shiftRemaining = document.getElementById('shift-remaining');
    els.periodSwitch = document.getElementById('period-switch');
    els.workdays = document.getElementById('stat-workdays');
    els.paydays = document.getElementById('stat-paydays');
    els.dayrate = document.getElementById('stat-dayrate');
    els.hourrate = document.getElementById('stat-hourrate');
    els.periodSwitchWrap = document.getElementById('period-switch-wrap');
    els.statsGrid = document.getElementById('stats-grid');
    els.calendar = document.getElementById('work-calendar');
    els.calendarDays = document.getElementById('calendar-days');
  }

  function markActivePeriod() {
    els.periodSwitch.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.period === period);
    });
  }

  function applyVisibility() {
    const visibility = config.visibility;
    const blocks = [
      ['stat-card-workdays', visibility.workdays],
      ['stat-card-paydays', visibility.paydays],
      ['stat-card-dayrate', visibility.dayrate],
      ['stat-card-hourrate', visibility.hourrate]
    ];

    blocks.forEach(([id, visible]) => {
      document.getElementById(id).classList.toggle('d-none', !visible);
    });
    const visibleStats = blocks.filter(([, visible]) => visible).length;
    const visibleStatElements = blocks
      .map(([id]) => document.getElementById(id))
      .filter(element => !element.classList.contains('d-none'));
    visibleStatElements.forEach((element, index) => {
      element.classList.toggle('stat-item-first', index === 0);
    });
    els.statsGrid.querySelectorAll('.stats-separator').forEach(element => element.remove());
    visibleStatElements.slice(1).forEach(element => {
      const separator = document.createElement('span');
      separator.className = 'stats-separator text-secondary flex-shrink-0';
      separator.textContent = '·';
      separator.setAttribute('aria-hidden', 'true');
      element.before(separator);
    });
    els.statsGrid.classList.toggle(
      'd-none',
      visibleStats === 0
    );
    els.statsGrid.classList.toggle('single-visible', visibleStats === 1);
    els.periodSwitchWrap.classList.toggle('d-none', !visibility.period);
    els.calendar.classList.toggle('d-none', !visibility.calendar);
    document.getElementById('counter-view').classList.toggle(
      'dashboard-no-calendar',
      !visibility.calendar
    );
    if (visibility.calendar) renderCalendar();
    document.getElementById('counter-view').classList.toggle(
      'shift-only',
      visibility.shift && visibleStats === 0 && !visibility.period && !visibility.calendar
    );
    document.getElementById('counter-view').classList.toggle(
      'shift-calendar-only',
      visibility.shift && visibility.calendar && visibleStats === 0 && !visibility.period
    );
    document.getElementById('counter-view').classList.toggle(
      'calendar-only',
      visibility.calendar && !visibility.shift && visibleStats === 0 && !visibility.period
    );
  }

  function renderCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const calendarStart = new Date(firstDay);
    const firstColumn = I18n.weekStartsSunday() ? 0 : 1;
    const leadingDays = (firstDay.getDay() - firstColumn + 7) % 7;
    calendarStart.setDate(calendarStart.getDate() - leadingDays);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    els.calendarDays.replaceChildren();

    function getIsoWeek(date) {
      const thursday = new Date(date);
      thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
      const weekOne = new Date(thursday.getFullYear(), 0, 4);
      return 1 + Math.round((thursday - weekOne) / 604800000);
    }

    function appendEmptyDay() {
      const empty = document.createElement('span');
      empty.className = 'calendar-day calendar-day-empty';
      empty.setAttribute('aria-hidden', 'true');
      els.calendarDays.appendChild(empty);
    }

    function appendDay(date) {
      if (date.getMonth() !== month) {
        appendEmptyDay();
        return;
      }

      const productionStatus = Counter.isProdWorkingDay(date);
      const working = Counter.isWorkingDay(date, config);
      const day = document.createElement('span');
      const isFuture = date > today;
      const isToday = date.getTime() === today.getTime();
      day.className = 'calendar-day';
      if (working && !isFuture) day.classList.add('calendar-day-working');
      else if (working) day.classList.add('calendar-day-future-working');
      else day.classList.add('calendar-day-off');
      if (productionStatus === false) day.classList.add('calendar-day-holiday');
      if (isToday) day.classList.add('calendar-day-today');
      day.setAttribute('aria-label', `${date.getDate()}: ${working ? I18n.t('workingDay') : I18n.t('dayOff')}`);
      els.calendarDays.appendChild(day);
    }

    for (let weekStart = new Date(calendarStart); weekStart <= lastDay; weekStart.setDate(weekStart.getDate() + 7)) {
      const weekNumber = document.createElement('span');
      weekNumber.className = 'calendar-week-number';
      weekNumber.textContent = String(getIsoWeek(weekStart));
      els.calendarDays.appendChild(weekNumber);

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + dayOffset);
        appendDay(date);
      }
    }
  }

  function formatMoney(value, tailDigits) {
    const fixed = value.toFixed(tailDigits);
    const parts = fixed.split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (tailDigits === 0) return intPart;
    return intPart + ',' + parts[1];
  }

  function setMoney(element, value, currency, tailDigits, unit) {
    const amount = document.createTextNode(formatMoney(value, tailDigits));
    const symbol = Object.assign(document.createElement('span'), {
      className: 'muted-currency',
      textContent: currency
    });
    const space = document.createTextNode('\u00a0');
    const unitText = unit ? Object.assign(document.createElement('span'), {
      className: 'stat-label stat-unit',
      textContent: `\u00a0${unit.toLocaleLowerCase(I18n.locale())}`
    }) : null;
    element.replaceChildren(
      amount, space, symbol,
      ...(unitText ? [unitText] : [])
    );
  }

  function recomputeBase() {
    const now = new Date();
    baseState = Counter.computeBase(config, period, now);
  }

  function renderTick() {
    if (baseState && odometer) {
      const now = new Date();
      const shift = Schedule.todayShift(now, config);

      const value = Counter.currentValue(baseState, config, now);
      odometer.render(value);
      els.shiftBlock.style.width = `${els.odometer.offsetWidth}px`;
    }
  }

  function fmtRemaining(mins) {
    const total = Math.max(0, Math.round(mins));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function fmtTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function daysUntilPayday(now, config) {
    const next = Schedule.nextPayday(now, config);
    if (!next) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    const diffMs = target.getTime() - today.getTime();
    return Math.round(diffMs / 86400000);
  }

  function updateStatus() {
    const now = new Date();
    const shift = Schedule.todayShift(now, config);
    const isCurrentlyWorking = Counter.isCurrentlyWorking(config, now);

    const wd = Counter.countWorkingDaysInMonth(now, config);
    els.workdays.textContent = String(wd);

    const dd = daysUntilPayday(now, config);
    els.paydays.textContent = dd === null ? '-' : String(dd);

    const idx = (now.getDay() + 6) % 7;
    const day = config.days[idx];
    let hours = 0;
    if (day && !day.off) {
      const s = Schedule.parseHM(day.start);
      const e = Schedule.parseHM(day.end);
      if (e > s) hours = (e - s) / 60;
    }
    const dr = day && !day.off && hours > 0
      ? Counter.dayRateForMonth(now, config)
      : 0;
    const hr = hours > 0 ? dr / hours : 0;
    setMoney(els.dayrate, hr * hours, I18n.rateCurrency(config.currency), config.tailDigits, I18n.t('dayUnit'));
    setMoney(els.hourrate, hr, I18n.rateCurrency(config.currency), config.tailDigits, I18n.t('hourUnit'));

    if (!config.visibility.shift) {
      els.shiftBlock.classList.add('d-none');
    } else {
      els.shiftBlock.classList.remove('d-none');
      const isDayOff = shift.off;
      const dayProgress = (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 1440;
      els.shiftBlock.classList.toggle('shift-progress-day-off', isDayOff);
      els.shiftBar.style.width = ((isDayOff ? dayProgress : shift.ratio) * 100).toFixed(2) + '%';

      // Add class for finished day to fix width
      if (!isDayOff && shift.finished) {
        els.shiftBar.classList.add('day-finished');
      } else {
        els.shiftBar.classList.remove('day-finished');
      }

      els.shiftStart.textContent = isDayOff ? '' : shift.start;
      els.shiftEnd.textContent = isDayOff ? '' : shift.end;
      if (isDayOff) {
        const clock = document.createElement('i');
        clock.className = 'bi bi-clock shift-clock-icon';
        clock.setAttribute('aria-hidden', 'true');
        els.shiftRemaining.replaceChildren(clock, document.createTextNode(fmtTime(now)));
      } else if (shift.finished) {
        els.shiftRemaining.replaceChildren();
      } else if (!isCurrentlyWorking) {
        els.shiftRemaining.replaceChildren();
      } else {
        const clock = document.createElement('i');
        clock.className = 'bi bi-hourglass-split shift-clock-icon';
        clock.setAttribute('aria-hidden', 'true');
        els.shiftRemaining.replaceChildren(clock, document.createTextNode(fmtRemaining(shift.remainingMin)));
      }
    }
  }

  function startLoops() {
    if (baseInterval === null) {
      baseInterval = setInterval(() => {
        const now = new Date();
        const shift = Schedule.todayShift(now, config);

        // Keep the day-off progress clock moving as well.
        if (shift.off || (Counter.isCurrentlyWorking(config, now) && !shift.finished)) {
          recomputeBase();
          updateStatus();
        }
      }, 1000);
    }
    if (odometerFrame === null) {
      const animateOdometer = () => {
        // Only render odometer if currently working
        if (baseState && odometer && Counter.isCurrentlyWorking(config, new Date())) {
          renderTick();
        }
        odometerFrame = requestAnimationFrame(animateOdometer);
      };
      odometerFrame = requestAnimationFrame(animateOdometer);
    }
  }

  function stopLoops() {
    if (baseInterval !== null) { clearInterval(baseInterval); baseInterval = null; }
    if (odometerFrame !== null) {
      cancelAnimationFrame(odometerFrame);
      odometerFrame = null;
    }
  }

  async function applyConfig(newConfig) {
    config = newConfig;
    await I18n.load(config.language);
    markActivePeriod();
    applyVisibility();

    odometer.setTailDigits(config.tailDigits);
    odometer.setCurrency(config.currency);

    recomputeBase();
    updateStatus();
    renderTick();

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    Counter.ensureCalendar(yearStart, yearEnd).then(() => {
      recomputeBase();
      updateStatus();
      renderTick();
      if (config.visibility.calendar) renderCalendar();
    });
  }

  function showCounter() {
    document.getElementById('counter-view').classList.remove('d-none');
    document.getElementById('settings-view').classList.add('d-none');
  }

  function showSettings() {
    document.getElementById('counter-view').classList.add('d-none');
    document.getElementById('settings-view').classList.remove('d-none');
  }

  async function init() {
    cacheEls();

    odometer = new global.Odometer(els.odometer);

    const loaded = Storage.load();
    config = loaded.config;
    await I18n.load(config.language);

    const savedPeriod = Storage.loadPeriod();
    period = savedPeriod && ['day', 'cycle', 'month', 'year'].includes(savedPeriod)
      ? savedPeriod
      : config.period;

    global.Settings.init({
      onChange: async (cfg) => {
        config = cfg;
        period = config.period;
        Storage.savePeriod(period);
        await applyConfig(cfg);
        showCounter();
        startLoops();
      },
      onLanguageChange: async (cfg) => {
        config = cfg;
        period = config.period;
        Storage.savePeriod(period);
        await applyConfig(cfg);
        global.Settings.fillForm(cfg);
      },
      onCancel: async () => {
        if (settingsSnapshot) {
          config = Storage.save(settingsSnapshot);
          period = settingsPeriodSnapshot;
          Storage.savePeriod(period);
          await applyConfig(config);
          settingsSnapshot = null;
        }
        showCounter();
        startLoops();
      },
      onReset: () => {
        location.reload();
      }
    });

    if (!loaded.existed) {
      showSettings();
      global.Settings.show(config);
      return;
    }

    await applyConfig(config);
    showCounter();
    startLoops();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();

    document.getElementById('open-settings').addEventListener('click', () => {
      stopLoops();
      settingsSnapshot = JSON.parse(JSON.stringify(config));
      settingsPeriodSnapshot = period;
      global.Settings.show(config);
      showSettings();
    });

    document.getElementById('period-switch').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-period]');
      if (!btn) return;
      const newPeriod = btn.dataset.period;
      if (newPeriod === period) return;
      period = newPeriod;
      Storage.savePeriod(period);
      markActivePeriod();
      recomputeBase();
      updateStatus();
      renderTick();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && baseState && config) {
        recomputeBase();
        updateStatus();
        renderTick();
      }
    });
  });
})(window);