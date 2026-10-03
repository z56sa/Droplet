/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/dashboard/server.js',
    './src/dashboard/public/**/*.{html,js}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
