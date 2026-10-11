require('ts-node/register/transpile-only')

const assert = require('node:assert/strict')
const Module = require('node:module')
const test = require('node:test')

const { loadBuildSecrets } = require('../config/buildSecrets.ts')

test('uses an available Qwen vision model when no build override is configured', () => {
  const originalLoad = Module._load
  Module._load = function loadWithoutLocalSecrets(request, parent, isMain) {
    if (request === './secrets.local') {
      const error = new Error("Cannot find module './secrets.local'")
      error.code = 'MODULE_NOT_FOUND'
      throw error
    }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    assert.equal(loadBuildSecrets().QWEN_VL_MODEL, 'qwen3-vl-plus')
  } finally {
    Module._load = originalLoad
  }
})

test('uses the same available vision model as the runtime fallback', () => {
  const originalLoad = Module._load
  Module._load = function loadWithoutTaroRuntime(request, parent, isMain) {
    if (request === '@tarojs/taro') return {}
    return originalLoad.call(this, request, parent, isMain)
  }
  global.QWEN_VL_MODEL = '   '

  try {
    const { getQwenVlModel } = require('../src/utils/qwenDirect.ts')
    assert.equal(getQwenVlModel(), 'qwen3-vl-plus')
  } finally {
    Module._load = originalLoad
    delete global.QWEN_VL_MODEL
  }
})
