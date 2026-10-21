/** Packed-scope rewrite keeps preset plugin names and rewrites family members. */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { releaseFamily } from './families.ts'
import { capture } from './process.ts'
import { packedIdentity, PUBLISH_ORDER_FILE } from './tarball.ts'
import {
  isRewritablePackedFile,
  publishScopeMapping,
  rewritePackedFamilyDirectory,
  rewritePackedTarball,
  rewriteScopedNames,
} from './rewrite-packed-scope.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('publish scope mapping', () => {
  it('rewrites only the family names onto the target scope', () => {
    const mapping = publishScopeMapping(
      ['@deepseek-ai/dsh', '@deepseek-ai/dsh-session'],
      '@x1a0f3n9',
      '@xfcodeai',
    )
    expect(mapping.get('@deepseek-ai/dsh')).toBe('@deepseek-ai/dsh')
    expect(mapping.get('@deepseek-ai/dsh-session')).toBe('@deepseek-ai/dsh-session')
  })

  it('rejects a name outside the source scope', () => {
    expect(() => {
      publishScopeMapping(['@deepseek-ai/dsh'], '@x1a0f3n9', '@xfcodeai')
    }).toThrow(/not in @deepseek-ai/)
  })
})

describe('scoped name rewrite', () => {
  it('does not rewrite a longer non-family name that shares a prefix', () => {
    const mapping = publishScopeMapping(['@deepseek-ai/dsh'], '@x1a0f3n9', '@xfcodeai')
    expect(rewriteScopedNames(
      'require("@deepseek-ai/dsh"); require("@deepseek-ai/dsh-session-timeline")',
      mapping,
    )).toBe('require("@deepseek-ai/dsh"); require("@deepseek-ai/dsh-session-timeline")')
  })

  it('rewrites a family name at the end of the file', () => {
    const mapping = publishScopeMapping(['@deepseek-ai/dsh-session'], '@x1a0f3n9', '@xfcodeai')
    expect(rewriteScopedNames('@deepseek-ai/dsh-session', mapping)).toBe('@deepseek-ai/dsh-session')
  })

  it('leaves a NUL file unrewritable', () => {
    expect(isRewritablePackedFile(Buffer.from('ok'))).toBe(true)
    expect(isRewritablePackedFile(Buffer.from([0x7f, 0x00, 0x45]))).toBe(false)
  })
})

describe('packed tarball rewrite', () => {
  it('rewrites the packed name and leaves a preset plugin specifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-rewrite-tarball-'))
    roots.push(root)
    const extracted = join(root, 'package')
    mkdirSync(extracted)
    writeFileSync(join(extracted, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.5',
      dependencies: {
        '@deepseek-ai/dsh-session': '0.1.5-rc.5',
        '@deepseek-ai/dsh-session-timeline': '0.1.5-xfdsh.2',
      },
    }, null, 2)}\n`)
    writeFileSync(
      join(extracted, 'index.js'),
      'import "@deepseek-ai/dsh-session"; import "@deepseek-ai/dsh-session-timeline";\n',
    )
    const source = join(root, 'x1a0f3n9-dsh-0.1.5-rc.5.tgz')
    capture('tar', ['-czf', source, '-C', root, 'package'])
    writeFileSync(join(root, PUBLISH_ORDER_FILE), 'x1a0f3n9-dsh-0.1.5-rc.5.tgz\n')

    const mapping = publishScopeMapping(
      ['@deepseek-ai/dsh', '@deepseek-ai/dsh-session'],
      '@x1a0f3n9',
      '@xfcodeai',
    )
    const filename = rewritePackedTarball(source, root, mapping)
    expect(filename).toBe('xfcodeai-dsh-0.1.5-rc.5.tgz')
    expect(packedIdentity(join(root, filename))).toEqual({
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.5',
    })
    const js = capture('tar', ['-xOzf', join(root, filename), 'package/index.js'])
    expect(js).toContain('import "@deepseek-ai/dsh-session"')
    expect(js).toContain('import "@deepseek-ai/dsh-session-timeline"')
    const manifest = JSON.parse(capture('tar', ['-xOzf', join(root, filename), 'package/package.json'])) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-session': '0.1.5-rc.5',
      '@deepseek-ai/dsh-session-timeline': '0.1.5-xfdsh.2',
    })
    expect(readFileSync(join(root, PUBLISH_ORDER_FILE), 'utf8')).toBe('x1a0f3n9-dsh-0.1.5-rc.5.tgz\n')
  })
})

describe('packed family directory rewrite', () => {
  it('rewrites the publish order onto the target scope', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-rewrite-family-'))
    roots.push(root)
    const extracted = join(root, 'package')
    mkdirSync(extracted)
    writeFileSync(join(extracted, 'package.json'), `${JSON.stringify({
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.5',
    }, null, 2)}\n`)
    const fromDir = join(root, 'from')
    const outDir = join(root, 'out')
    mkdirSync(fromDir)
    capture('tar', ['-czf', join(fromDir, 'x1a0f3n9-dsh-0.1.5-rc.5.tgz'), '-C', root, 'package'])
    writeFileSync(join(fromDir, PUBLISH_ORDER_FILE), 'x1a0f3n9-dsh-0.1.5-rc.5.tgz\n')

    const rewritten = rewritePackedFamilyDirectory(
      releaseFamily('dsh'),
      resolve(import.meta.dirname, '../..'),
      fromDir,
      outDir,
      '@xfcodeai',
    )
    expect(rewritten).toEqual(['xfcodeai-dsh-0.1.5-rc.5.tgz'])
    expect(readFileSync(join(outDir, PUBLISH_ORDER_FILE), 'utf8')).toBe('xfcodeai-dsh-0.1.5-rc.5.tgz\n')
    expect(packedIdentity(join(outDir, 'xfcodeai-dsh-0.1.5-rc.5.tgz'))).toEqual({
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.5',
    })
  })
})
