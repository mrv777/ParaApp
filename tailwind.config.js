/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Exact values from parasitepool/parastats globals.css
        background: '#0a0a0a',
        foreground: '#ededed',
        primary: '#444444',
        'primary-hover': '#555555',
        secondary: '#222222',
        'secondary-hover': '#333333',
        muted: '#666666',
        highlight: '#888888',
        'highlight-hover': '#999999',
        border: '#444444',
        'accent-1': '#cccccc',
        'accent-2': '#aaaaaa',
        'accent-3': '#777777',
        // App-specific (temperature warnings)
        warning: '#facc15', // 68°C threshold
        danger: '#ef4444', // 70°C+ threshold
        success: '#22c55e', // Online/healthy status
      },
      fontFamily: {
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
