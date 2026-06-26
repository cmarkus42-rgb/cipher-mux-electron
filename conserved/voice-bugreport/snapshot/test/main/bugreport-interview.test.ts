import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BUGREPORT_SYSTEM_PROMPT, isReportComplete, extractReport } from '../../src/main/voice/bugreport-interview'

describe('BugreportInterview', () => {
  it('system prompt contains required sections', () => {
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Bug-Interview-Assistent'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('cipher-mux'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Steps to Reproduce'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Expected Behavior'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Actual Behavior'))
    assert.ok(BUGREPORT_SYSTEM_PROMPT.includes('Severity'))
  })

  it('detects complete report in Gemma response', () => {
    const incomplete = 'Kannst du mir mehr über den Bug erzählen?'
    assert.equal(isReportComplete(incomplete), false)

    const complete = `# Terminal scrollt nicht zurück
## Summary
Nach Session-Wechsel scrollt das Terminal nicht mehr zurück.
## Steps to Reproduce
1. Session A öffnen
2. Zu Session B wechseln
3. Zurück zu Session A
## Expected Behavior
Terminal zeigt vorherigen Scroll-Position.
## Actual Behavior
Terminal springt nach unten.
**Severity:** medium
**Tags:** terminal, scroll`
    assert.equal(isReportComplete(complete), true)
  })

  it('extracts report from mixed Gemma response', () => {
    const mixed = `Danke für die Details! Hier ist der Report:

# Grid resize Bug
## Summary
Grid reagiert nicht auf Resize.
## Steps to Reproduce
1. Fenster verkleinern
## Expected Behavior
Grid passt sich an.
## Actual Behavior
Grid bleibt gleich groß.
**Severity:** low
**Tags:** grid, resize

Ich hoffe das hilft!`

    const report = extractReport(mixed)
    assert.ok(report.startsWith('# Grid resize Bug'))
    assert.ok(report.includes('## Summary'))
    assert.ok(report.includes('**Tags:** grid, resize'))
  })

  it('returns empty string when no report found', () => {
    assert.equal(extractReport('Kannst du mir mehr Details geben?'), '')
  })
})
