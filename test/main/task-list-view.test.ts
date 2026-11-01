import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { taskListAntwort, TASK_LIST_MAX_LIMIT } from '../../src/main/task/task-list-view'
import type { Task } from '../../src/shared/types'

function task(i: number): Task {
  return {
    id: `T${i}`, parentId: null, sessionId: null, source: 'bugreport', title: `BUG-${i}`,
    description: 'x'.repeat(1000), state: 'queued', policy: null, retryCount: 0, maxRetries: 2,
    result: null, createdAt: i, updatedAt: i, completedAt: null,
  }
}

describe('mux_task_list: Uebersicht statt Volltext (2026-11-01)', () => {
  it('liefert die neuesten zuerst, gekappt auf 50, und zaehlt alle', () => {
    const a = taskListAntwort(Array.from({ length: 120 }, (_, i) => task(i)))
    assert.equal(a.total, 120)
    assert.equal(a.shown, 50)
    assert.equal(a.tasks[0].id, 'T119')
    assert.match(a.hint ?? '', /70 aeltere/)
  })

  it('laesst Beschreibung und Ergebnis weg', () => {
    const [e] = taskListAntwort([task(1)]).tasks
    assert.equal('description' in e, false)
    assert.equal('result' in e, false)
  })

  it('bleibt bei 10.000 Tasks klein', () => {
    const a = taskListAntwort(Array.from({ length: 10_000 }, (_, i) => task(i)), 10_000)
    assert.equal(a.shown, TASK_LIST_MAX_LIMIT)
    assert.ok(JSON.stringify(a).length < 150_000, `${JSON.stringify(a).length} Zeichen`)
  })

  it('ohne Kappung kein Hinweis', () => {
    assert.equal(taskListAntwort([task(1)]).hint, undefined)
  })
})
