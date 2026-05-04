import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BugreportInterview, type ChatBackend, isReportComplete } from '../../src/main/voice/bugreport-interview'

/** Mock chat backend that returns canned responses. */
class MockChat implements ChatBackend {
  private responses: string[]
  private callCount = 0

  constructor(responses: string[]) {
    this.responses = responses
  }

  async send(_message: string): Promise<string> {
    return this.responses[this.callCount++] ?? 'no more responses'
  }
}

describe('BugreportInterview with ChatBackend interface', () => {
  it('accepts any ChatBackend implementation', () => {
    const mock = new MockChat(['response'])
    const interview = new BugreportInterview(mock)
    assert.ok(interview)
  })

  it('drives multi-turn conversation to completion', async () => {
    const finalReport = `# Test Bug
## Summary
Something broke.
## Steps to Reproduce
1. Do something
## Expected Behavior
It works.
## Actual Behavior
It doesn't.
**Severity:** medium
**Tags:** test`

    const mock = new MockChat([
      'Was genau ist passiert?',
      'Wie reproduzierst du das?',
      finalReport,
    ])

    const interview = new BugreportInterview(mock)
    const events: string[] = []

    interview.on('agent-speaking', (text: string) => events.push(`agent:${text.slice(0, 30)}`))
    interview.on('interview-complete', (report: string) => events.push(`complete:${report.slice(0, 20)}`))

    interview.start()
    assert.equal(interview.isComplete(), false)

    await interview.onUserTranscription('Das Terminal scrollt nicht')
    assert.equal(interview.getTurnCount(), 1)
    assert.equal(interview.isComplete(), false)

    await interview.onUserTranscription('Immer wenn ich Session wechsle')
    assert.equal(interview.getTurnCount(), 2)
    assert.equal(interview.isComplete(), false)

    await interview.onUserTranscription('Ja genau')
    assert.equal(interview.getTurnCount(), 3)
    assert.equal(interview.isComplete(), true)
    assert.ok(interview.getReport().includes('# Test Bug'))
    assert.ok(events.some(e => e.startsWith('complete:')))
  })

  it('ignores empty transcriptions', async () => {
    const mock = new MockChat(['response'])
    const interview = new BugreportInterview(mock)
    interview.start()

    await interview.onUserTranscription('')
    await interview.onUserTranscription('   ')
    assert.equal(interview.getTurnCount(), 0)
  })

  it('ignores transcriptions after completion', async () => {
    const report = `# Done
## Summary
x
## Steps to Reproduce
1. x
## Expected Behavior
x
## Actual Behavior
x
**Severity:** low`

    const mock = new MockChat([report])
    const interview = new BugreportInterview(mock)
    interview.start()

    await interview.onUserTranscription('bug')
    assert.equal(interview.isComplete(), true)

    await interview.onUserTranscription('more text')
    assert.equal(interview.getTurnCount(), 1) // still 1, not 2
  })

  it('emits error on chat failure', async () => {
    const failChat: ChatBackend = {
      async send() { throw new Error('connection failed') },
    }
    const interview = new BugreportInterview(failChat)
    interview.start()

    const errors: Error[] = []
    interview.on('error', (err: Error) => errors.push(err))

    await interview.onUserTranscription('test')
    assert.equal(errors.length, 1)
    assert.ok(errors[0].message.includes('connection failed'))
  })
})
