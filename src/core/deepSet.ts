const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Set a deeply nested property on an object using a dot-separated path.
 * Rejects __proto__/constructor/prototype segments to prevent prototype pollution.
 */
export function deepSet(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (UNSAFE_KEYS.has(key)) return
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key]
  }
  const lastKey = keys[keys.length - 1]
  if (UNSAFE_KEYS.has(lastKey)) return
  current[lastKey] = value
}
