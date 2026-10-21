import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualDshInstallLayout,
  assertResolutionWorkBudget,
  buildDualDshRegistry,
  MAX_RESOLUTION_WORK_UNITS,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@deepseek-ai/dsh': '0.2.0', 'dsh-previous': 'npm:@deepseek-ai/dsh@0.1.0' } },
      'node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
      'node_modules/@deepseek-ai/dsh': {
        version: '0.2.0',
        dependencies: { '@deepseek-ai/dsh-child': '^0.2.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/@deepseek-ai/dsh-child': {
        version: '0.2.0',
        dependencies: { '@deepseek-ai/dsh-leaf': '^0.2.0' },
      },
      'node_modules/@deepseek-ai/dsh-leaf': { version: '0.2.0' },
      'node_modules/dsh-previous': {
        name: '@deepseek-ai/dsh',
        version: '0.1.0',
        dependencies: { '@deepseek-ai/dsh-child': '^0.1.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-child': {
        version: '0.1.0',
        dependencies: { '@deepseek-ai/dsh-leaf': '^0.1.0' },
      },
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-leaf': { version: '0.1.0' },
    },
  }
}

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every DSH package', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.1-rc.2', {
        name: '@deepseek-ai/dsh',
        version: '0.1.1-rc.2',
        dependencies: { '@deepseek-ai/dsh-child': '^0.1.1-rc.2', '@deepseek-ai/dsh-child': '^0.1.1-rc.2', 'dsh-better-sidebar': '0.19.0-alpha.1' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      }]])],
      ['@deepseek-ai/dsh-child', new Map([['0.1.1-rc.2', {
        name: '@deepseek-ai/dsh-child',
        version: '0.1.1-rc.2',
      }]])],
      ['@deepseek-ai/cordis', new Map([['4.0.1', {
        name: '@deepseek-ai/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@deepseek-ai/dsh')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@deepseek-ai/dsh')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@deepseek-ai/dsh-child': '^0.1.0', '@deepseek-ai/dsh-child': '^0.1.0' },
      peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
    })
    expect(dual.get('@deepseek-ai/dsh')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@deepseek-ai/dsh-child': '^0.2.0' },
    })
    expect(dual.get('@deepseek-ai/cordis')).toBe(index.get('@deepseek-ai/cordis'))
    expect(dual.get('@deepseek-ai/dsh')?.get('0.1.0')?.dependencies).not.toHaveProperty('dsh-better-sidebar')
    expect([...dual.get('@deepseek-ai/dsh')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@deepseek-ai/dsh')?.get('0.1.0')).toMatchObject({
      name: '@deepseek-ai/dsh',
      version: '0.1.0',
      dependencies: { '@deepseek-ai/dsh-child': '^0.1.0' },
    })
    expect(dual.get('@deepseek-ai/dsh-child')?.get('0.2.0')).toMatchObject({
      name: '@deepseek-ai/dsh-child',
      version: '0.2.0',
    })
  })

  it('keeps a fork-scoped preinstalled plugin on its own version', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh', new Map([['0.1.5-rc.2', {
        name: '@deepseek-ai/dsh',
        version: '0.1.5-rc.2',
        dependencies: { '@deepseek-ai/dsh-session-timeline': '0.1.0' },
      }]])],
      ['@deepseek-ai/dsh-session-timeline', new Map([['0.1.0', {
        name: '@deepseek-ai/dsh-session-timeline',
        version: '0.1.0',
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.5-rc.2')

    expect([...dual.get('@deepseek-ai/dsh')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@deepseek-ai/dsh')?.get('0.1.0')?.dependencies).not.toHaveProperty(
      '@deepseek-ai/dsh-session-timeline',
    )
    expect([...dual.get('@deepseek-ai/dsh-session-timeline')?.keys() ?? []]).toEqual(['0.1.0'])
    expect(dual.get('@deepseek-ai/dsh-session-timeline')?.get('0.1.0')).toMatchObject({
      name: '@deepseek-ai/dsh-session-timeline',
      version: '0.1.0',
    })
  })

  it('does not rewrite a scoped preinstalled plugin onto the synthetic versions', () => {
    const index: RegistryIndex = new Map([
      ['@deepseek-ai/dsh-web-app', new Map([['0.1.5-rc.3', {
        name: '@deepseek-ai/dsh-web-app',
        version: '0.1.5-rc.3',
        dependencies: {
          '@deepseek-ai/dsh-child': 'workspace:^',
          '@deepseek-ai/dsh-better-sidebar': '0.19.3',
        },
      }]])],
      ['@deepseek-ai/dsh-child', new Map([['0.1.5-rc.3', {
        name: '@deepseek-ai/dsh-child',
        version: '0.1.5-rc.3',
      }]])],
      ['@deepseek-ai/dsh-better-sidebar', new Map([['0.19.3', {
        name: '@deepseek-ai/dsh-better-sidebar',
        version: '0.19.3',
      }]])],
    ])

    const dual = buildDualDshRegistry(index, '0.1.5-rc.3')

    expect(dual.get('@deepseek-ai/dsh-web-app')?.get('0.2.0')?.dependencies).toEqual({
      '@deepseek-ai/dsh-child': '^0.2.0',
    })
    expect(dual.get('@deepseek-ai/dsh-better-sidebar')?.get('0.19.3')).toMatchObject({
      name: '@deepseek-ai/dsh-better-sidebar',
      version: '0.19.3',
    })
    expect(dual.get('@deepseek-ai/dsh-better-sidebar')?.has('0.2.0')).toBe(false)
  })

  it('accepts isolated DSH releases with one shared Cordis installation', () => {
    expect(assertDualDshInstallLayout(validLayout())).toEqual({
      dshPackagesPerVersion: 3,
      checkedDshEdges: 4,
    })
  })

  it.each([
    ['react', 'node_modules/react'],
    ['react-dom', 'node_modules/react-dom'],
    ['react', 'node_modules/dsh-previous/node_modules/react'],
    ['react-dom', 'node_modules/dsh-previous/node_modules/react-dom'],
  ])('rejects browser runtime %s installed at %s in the DSH-only consumer', (name, path) => {
    const layout = validLayout()
    const packages = { ...layout.packages, [path]: { version: '18.3.1' } }
    expect(() => assertDualDshInstallLayout({ ...layout, packages })).toThrow(
      `${path}: ${name} is a browser build input`,
    )
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-leaf')

    expect(() => assertDualDshInstallLayout({ ...layout, packages })).toThrow(
      'node_modules/dsh-previous/node_modules/@deepseek-ai/dsh-child: dependencies '
      + '@deepseek-ai/dsh-leaf resolves to node_modules/@deepseek-ai/dsh-leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/dsh-previous/node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualDshInstallLayout({ ...layout, packages })).toThrow(
      'expected one shared @deepseek-ai/cordis',
    )
  })
})

describe('resolution work budget', () => {
  it('accepts the measured dual-release graph', () => {
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: 277, checkedDshEdges: 2524 }))
      .toBe(699_148)
  })

  it('accepts a graph exactly at the budget and rejects one internal edge above it', () => {
    const packages = 350
    const edgesAtBudget = Math.floor(MAX_RESOLUTION_WORK_UNITS / packages)

    expect(packages * edgesAtBudget).toBe(MAX_RESOLUTION_WORK_UNITS)
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: packages, checkedDshEdges: edgesAtBudget }))
      .toBe(MAX_RESOLUTION_WORK_UNITS)
    expect(() => assertResolutionWorkBudget({
      dshPackagesPerVersion: packages,
      checkedDshEdges: edgesAtBudget + 1,
    })).toThrow(`= ${String(MAX_RESOLUTION_WORK_UNITS + packages)} unit(s), budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)`)
  })

  it('accepts the headroom and rejects a runaway graph with its own measured counts', () => {
    expect(assertResolutionWorkBudget({ dshPackagesPerVersion: 300, checkedDshEdges: 2800 }))
      .toBe(840_000)
    expect(() => assertResolutionWorkBudget({ dshPackagesPerVersion: 400, checkedDshEdges: 3000 }))
      .toThrow('400 package(s) per release x 3000 internal edge(s) = 1200000 unit(s), budget 875000 unit(s)')
  })
})
