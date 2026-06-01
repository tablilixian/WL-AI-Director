import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

vi.mock('../src/api/pocketbase', () => ({
  pb: {
    authStore: {
      isValid: false,
      model: null,
      token: '',
      clear: vi.fn(),
      save: vi.fn(),
      onChange: vi.fn(() => vi.fn()),
    },
    collection: vi.fn(() => ({
      getList: vi.fn(() => Promise.resolve({ items: [], totalItems: 0 })),
      getFullList: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
      update: vi.fn(() => Promise.resolve({ id: 'mock-id' })),
      delete: vi.fn(() => Promise.resolve(true)),
      authWithPassword: vi.fn(() => Promise.resolve({ token: 'mock-token', record: { id: 'mock-user' } })),
    })),
  },
}))

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
    init: vi.fn(() => Promise.resolve()),
    language: 'zh-CN',
    use: vi.fn(function() { return this; }),
  },
  t: (key: string) => key,
  init: vi.fn(() => Promise.resolve()),
  language: 'zh-CN',
}))

vi.mock('i18next-browser-languagedetector', () => ({
  default: {
    type: 'languageDetector',
    init: vi.fn(),
    detect: vi.fn(() => 'zh-CN'),
    cacheUserLanguage: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'zh-CN',
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}))
