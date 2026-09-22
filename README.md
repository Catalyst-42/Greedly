# Greedly

Do you want to count your money whie you at work? Now you can do this with Greedly. This repo is a simple GUI web application that shows your money gain progress.

## Images

Main screen:

![English](<img/Greedly - English.png>)

![China](<img/Greedly - China.png>)

Settings: 

![Settings](<img/Greedly - Settings.png>)

## Features

- Live earnings counter with configurable decimal precision.
- Daily, pay-cycle, monthly, and yearly views.
- Monthly salary, daily rate, and hourly rate calculations.
- Configurable weekly schedule with working and non-working days.
- Shift progress bar with start time, end time, and remaining time.
- Optional monthly work calendar with week numbers.
- Configurable visibility for statistics, shift progress, period selector, and calendar.
- Payday dates with support for multiple dates per month.
- Russian, English, and Chinese interface translations.
- Locale-aware currency placement and calendar week order.
- Persistent settings stored in browser `localStorage`.
- Custom favicon and responsive Bootstrap-based layout.

## Calendar Data

The Russian locale can use the production calendar from `isdayoff.ru` to account for Russian holidays and transferred working days.

For English and Chinese locales, the browser-only version intentionally relies on the configured weekly schedule instead of a country-specific production calendar. This keeps the app independent from a backend or Python runtime.

## Running Locally

Greedly is a static browser application. Serve the project directory with any local HTTP server so that translation JSON files can be loaded correctly.

For example, with Python:

```bash
python3 -m http.server 8000
```

Then open [localhost:8000](http://localhost:8000) to view an app.

## Storage

User preferences are stored locally in the browser. No account or external application server is required for the core tracker.

Use the reset button in Settings to remove the saved configuration and return to the defaults.

## Notes

Source code was generated with Codex and DeepSeek, please do not use it for learning
