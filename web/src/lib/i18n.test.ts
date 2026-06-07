import { describe, it, expect } from 'vitest'
import { I18N, t } from './i18n'

/**
 * Parity guard — the regression test for the "switch language, see the wrong
 * language" class of bug. Every shipped locale must define exactly the same
 * keys as English, and no value may be empty or a leftover placeholder. A new
 * locale that is missing keys (or whose machine-translation emitted "") fails
 * here instead of silently falling back at runtime.
 */
const SHIPPED = Object.keys(I18N) as (keyof typeof I18N)[]

describe('i18n parity', () => {
  const enKeys = Object.keys(I18N.en).sort()

  it('ships at least Vietnamese and English', () => {
    expect(SHIPPED).toContain('vi')
    expect(SHIPPED).toContain('en')
  })

  for (const lang of SHIPPED) {
    it(`${lang} has exactly the English key set`, () => {
      expect(Object.keys(I18N[lang]).sort()).toEqual(enKeys)
    })

    it(`${lang} has no empty or placeholder values`, () => {
      for (const [key, val] of Object.entries(I18N[lang])) {
        expect(val, `${lang}.${key} is empty`).toBeTruthy()
        expect(val.trim().length, `${lang}.${key} is blank`).toBeGreaterThan(0)
        expect(/^(TODO|TBD|XXX|FIXME)/i.test(val), `${lang}.${key} is a placeholder`).toBe(false)
      }
    })
  }

  it('t() returns the value for a known key', () => {
    expect(t('en', 'nav_settings')).toBe(I18N.en.nav_settings)
    expect(t('vi', 'nav_settings')).toBe(I18N.vi.nav_settings)
  })

  it('t() returns the key itself when missing everywhere', () => {
    expect(t('en', '__nope__')).toBe('__nope__')
  })
})
