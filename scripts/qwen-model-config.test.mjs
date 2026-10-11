import assert from 'node:assert/strict'
import test from 'node:test'

const modelModule = await import('../src/lib/qwenModel.mjs').catch(() => null)

test('backend Qwen vision model defaults to an available model', () => {
  assert.ok(modelModule, 'Qwen model resolver must exist')
  assert.equal(modelModule.resolveQwenVlModel(), 'qwen3-vl-plus')
})

test('backend Qwen vision model accepts a trimmed workspace override', () => {
  assert.ok(modelModule, 'Qwen model resolver must exist')
  assert.equal(modelModule.resolveQwenVlModel(' custom-vl-deployment '), 'custom-vl-deployment')
})
