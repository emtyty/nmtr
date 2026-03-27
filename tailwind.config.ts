import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'Fira Code', 'monospace']
      },
      colors: {
        // nmtr dark palette
        canvas: {
          default: '#1e1e24',
          subtle: '#2a2a32',
          inset: '#17171d',
          hover: '#363640',
          overlay: '#2d2d35'
        },
        border: {
          default: '#3f3f4a',
          muted: '#33333d'
        },
        fg: {
          default: '#e2e2e8',
          muted: '#8b8b98',
          subtle: '#6b6b78'
        },
        accent: {
          blue: '#34d399',    // emerald — primary accent (kept as accent-blue for compat)
          green: '#34d399',
          yellow: '#f59e0b',
          red: '#ef4444',
          orange: '#fb923c'
        }
      }
    }
  },
  plugins: []
}

export default config
