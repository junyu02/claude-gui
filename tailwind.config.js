/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:          '#0C0C0F',
        surface:     '#131316',
        's2':        '#1A1A1E',
        's3':        '#222228',
        t1:          '#ECECF1',
        t2:          '#8B8B96',
        t3:          '#50505A',
        accent:      '#7C5CFC',
        'accent-l':  '#9B82FF',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.07)',
      },
    },
  },
  plugins: [],
}
