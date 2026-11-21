/**
 * Purpose: Guard against drift between the agy wrapper's retry vocabulary and the provider's.
 * Context: Compares `tools/agy-wrapper/agy` (reference copy) with server/error-inspection.ts.
 * Usage: `node --test tests/wrapper-token-parity.test.ts`.
 * Prerequisites: Node >= 22.18.0; skips when the reference wrapper is absent (tarball/CI).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RETRYABLE_ERROR_TOKENS } from '../server/error-inspection.ts'

const WRAPPER_PATH = fileURLToPath(
  new URL('../../tools/agy-wrapper/agy', import.meta.url),
)

/** Decode the handful of JS escapes used inside single-quoted literals. */
function decodeLiteral(raw: string): string {
  return raw.replace(/\\([\s\S])/g, (_match, char: string) => {
    switch (char) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      case '0':
        return '\0'
      default:
        return char
    }
  })
}

/** Extract the string elements of `const <name> = [ ... ];` without eval. */
function parseStringArray(source: string, name: string): string[] {
  const match = source.match(
    new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`),
  )
  if (match === null) throw new Error(`array literal ${name} not found`)
  const body = match[1]
  const out: string[] = []
  const literal = /'((?:\\.|[\s\S])*?)'/g
  let item: RegExpExecArray | null
  while ((item = literal.exec(body)) !== null) out.push(decodeLiteral(item[1]))
  return out
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort()
}

test('wrapper token vocabulary matches provider and stays capacity-narrow', (t) => {
  if (!existsSync(WRAPPER_PATH)) {
    t.skip(`reference wrapper absent at ${WRAPPER_PATH}`)
    return
  }
  const source = readFileSync(WRAPPER_PATH, 'utf8')

  const wrapperTokens = new Set(parseStringArray(source, 'RETRYABLE_TOKENS'))
  const providerTokens = new Set(RETRYABLE_ERROR_TOKENS)
  const wrapperList = sorted(wrapperTokens)
  const providerList = sorted(providerTokens)
  const onlyWrapper = sorted(
    [...wrapperTokens].filter((token) => !providerTokens.has(token)),
  )
  const onlyProvider = sorted(
    [...providerTokens].filter((token) => !wrapperTokens.has(token)),
  )
  const drift = [
    `wrapper tokens (${wrapperTokens.size}): ${JSON.stringify(wrapperList)}`,
    `provider tokens (${providerTokens.size}): ${JSON.stringify(providerList)}`,
    `drift wrapper-only: ${JSON.stringify(onlyWrapper)}`,
    `drift provider-only: ${JSON.stringify(onlyProvider)}`,
  ].join('\n')
  assert.deepEqual(wrapperList, providerList, drift)

  const capacityTokens = parseStringArray(source, 'CAPACITY_SIGNAL_TOKENS')
  for (const banned of ['UNAVAILABLE', 'capacity', '\\b503\\b']) {
    assert.ok(
      !capacityTokens.includes(banned),
      `CAPACITY_SIGNAL_TOKENS must not contain bare ${JSON.stringify(
        banned,
      )}; got ${JSON.stringify(sorted(capacityTokens))}`,
    )
  }

  const retryableMatcher = new RegExp(
    parseStringArray(source, 'RETRYABLE_TOKENS').join('|'),
    'i',
  )
  const capacityMatcher = new RegExp(capacityTokens.join('|'), 'i')
  assert.equal(
    retryableMatcher.test(
      'I1119 20:46:21.190358 68513 server.go:2814] Tool confirmation for conversation 5111c33f step 503',
    ) &&
      capacityMatcher.test(
        'I1119 20:46:21.190358 68513 server.go:2814] Tool confirmation for conversation 5111c33f step 503',
      ),
    false,
  )
  assert.equal(
    retryableMatcher.test(
      'I1117 14:18:23.548468 532 run.go:317] Run: attempt 1 failed (UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server), retrying in 4s',
    ) &&
      capacityMatcher.test(
        'I1117 14:18:23.548468 532 run.go:317] Run: attempt 1 failed (UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server), retrying in 4s',
      ),
    true,
  )
})
