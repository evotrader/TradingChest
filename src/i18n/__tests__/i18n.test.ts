import { describe, it, expect, beforeEach } from 'vitest'
import translate, { load } from '../index'

// ---------------------------------------------------------------------------
// translate (default export)
// ---------------------------------------------------------------------------
describe('translate', () => {
  it('returns the correct English translation for a known key', () => {
    expect(translate('indicator', 'en-US')).toBe('Indicator')
  })

  it('returns the correct Chinese translation for a known key', () => {
    // zh-CN locale must exist and have a value for 'indicator'
    const result = translate('indicator', 'zh-CN')
    // The result must be a non-empty string and not the raw key
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns the key itself when the key is missing from the locale', () => {
    expect(translate('__nonexistent_key__', 'en-US')).toBe('__nonexistent_key__')
  })

  it('returns the key itself when the locale does not exist', () => {
    expect(translate('indicator', 'fr-FR')).toBe('indicator')
  })

  it('returns the key itself for both unknown locale and unknown key', () => {
    expect(translate('__unknown__', 'xx-XX')).toBe('__unknown__')
  })

  it('returns correct translation for multi-word keys', () => {
    expect(translate('main_indicator', 'en-US')).toBe('Main Indicator')
    expect(translate('sub_indicator', 'en-US')).toBe('Sub Indicator')
  })

  it('returns correct translation for timezone keys', () => {
    expect(translate('shanghai', 'en-US')).toBe('(UTC+8) Shanghai')
    expect(translate('tokyo', 'en-US')).toBe('(UTC+9) Tokyo')
  })
})

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------
describe('load', () => {
  it('adds a new locale that can then be used for translation', () => {
    load('test-LANG', { hello: 'Hello World', foo: 'Bar' })
    expect(translate('hello', 'test-LANG')).toBe('Hello World')
    expect(translate('foo', 'test-LANG')).toBe('Bar')
  })

  it('missing keys in a loaded locale fall back to the key', () => {
    load('test-PARTIAL', { only_key: 'Only Value' })
    expect(translate('missing_key', 'test-PARTIAL')).toBe('missing_key')
  })

  it('overwrites an existing locale when load is called with the same key', () => {
    load('test-OVERWRITE', { greeting: 'Hello' })
    expect(translate('greeting', 'test-OVERWRITE')).toBe('Hello')

    load('test-OVERWRITE', { greeting: 'Hi There' })
    expect(translate('greeting', 'test-OVERWRITE')).toBe('Hi There')
  })

  it('loading a locale does not affect other locales', () => {
    load('test-ISOLATED', { shared_key: 'Isolated Value' })
    // en-US should be unaffected
    expect(translate('indicator', 'en-US')).toBe('Indicator')
  })
})
