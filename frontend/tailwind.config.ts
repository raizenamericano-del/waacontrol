const config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        background: '#080b12',
        panel: '#0e131d',
        elevated: '#131b28',
        border: '#202a39',
        muted: '#7e8ba0',
        brand: {
          DEFAULT: '#6ee7b7',
          dark: '#10b981',
          soft: '#a7f3d0'
        }
      },
      boxShadow: {
        glow: '0 0 40px rgba(16, 185, 129, 0.12)',
        card: '0 20px 70px rgba(0, 0, 0, 0.28)'
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(ellipse at top, rgba(16,185,129,.11), transparent 60%)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-soft': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.55' } }
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'pulse-soft': 'pulse-soft 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;
