import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surface colors — driven by CSS variables; support opacity modifiers
        surface: {
          0: 'rgb(var(--mt-s0) / <alpha-value>)',
          1: 'rgb(var(--mt-s1) / <alpha-value>)',
          2: 'rgb(var(--mt-s2) / <alpha-value>)',
          3: 'rgb(var(--mt-s3) / <alpha-value>)',
          4: 'rgb(var(--mt-s4) / <alpha-value>)',
        },
        // Border colors — CSS variable driven
        border: {
          subtle:  'rgb(var(--mt-bs) / <alpha-value>)',
          DEFAULT: 'rgb(var(--mt-b)  / <alpha-value>)',
          muted:   'rgb(var(--mt-bm) / <alpha-value>)',
          focus:   'rgb(var(--mt-bf) / <alpha-value>)',
        },
        // Semantic text tokens
        primary:   'rgb(var(--mt-text-primary)   / <alpha-value>)',
        secondary: 'rgb(var(--mt-text-secondary) / <alpha-value>)',
        muted:     'rgb(var(--mt-text-muted)     / <alpha-value>)',
        faint:     'rgb(var(--mt-text-faint)     / <alpha-value>)',
        // Accent — emerald brand color
        accent: {
          DEFAULT: '#10b981',
          dim:     '#059669',
          bright:  '#34d399',
          glow:    '#6ee7b7',
        },
        // Keep violet custom scale for any backward-compat usage
        violet: {
          950: '#150030',
          900: '#1e0050',
          800: '#2e0070',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs:    ['11px', { lineHeight: '16px' }],
        sm:    ['12px', { lineHeight: '18px' }],
        base:  ['13px', { lineHeight: '20px' }],
        md:    ['14px', { lineHeight: '22px' }],
        lg:    ['16px', { lineHeight: '24px' }],
        xl:    ['18px', { lineHeight: '28px' }],
        '2xl': ['22px', { lineHeight: '32px' }],
      },
      animation: {
        'fade-in':       'fadeIn 0.15s ease-out',
        'slide-up':      'slideUp 0.2s ease-out',
        'slide-in-left': 'slideInLeft 0.2s ease-out',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':     'spin 2s linear infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:     { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'emerald-glow':    'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(16,185,129,0.10), transparent)',
        'violet-glow':     'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(124,58,237,0.12), transparent)',
      },
      boxShadow: {
        'emerald-sm': '0 0 0 1px rgba(16,185,129,0.22), 0 0 12px rgba(16,185,129,0.08)',
        'emerald-md': '0 0 0 1px rgba(16,185,129,0.32), 0 0 24px rgba(16,185,129,0.13)',
        'violet-sm':  '0 0 0 1px rgba(124,58,237,0.25), 0 0 12px rgba(124,58,237,0.1)',
        'violet-md':  '0 0 0 1px rgba(124,58,237,0.35), 0 0 24px rgba(124,58,237,0.15)',
        'glow-xs':    '0 0 8px rgba(16,185,129,0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config
