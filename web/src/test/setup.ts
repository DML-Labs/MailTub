/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'

// Polyfill localStorage for jsdom
class LocalStorageMock {
  private store: Record<string, string> = {}
  clear() { this.store = {} }
  getItem(key: string) { return this.store[key] ?? null }
  setItem(key: string, value: string) { this.store[key] = String(value) }
  removeItem(key: string) { delete this.store[key] }
  get length() { return Object.keys(this.store).length }
  key(index: number) { return Object.keys(this.store)[index] ?? null }
}

Object.defineProperty(window, 'localStorage', { value: new LocalStorageMock() })

// Silence noisy console.error in tests (React prop warnings etc.)
const consoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = args[0]?.toString() ?? ''
    if (
      msg.includes('Warning:') ||
      msg.includes('ReactDOM.render') ||
      msg.includes('act(')
    ) return
    consoleError(...args)
  }
})
afterAll(() => { console.error = consoleError })
