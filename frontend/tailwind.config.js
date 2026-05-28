/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark mode surfaces
        dark: {
          bg:      '#0f1117',
          surface: '#1a1d23',
          card:    '#1e2330',
          border:  '#2a2f3d',
          hover:   '#252a38',
        },
        // Light mode surfaces
        light: {
          bg:      '#f4f6fa',
          surface: '#ffffff',
          card:    '#ffffff',
          border:  '#e2e8f0',
          hover:   '#f8fafc',
        },
        // Brand accent
        brand: {
          DEFAULT: '#6366f1',
          hover:   '#4f46e5',
          light:   '#818cf8',
          muted:   '#6366f120',
        },
        // Status colors
        success: '#22c55e',
        warning: '#f59e0b',
        danger:  '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-in':   'slideIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn:   { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      },
    },
  },
  plugins: [],
}
