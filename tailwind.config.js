/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Terminal/brutalist palette — see design_handoff_parasite_home
        background: '#000000', // pure-black screen
        card: '#0a0a0b', // card fill
        foreground: '#ffffff', // hero numbers / current values
        'text-high': '#f2f2f3', // card titles
        'text-value': '#e0e0e2', // table/stat values
        'text-secondary': '#c8c8ca', // wallet address
        // `secondary` = card fill so existing `bg-secondary` usages re-map cleanly
        secondary: '#0a0a0b',
        'secondary-hover': '#151517',
        surface: '#0a0a0b',
        'surface-elevated': '#1c1c1e',
        primary: '#f4f4f5', // active chip / light accent
        'primary-hover': '#e6e6e8',
        muted: '#8a8a8d', // labels, dimmed hashrate
        dim: '#6a6a6c', // small-caps labels
        faint: '#5a5a5c', // axis labels, sub-lines
        highlight: '#e0e0e2',
        'highlight-hover': '#f2f2f3',
        // Hairlines
        border: 'rgba(255,255,255,0.13)', // card border
        'border-light': 'rgba(255,255,255,0.07)', // row divider
        'border-strong': 'rgba(255,255,255,0.4)',
        // Status — the ONLY hues in the UI
        success: '#37d17a', // worker up
        danger: '#ff5247', // worker down
        'danger-tint': '#e6a5a0', // down-worker name
        warning: '#facc15', // miner temp warning (68°C)
        info: '#3b82f6',
      },
      fontFamily: {
        // Space Mono → all data/labels; Space Grotesk → titles/prose
        mono: ['SpaceMono_400Regular', 'Courier', 'monospace'],
        'mono-bold': ['SpaceMono_700Bold', 'Courier', 'monospace'],
        display: ['SpaceGrotesk_400Regular', 'sans-serif'],
        'display-medium': ['SpaceGrotesk_500Medium', 'sans-serif'],
        'display-semibold': ['SpaceGrotesk_600SemiBold', 'sans-serif'],
        'display-bold': ['SpaceGrotesk_700Bold', 'sans-serif'],
      },
    },
  },
  darkMode: 'class',
  plugins: [],
};
