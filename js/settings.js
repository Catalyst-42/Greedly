(function (global) {
  'use strict';

  const Storage = global.Storage;
  function q(id) { return document.getElementById(id); }

  let onChange = null;
  let onCancel = null;
  let onReset = null;
  let onThemePreview = null;

  function buildDayRows(config) {
    const container = q('days-container');
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const day = config.days[i];
      const row = document.createElement('div');
      row.className = 'day-row';
      row.dataset.index = String(i);

      const label = document.createElement('div');
      label.className = 'day-label';
      label.textContent = global.I18n.dayLabels()[i];

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'form-check-input';
      cb.checked = !day.off;
      cb.dataset.role = 'work';

      const start = document.createElement('input');
      start.type = 'time';
      start.className = 'form-control form-control-sm';
      start.value = day.start;
      start.dataset.role = 'start';
      start.disabled = day.off;

      const dash = document.createElement('span');
      dash.textContent = '-';
      dash.className = 'text-secondary text-center';

      const end = document.createElement('input');
      end.type = 'time';
      end.className = 'form-control form-control-sm';
      end.value = day.end;
      end.dataset.role = 'end';
      end.disabled = day.off;

      cb.addEventListener('change', () => {
        start.disabled = !cb.checked;
        end.disabled = !cb.checked;
      });

      row.append(label, cb, start, dash, end);
      container.appendChild(row);
    }
  }

  function fillForm(config) {
    q('in-language').value = config.language;
    q('in-salary').value = String(config.salary);
    q('in-currency').value = config.currency;
    q('in-period').value = config.period;
    q('in-tail').value = String(config.tailDigits);
    q('in-theme').value = config.theme;
    q('in-paydays').value = config.paydays.join(', ');
    q('show-workdays').checked = config.visibility.workdays;
    q('show-paydays').checked = config.visibility.paydays;
    q('show-dayrate').checked = config.visibility.dayrate;
    q('show-hourrate').checked = config.visibility.hourrate;
    q('show-shift').checked = config.visibility.shift;
    q('show-period').checked = config.visibility.period;
    q('show-calendar').checked = config.visibility.calendar;
    buildDayRows(config);
  }

  function readForm() {
    const language = q('in-language').value;
    const salary = parseFloat(q('in-salary').value);
    const currency = q('in-currency').value;
    const period = q('in-period').value;
    const tailDigits = parseInt(q('in-tail').value, 10);
    const theme = q('in-theme').value;
    const visibility = {
      workdays: q('show-workdays').checked,
      paydays: q('show-paydays').checked,
      dayrate: q('show-dayrate').checked,
      hourrate: q('show-hourrate').checked,
      shift: q('show-shift').checked,
      period: q('show-period').checked,
      calendar: q('show-calendar').checked
    };

    const days = [];
    const rows = q('days-container').querySelectorAll('.day-row');
    rows.forEach(row => {
      const cb = row.querySelector('[data-role="work"]');
      const start = row.querySelector('[data-role="start"]');
      const end = row.querySelector('[data-role="end"]');
      days.push({
        off: !cb.checked,
        start: start.value || '10:00',
        end: end.value || '18:00'
      });
    });

    const paydays = q('in-paydays').value
      .split(/[,\s]+/)
      .map(v => parseInt(v, 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 31);
    const uniqPaydays = Array.from(new Set(paydays)).sort((a, b) => a - b);

    return {
      salary: Number.isFinite(salary) && salary >= 0 ? salary : 0,
      language,
      currency,
      period,
      tailDigits,
      theme,
      days,
      paydays: uniqPaydays.length ? uniqPaydays : [10, 25],
      visibility
    };
  }

  function show(config) {
    fillForm(config);
    q('settings-view').classList.remove('d-none');
    q('counter-view').classList.add('d-none');
  }

  function hide() {
    q('settings-view').classList.add('d-none');
    q('counter-view').classList.remove('d-none');
  }

  function init(callbacks) {
    onChange = callbacks.onChange;
    const onLanguageChange = callbacks.onLanguageChange;
    onCancel = callbacks.onCancel;
    onReset = callbacks.onReset;
    onThemePreview = callbacks.onThemePreview;

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || q('settings-view').classList.contains('d-none')) return;
      event.preventDefault();
      q('save-settings').click();
    });

    q('save-settings').addEventListener('click', () => {
      const cfg = Storage.save(readForm());
      hide();
      onChange(cfg);
    });

    q('apply-language').addEventListener('click', () => {
      const cfg = Storage.save(readForm());
      onLanguageChange(cfg);
    });

    q('in-theme').addEventListener('change', () => {
      if (onThemePreview) onThemePreview(q('in-theme').value);
    });

    q('cancel-settings').addEventListener('click', () => {
      hide();
      onCancel();
    });

    q('close-settings').addEventListener('click', () => {
      q('cancel-settings').click();
    });

    q('reset-settings').addEventListener('click', () => {
      Storage.clear();
      onReset();
    });
  }

  global.Settings = { init, show, hide, fillForm, readForm };
})(window);