/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary':   '#07070a',
        'bg-secondary': '#121218',
        'bg-card':      'rgba(22, 22, 32, 0.82)',
        'red-primary':  '#b3123f',
        'red-glow':     '#ff2f6d',
        'purple-primary': '#6d28d9',
        'purple-glow':    '#9f67ff',
        'text-primary':   '#f4f4f5',
        'text-secondary': '#a1a1aa',
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        inter:  ['Inter', 'sans-serif'],
      },
      borderColor: {
        glow: 'rgba(255,255,255,0.08)',
      },
      backdropBlur: {
        nav: '14px',
      },
      animation: {
        'fade-up': 'fadeUp 1s ease forwards',
        'fade-up-slow': 'fadeUp 1.4s ease forwards',
        'fade-up-slower': 'fadeUp 1.8s ease forwards',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
