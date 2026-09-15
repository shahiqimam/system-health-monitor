import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        up: '#16a34a',
        degraded: '#d97706',
        down: '#dc2626',
        unknown: '#64748b',
        paused: '#475569',
      },
    },
  },
  plugins: [],
};

export default config;
