import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FAF6F0',   // bg
          100: '#F5EFE6',  // bgWarm
          200: '#F0EAE0',  // borderLight
          300: '#E8E0D4',  // border
        },
        brown: {
          800: '#2C2420',  // sidebar / text
          700: '#3D342E',  // sidebarHover
          500: '#7A6E62',  // textSec
          300: '#B5AA9E',  // textMut
        },
        caramel: {
          DEFAULT: '#C47D3F', // primary
          light: '#D4956A',
          bg: '#FDF5ED',
        },
        olive: {
          DEFAULT: '#5B8C5A', // green
          light: '#E8F3E8',
        },
        amber: {
          DEFAULT: '#D4940E', // gold
          bg: '#FFFCF0',
        },
        danger: {
          DEFAULT: '#C0534F',
          light: '#FDF0EF',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Noto Serif SC', 'PingFang SC', 'serif'],
        sans: ['PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '20px',
        'button': '14px',
        'tag': '20px',
        'sidebar': '24px',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease',
        'scale-in': 'scaleIn 0.3s ease',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
