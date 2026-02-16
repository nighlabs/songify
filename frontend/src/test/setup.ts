import '@testing-library/jest-dom'

// Node.js 22+ provides a built-in localStorage that doesn't work without
// --localstorage-file. This broken object shadows jsdom's implementation,
// causing Zustand's persist middleware to fail. Replace it with a working mock.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (index: number) => [...store.keys()][index] ?? null,
} as Storage
