/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070a10',
          900: '#0a0f18',
          850: '#0d131e',
          800: '#111927',
          750: '#151f30',
          700: '#1b2739',
          600: '#26364d',
          500: '#3a4c66',
        },
        mist: {
          50: '#f3f7fd',
          100: '#e4ecf8',
          200: '#c8d7ea',
          300: '#9fb3cd',
          400: '#7c91ad',
          500: '#61758f',
          600: '#4a5c73',
        },
        esp: '#4d9dff',
        ebp: '#37d99b',
        eip: '#b28cff',
        amber: '#f4b860',
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Cascadia Code"',
          '"SFMono-Regular"',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        panel: '0 20px 50px -24px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.035)',
        glowBlue: '0 0 30px -8px rgba(77, 157, 255, 0.45)',
        glowGreen: '0 0 30px -8px rgba(55, 217, 155, 0.4)',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(400%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        scanline: 'scanline 2.6s linear infinite',
        float: 'float 3s ease-in-out infinite',
        pulseSoft: 'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
