/**
 * Runs the unit tests in tests/*.test.ts with Node's built-in test runner.
 *   npm test
 * Each test file is bundled with esbuild first (the plugin's sources import
 * Svelte, styles.css and the `obsidian` module, which only exists inside
 * Obsidian; the README screenshot stub stands in for it).
 */
import esbuild from 'esbuild'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testDir = path.join(root, 'tests')
const outDir = path.join(testDir, '.build')
const only = process.argv[2]

const entries = fs
    .readdirSync(testDir)
    .filter((f) => f.endsWith('.test.ts') && (!only || f.includes(only)))
    .map((f) => path.join(testDir, f))
if (!entries.length) {
    console.error('No tests found')
    process.exit(1)
}

fs.rmSync(outDir, { recursive: true, force: true })
await esbuild.build({
    entryPoints: entries,
    outdir: outDir,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    loader: { '.css': 'text' },
    alias: { obsidian: path.join(root, 'scripts/readme-images/obsidian-stub.ts') },
    // The engine's sound and confetti helpers look for a browser window when they are created
    banner: {
        js: 'globalThis.window ??= globalThis; globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }), body: { appendChild() {} } };',
    },
    logLevel: 'error',
})

const files = entries.map((f) => path.join(outDir, path.basename(f).replace(/\.ts$/, '.cjs')))
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
