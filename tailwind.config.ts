import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ableton: {
          bg: '#1c1f26',
          surface: '#262b33',
          panel: '#2c3139',
          panelAlt: '#232830',
          border: '#3a4049',
          text: '#d4d9df',
          muted: '#8f98a3',
          success: '#9fd86d',
          warning: '#ff6a6a',
          accent: '#e4b05d'
        }
      },
      fontFamily: {
        ui: ['Avenir Next', 'Helvetica Neue', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'IBM Plex Mono', 'Menlo', 'monospace']
      },
      boxShadow: {
        pulse: '0 0 0 1px rgba(159, 216, 109, 0.5), 0 0 24px rgba(159, 216, 109, 0.28)',
        downbeat: '0 0 0 1px rgba(159, 216, 109, 0.74), 0 0 36px rgba(159, 216, 109, 0.34)',
        warningPulse: '0 0 0 1px rgba(255, 106, 106, 0.66), 0 0 36px rgba(255, 106, 106, 0.36)'
      }
    }
  },
  plugins: []
};

export default config;
