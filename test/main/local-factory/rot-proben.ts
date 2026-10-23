// Echte Ausgaben (node 22 node:test TAP, pytest 9, vitest 4.1.8 ohne TTY aus projekt-a),
// erzeugt am 2026-10-23; der Temp-Pfad ist durch /repo ersetzt. Die kurzen vitest-Proben
// weiter unten sind von Hand nach diesem Format gesetzt (Produktionsfehler, globalThis).
export const nodeTapHelfer = "TAP version 13\n# Subtest: zählt Aufrufe\nnot ok 1 - zählt Aufrufe\n  ---\n  duration_ms: 0.562125\n  type: 'test'\n  location: '/repo/test/helfer.test.js:3:1'\n  failureType: 'testCodeFailure'\n  error: 'G.__calls is not a function'\n  code: 'ERR_TEST_FAILURE'\n  name: 'TypeError'\n  stack: |-\n    TestContext.<anonymous> (/repo/test/helfer.test.js:3:33)\n    Test.runInAsyncScope (node:async_hooks:214:14)\n    Test.run (node:internal/test_runner/test:1047:25)\n    Test.start (node:internal/test_runner/test:944:17)\n    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 65.223417\n"
export const nodeTapProd = "TAP version 13\n# Subtest: teilt\nnot ok 1 - teilt\n  ---\n  duration_ms: 0.608334\n  type: 'test'\n  location: '/repo/test/prod.test.js:3:1'\n  failureType: 'testCodeFailure'\n  error: \"Cannot read properties of undefined (reading 'zahl')\"\n  code: 'ERR_TEST_FAILURE'\n  name: 'TypeError'\n  stack: |-\n    exports.teile (/repo/src/rechner.js:1:31)\n    TestContext.<anonymous> (/repo/test/prod.test.js:3:23)\n    Test.runInAsyncScope (node:async_hooks:214:14)\n    Test.run (node:internal/test_runner/test:1047:25)\n    Test.start (node:internal/test_runner/test:944:17)\n    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 64.43225\n"
export const pytestLang = "============================= test session starts ==============================\nplatform darwin -- Python 3.14.7, pytest-9.0.3, pluggy-1.6.0\nrootdir: /repo\nplugins: asyncio-1.3.0, anyio-4.13.0\nasyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function\ncollected 3 items\n\ntests/test_kasse.py FFF                                                  [100%]\n\n=================================== FAILURES ===================================\n__________________________________ test_name ___________________________________\n\n    def test_name():\n>       assert summe(1) == 1\n               ^^^^^\nE       NameError: name 'summe' is not defined\n\ntests/test_kasse.py:6: NameError\n__________________________________ test_attr ___________________________________\n\n    def test_attr():\n        k = Kasse()\n>       k.__claimCalls()\n        ^^^^^^^^^^^^^^\nE       AttributeError: 'Kasse' object has no attribute '__claimCalls'\n\ntests/test_kasse.py:10: AttributeError\n_________________________________ test_dunder __________________________________\n\n    def test_dunder():\n        k = Kasse()\n>       k.__enter__()\n        ^^^^^^^^^^^\nE       AttributeError: 'Kasse' object has no attribute '__enter__'. Did you mean: '__ne__'?\n\ntests/test_kasse.py:14: AttributeError\n=========================== short test summary info ============================\nFAILED tests/test_kasse.py::test_name - NameError: name 'summe' is not defined\nFAILED tests/test_kasse.py::test_attr - AttributeError: 'Kasse' object has no...\nFAILED tests/test_kasse.py::test_dunder - AttributeError: 'Kasse' object has ...\n============================== 3 failed in 0.01s ===============================\n"
export const pytestKurz = "============================= test session starts ==============================\nplatform darwin -- Python 3.14.7, pytest-9.0.3, pluggy-1.6.0\nrootdir: /repo\nplugins: asyncio-1.3.0, anyio-4.13.0\nasyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function\ncollected 3 items\n\ntests/test_kasse.py FFF                                                  [100%]\n\n=================================== FAILURES ===================================\n__________________________________ test_name ___________________________________\ntests/test_kasse.py:6: in test_name\n    assert summe(1) == 1\n           ^^^^^\nE   NameError: name 'summe' is not defined\n__________________________________ test_attr ___________________________________\ntests/test_kasse.py:10: in test_attr\n    k.__claimCalls()\n    ^^^^^^^^^^^^^^\nE   AttributeError: 'Kasse' object has no attribute '__claimCalls'\n_________________________________ test_dunder __________________________________\ntests/test_kasse.py:14: in test_dunder\n    k.__enter__()\n    ^^^^^^^^^^^\nE   AttributeError: 'Kasse' object has no attribute '__enter__'. Did you mean: '__ne__'?\n=========================== short test summary info ============================\nFAILED tests/test_kasse.py::test_name - NameError: name 'summe' is not defined\nFAILED tests/test_kasse.py::test_attr - AttributeError: 'Kasse' object has no...\nFAILED tests/test_kasse.py::test_dunder - AttributeError: 'Kasse' object has ...\n============================== 3 failed in 0.01s ===============================\n"

export const nodeSpecHelfer = `✖ failing tests:

test at test/helfer.test.js:3:1
✖ zählt Aufrufe (0.592375ms)
  TypeError: G.__calls is not a function
      at TestContext.<anonymous> (/repo/test/helfer.test.js:3:33)
      at Test.runInAsyncScope (node:async_hooks:214:14)
      at Test.run (node:internal/test_runner/test:1047:25)
`

export const vitestHelfer = ` FAIL  src/lib/zaehler.test.ts > Zähler > zählt Aufrufe
TypeError: G.__calls is not a function
 ❯ src/lib/zaehler.test.ts:12:14
     10|   it('zählt Aufrufe', () => {
     11|     const G = globalThis as any
     12|     G.__calls()
       |       ^
     13|   })

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
`

export const vitestGlobalThis = ` FAIL  src/lib/zaehler.test.ts > Zähler > meldet
TypeError: globalThis.meldeSpy is not a function
 ❯ src/lib/zaehler.test.ts:20:16
`

export const vitestReferenceImTest = ` FAIL  src/lib/rechner.test.ts > rechnet
ReferenceError: rechne is not defined
 ❯ src/lib/rechner.test.ts:5:12
      3| describe('rechner', () => {
      4|   it('rechnet', () => {
      5|     expect(rechne(2)).toBe(4)
`

export const vitestProd = ` FAIL  src/lib/rechner.test.ts > teilt
TypeError: Cannot read properties of undefined (reading 'zahl')
 ❯ teile src/lib/rechner.ts:2:20
 ❯ src/lib/rechner.test.ts:6:5
`

export const ohneOrt = `TypeError: G.__calls is not a function
(Stack abgeschnitten)
`

// Echt: vitest 4.1.8, vier Fälle in src/lib/zaehler.test.ts — (1) G.__calls, (2) ReferenceError,
// (3) m.teile is not a function, (4) AssertionError.
export const vitestEcht = "\n RUN  v4.1.8 /repo\n\n ❯ src/lib/zaehler.test.ts (4 tests | 4 failed) 4ms\n     × zählt Aufrufe 2ms\n     × ReferenceError im Test 0ms\n     × Produktion fehlt 0ms\n     × Assertion 1ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  src/lib/zaehler.test.ts > Zähler > zählt Aufrufe\nTypeError: G.__calls is not a function\n ❯ src/lib/zaehler.test.ts:5:72\n      3| const G = globalThis as any\n      4| describe('Zähler', () => {\n      5|   it('zählt Aufrufe', () => { G.__claimCalls = []; zaehle(1); expect(G…\n       |                                                                        ^\n      6|   it('ReferenceError im Test', () => { expect(nichtDa(1)).toBe(2) })\n      7|   it('Produktion fehlt', async () => { const m: any = await import('./…\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯\n\n FAIL  src/lib/zaehler.test.ts > Zähler > ReferenceError im Test\nReferenceError: nichtDa is not defined\n ❯ src/lib/zaehler.test.ts:6:40\n      4| describe('Zähler', () => {\n      5|   it('zählt Aufrufe', () => { G.__claimCalls = []; zaehle(1); expect(G…\n      6|   it('ReferenceError im Test', () => { expect(nichtDa(1)).toBe(2) })\n       |                                        ^\n      7|   it('Produktion fehlt', async () => { const m: any = await import('./…\n      8|   it('Assertion', () => { expect(zaehle(1)).toBe(3) })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯\n\n FAIL  src/lib/zaehler.test.ts > Zähler > Produktion fehlt\nTypeError: m.teile is not a function\n ❯ src/lib/zaehler.test.ts:7:91\n      5|   it('zählt Aufrufe', () => { G.__claimCalls = []; zaehle(1); expect(G…\n      6|   it('ReferenceError im Test', () => { expect(nichtDa(1)).toBe(2) })\n      7|   it('Produktion fehlt', async () => { const m: any = await import('./…\n       |                                                                                           ^\n      8|   it('Assertion', () => { expect(zaehle(1)).toBe(3) })\n      9| })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯\n\n FAIL  src/lib/zaehler.test.ts > Zähler > Assertion\nAssertionError: expected 2 to be 3 // Object.is equality\n\n- Expected\n+ Received\n\n- 3\n+ 2\n\n ❯ src/lib/zaehler.test.ts:8:45\n      6|   it('ReferenceError im Test', () => { expect(nichtDa(1)).toBe(2) })\n      7|   it('Produktion fehlt', async () => { const m: any = await import('./…\n      8|   it('Assertion', () => { expect(zaehle(1)).toBe(3) })\n       |                                             ^\n      9| })\n     10| declare function nichtDa(n: number):\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯\n\n\n Test Files  1 failed (1)\n      Tests  4 failed (4)\n   Start at  19:52:26\n   Duration  138ms (transform 13ms, setup 0ms, import 19ms, tests 4ms, environment 0ms)\n\n"
