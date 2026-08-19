/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          950: '#070d18',
          900: '#0b1524',
          850: '#101d31',
          800: '#16263e',
          700: '#1f3453',
          600: '#2c4670',
        },
        lime: {
          DEFAULT: '#c8ff3c',
          soft: '#e2ff8f',
          deep: '#9fd400',
        },
        flame: '#ff7a45',
        aqua: '#38e1ff',
        grape: '#a78bfa',
        gold: '#ffc93c',
      },
      fontFamily: {
        display: ['"Archivo Black"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(200,255,60,.25), 0 8px 32px -8px rgba(200,255,60,.35)',
        card: '0 10px 40px -12px rgba(0,0,0,.6)',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(200,255,60,.5)' },
          '70%': { boxShadow: '0 0 0 18px rgba(200,255,60,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(200,255,60,0)' },
        },
      },
      animation: {
        pop: 'pop .25s cubic-bezier(.2,.9,.3,1.4)',
        pulseRing: 'pulseRing 2s infinite',
      },
    },
  },
  plugins: [],
}
