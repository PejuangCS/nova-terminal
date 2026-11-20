import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const sourceUrl = new URL('../src/lib/periodSettings.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
const { DEFAULT_SETTINGS, applyPeriodDraft } = await import(moduleUrl)

test('blank draft keeps the previous EMA period', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'emaPeriod', '').emaPeriod, 20)
})

test('single digit draft is not clamped while typing; commit applies min period', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'emaPeriod', '1').emaPeriod, 2)
})

test('valid single digit period is committed', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'emaPeriod', '2').emaPeriod, 2)
})

test('valid replacement period is committed', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'emaPeriod', '15').emaPeriod, 15)
})

test('non-numeric draft reverts instead of producing NaN', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'rsiPeriod', 'abc').rsiPeriod, 14)
})

test('MACD slow period remains greater than fast period', () => {
  const next = applyPeriodDraft(DEFAULT_SETTINGS, 'macdFast', '30')
  assert.equal(next.macdFast, 30)
  assert.equal(next.macdSlow, 31)
})

test('MACD slow draft cannot be lower than fast period', () => {
  const next = applyPeriodDraft({ ...DEFAULT_SETTINGS, macdFast: 20, macdSlow: 26 }, 'macdSlow', '10')
  assert.equal(next.macdSlow, 21)
})

test('period maximum is enforced when committed', () => {
  assert.equal(applyPeriodDraft(DEFAULT_SETTINGS, 'rsiPeriod', '999').rsiPeriod, 100)
})
