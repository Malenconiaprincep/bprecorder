import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientSource = await readFile(new URL('../miniapp/src/lib/supabase.ts', import.meta.url), 'utf8')
const routeSource = await readFile(new URL('../src/app/api/bp_records/route.ts', import.meta.url), 'utf8')

test('miniapp blood-pressure records use the configured backend domain', () => {
  assert.match(clientSource, /API_BASE_URL/)
  assert.match(clientSource, /\/api\/bp_records/)
  assert.match(clientSource, /isBackendRecordRequest/)
})

test('backend blood-pressure route supports the record lifecycle', () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.match(routeSource, new RegExp(`export async function ${method}\\(`))
  }
})
