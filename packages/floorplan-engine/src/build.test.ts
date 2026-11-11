import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// These checks need a build, which the root `pnpm test` runs first.
const dist = new URL('../dist/', import.meta.url)

/** The relative modules an ES module chunk imports. */
function imports(file: string): string[] {
  const source = readFileSync(new URL(file, dist), 'utf8')
  return [...source.matchAll(/from\s*["']([^"']+)["']/g)].map((match) => match[1]!)
}

/** Every module reachable from an entry, following relative imports only. */
function reachableImports(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    for (const specifier of imports(file)) {
      if (seen.has(specifier)) continue
      seen.add(specifier)
      if (specifier.startsWith('./')) queue.push(specifier.slice(2))
    }
  }
  return seen
}

describe.skipIf(!existsSync(dist))('built entries', () => {
  it.each(['schema.js', 'model.js'])('%s does not load three', (entry) => {
    const specifiers = [...reachableImports(entry)]
    expect(specifiers.filter((s) => s.startsWith('three'))).toEqual([])
  })

  it('index.js imports three without bundling it', () => {
    const specifiers = [...reachableImports('index.js')]
    expect(specifiers).toContain('three')
    expect(readFileSync(new URL('index.js', dist), 'utf8')).not.toContain('WebGLRenderer =')
  })
})
