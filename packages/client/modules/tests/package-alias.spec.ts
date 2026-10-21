import { describe, expect, it } from 'vitest'
import { aliasedKey, alternateDshPackageName, lookupAliased } from '../src/package-alias.ts'

describe('dsh package name aliases', () => {
  it('maps official product packages onto the fork spelling and back', () => {
    expect(alternateDshPackageName('@deepseek-ai/dsh-client-locale')).toBe('@deepseek-ai/dsh-client-locale')
    expect(alternateDshPackageName('@deepseek-ai/dsh-client-locale/client')).toBe('@deepseek-ai/dsh-client-locale/client')
    expect(alternateDshPackageName('@deepseek-ai/dsh')).toBeUndefined()
    expect(alternateDshPackageName('@deepseek-ai/cordis')).toBeUndefined()
    expect(alternateDshPackageName('dshmarket')).toBeUndefined()
  })

  it('resolves a table keyed by the fork name when the official name is requested', () => {
    const table = new Map<string, string>([[ '@deepseek-ai/dsh-client-locale', 'locale' ]])
    expect(aliasedKey(table, '@deepseek-ai/dsh-client-locale')).toBe('@deepseek-ai/dsh-client-locale')
    expect(lookupAliased(table, '@deepseek-ai/dsh-client-locale')).toBe('locale')
    expect(lookupAliased(table, '@deepseek-ai/dsh-client-locale')).toBe('locale')
    expect(lookupAliased(table, '@deepseek-ai/dsh-missing')).toBeUndefined()
  })
})
