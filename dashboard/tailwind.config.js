/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ---- Semantic surface scale (warm near-black, Linear/Vercel inspired) ---- */
        canvas: '#121313',
        surface: {
          DEFAULT: '#191A1A',
          raised: '#1F2121',
          overlay: '#252727',
          'overlay-2': '#2C2E2E',
        },
        line: {
          DEFAULT: '#252727',
          strong: '#2E3030',
          subtle: '#1F2121',
        },
        /* ---- Brand (existing cyan accent, preserved) ---- */
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#35c9da',
          400: '#1fb8cd',
          500: '#1FB8CD',
          600: '#1aa5b8',
          700: '#178694',
          800: '#166b76',
          900: '#155962',
        },
        /* ---- Status (500/600 keys kept for legacy class compat) ---- */
        success: { DEFAULT: '#22c55e', 500: '#10b981', 600: '#059669', subtle: '#12261c', border: '#1c3d2c' },
        warning: { DEFAULT: '#f59e0b', 500: '#f59e0b', 600: '#d97706', subtle: '#2a1f0d', border: '#3f3117' },
        error: { 500: '#ef4444', 600: '#dc2626' },
        danger: { DEFAULT: '#ef4444', subtle: '#2a1414', border: '#3f1f1f' },
        info: { DEFAULT: '#38bdf8', subtle: '#0d2029', border: '#173440' },
        /* ---- Text ---- */
        ink: {
          DEFAULT: '#E9EAEA',
          muted: '#9CA1A1',
          subtle: '#707676',
          faint: '#565B5B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.125rem' }],
        'xs': ['0.8125rem', { lineHeight: '1.25rem' }],
        'sm': ['0.875rem', { lineHeight: '1.375rem' }],
        'base': ['1rem', { lineHeight: '1.625rem' }],
        'lg': ['1.125rem', { lineHeight: '1.625rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.375rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }],
      },
      borderRadius: {
        'DEFAULT': '6px',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'card': '0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.35)',
        'pop': '0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)',
        'ring': '0 0 0 1px rgba(31,184,205,0.35)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'fade-up': 'fadeUp 0.25s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)',
        'shimmer': 'shimmer 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        shimmer: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.85' },
        },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
