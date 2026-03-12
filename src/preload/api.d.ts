import type { NmtrAPI } from './index'

declare global {
  interface Window {
    nmtrAPI: NmtrAPI
  }
}
