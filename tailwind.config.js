/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Synthetic Architect Color System
        'synth': {
          bg: '#131313',
          surface: '#1b1b1b',
          'surface-high': '#2a2a2a',
          'surface-highest': '#353535',
          border: '#474747',
          'border-subtle': 'rgba(255, 255, 255, 0.05)',
          text: '#e2e2e2',
          'text-secondary': '#919191',
          'text-muted': '#5e5e5e',
          cyan: '#00ebf9',
          'cyan-dim': '#004f54',
          'cyan-glow': 'rgba(0, 235, 249, 0.5)',
          violet: '#cdbdff',
          'violet-dim': '#4f00d0',
          error: '#93000a',
          'error-text': '#ffdad6',
          success: '#00ebf9',
        }
      },
      fontFamily: {
        headline: ['"Space Grotesk"', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        mono: ['"Space Grotesk"', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wire-pulse': 'wire-pulse 2s infinite ease-in-out',
        'terminal-blink': 'terminal-blink 1s step-end infinite',
      },
      keyframes: {
        'wire-pulse': {
          '0%, 100%': { opacity: '0.4', filter: 'drop-shadow(0 0 2px #00ebf9)' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 8px #00ebf9)' },
        },
        'terminal-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'radial-gradient(#ffffff 0.5px, transparent 0.5px)',
      },
    },
  },
  plugins: [],
}