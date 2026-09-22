(function (global) {
  'use strict';

  function Odometer(container) {
    this.container = container;
    this.tailDigits = 2;
    this.currency = '₽';
  }

  Odometer.prototype.setTailDigits = function (digits) {
    this.tailDigits = digits;
  };

  Odometer.prototype.setCurrency = function (currency) {
    this.currency = currency;
  };

  Odometer.prototype.render = function (value) {
    const fixed = value.toFixed(this.tailDigits);
    const parts = fixed.split('.');
    const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const display = this.tailDigits > 0
      ? `${integer},${parts[1]}`
      : integer;

    if (!this.container.firstElementChild) {
      this.container.innerHTML =
        '<span class="odometer-value"></span><span class="odometer-currency"></span>';
    }

    const valueElement = this.container.querySelector('.odometer-value');
    const currencyElement = this.container.querySelector('.odometer-currency');

    if (window.I18n && window.I18n.currencyBefore()) {
      this.container.replaceChildren(currencyElement, valueElement);
    } else {
      this.container.replaceChildren(valueElement, currencyElement);
    }
    valueElement.textContent = display;
    currencyElement.textContent = this.currency;
  };

  global.Odometer = Odometer;
})(window);