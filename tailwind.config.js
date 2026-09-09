/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /**
       * Named by role, backed by the tokens in src/index.css.
       *
       * Colours used to be literal hex values repeated across components,
       * which is why there was only one theme. Going through roles is what
       * lets the light theme differ where it must: `line` and `raised` are the
       * same colour in the dark theme and cannot be in the light one.
       */
      colors: {
        app: 'var(--c-app)',
        chrome: 'var(--c-chrome)',
        panel: 'var(--c-panel)',
        'panel-hover': 'var(--c-panel-hover)',
        raised: 'var(--c-raised)',
        'raised-hover': 'var(--c-raised-hover)',
        'overlay-hover': 'var(--c-overlay-hover)',

        line: 'var(--c-line)',
        'line-soft': 'var(--c-line-soft)',
        'line-strong': 'var(--c-line-strong)',

        ink: 'var(--c-ink)',
        'ink-strong': 'var(--c-ink-strong)',
        key: 'var(--c-key)',
        muted: 'var(--c-muted)',
        faint: 'var(--c-faint)',

        danger: 'var(--c-danger)',
        'danger-soft': 'var(--c-danger-soft)',
        warn: 'var(--c-warn)',
        'warn-soft': 'var(--c-warn-soft)',
        'warn-strong': 'var(--c-warn-strong)',
        'warn-strong-hover': 'var(--c-warn-strong-hover)',
        info: 'var(--c-info)',
        'info-soft': 'var(--c-info-soft)',
        success: 'var(--c-success)',
        accent: 'var(--c-accent)',
        'accent-hover': 'var(--c-accent-hover)',
        focus: 'var(--c-focus)',

        str: 'var(--c-str)',
        num: 'var(--c-num)',
        kw: 'var(--c-kw)',
        fn: 'var(--c-fn)',
        ctor: 'var(--c-ctor)'
      }
    }
  },
  plugins: []
};
