import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    // @viox/ui ships raw TSX (transpilePackages) — scan it for classes.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-jost)', 'Jost', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
