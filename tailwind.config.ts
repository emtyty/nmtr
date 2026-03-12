import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Cascadia Code', 'Consolas', 'Fira Code', 'monospace']
      },
      colors: {
        // Dark theme palette (GitHub dark inspired)
        canvas: {
          default: '#0d1117',
          subtle: '#161b22',
          inset: '#010409'
        },
        border: {
          default: '#30363d',
          muted: '#21262d'
        },
        fg: {
          default: '#e6edf3',
          muted: '#7d8590',
          subtle: '#6e7681'
        },
        accent: {
          blue: '#58a6ff',
          green: '#3fb950',
          yellow: '#d29922',
          red: '#f85149',
          orange: '#db6d28'
        }
      }
    }
  },
  plugins: []
}

export default config
