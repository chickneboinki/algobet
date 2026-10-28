export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        neon: '#4cc9f0',
        baby: '#9fd8ee',
        zinc: {
          50: '#f3f6fb', 100: '#e6ecf5', 200: '#cdd7e6', 300: '#aab8cf', 400: '#8494b0',
          500: '#62728f', 600: '#46546e', 700: '#313d54', 800: '#212b3f', 900: '#161e2e', 950: '#0c111b',
        },
      },
    },
  },
  plugins: [],
}
