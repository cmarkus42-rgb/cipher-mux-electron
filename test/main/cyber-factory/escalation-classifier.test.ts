import { test } from 'node:test'
import assert from 'assert/strict'
import { classifyEscalation } from '../../../src/main/cyber-factory/escalation-classifier.js'

test('Level 1 — direct keyword match in spec', () => {
  const result = classifyEscalation({
    question: 'Which API style?',
    detailSpecContent: 'REST-first architecture',
    crossSessionDecisions: [],
    hasWebSearchCapability: false,
  })
  assert.equal(result.level, 1)
  assert.equal(result.autonomous, true)
  assert.ok(result.reasoning.toLowerCase().includes('spec'), `reasoning should mention spec, got: ${result.reasoning}`)
})

test('Level 2 — spec has content but no direct keyword match', () => {
  const result = classifyEscalation({
    question: 'Which test framework?',
    detailSpecContent: 'Stack: TypeScript, Node.js',
    crossSessionDecisions: [],
    hasWebSearchCapability: false,
  })
  assert.equal(result.level, 2)
  assert.equal(result.autonomous, true)
})

test('Level 3 — cross-session compatible decision exists', () => {
  const result = classifyEscalation({
    question: 'Date library?',
    detailSpecContent: '',
    crossSessionDecisions: [{ sessionId: 's1', decision: 'Use dayjs' }],
    hasWebSearchCapability: false,
  })
  assert.equal(result.level, 3)
  assert.equal(result.autonomous, true)
})

test('Level 4 — web search capability available', () => {
  const result = classifyEscalation({
    question: 'API for library X?',
    detailSpecContent: '',
    crossSessionDecisions: [],
    hasWebSearchCapability: true,
  })
  assert.equal(result.level, 4)
  assert.equal(result.autonomous, true)
})

test('Level 5 — no context available, requires user input', () => {
  const result = classifyEscalation({
    question: 'GraphQL or REST?',
    detailSpecContent: '',
    crossSessionDecisions: [],
    hasWebSearchCapability: false,
  })
  assert.equal(result.level, 5)
  assert.equal(result.autonomous, false)
  assert.ok(result.reasoning.toLowerCase().includes('user'), `reasoning should mention user, got: ${result.reasoning}`)
})
