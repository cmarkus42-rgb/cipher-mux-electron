import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as path from 'path'
import { AXIS_VALUES, PICK_ROWS, type TagAxis } from '../../src/shared/tag-axes'

// ─── Der Code selbst muss die Achsen einhalten ──────────────
//
// Befund vom 2026-09-30, aufgefallen beim Umzug der 958 Bestands-Notes: der Mux
// raeumt auf und schreibt gleichzeitig weiter das, was er aufraeumt.
//
//   - `handoff-kernel.ts` setzte `scope:testing`, `scope:debugging` und
//     `scope:audit` auf jede Handoff-Note. Genau diese Tags hat der Umzug zu
//     Phasen gehoben.
//   - Die Rollen-Vorlagen wiesen ihre Rollen auf `phase:1` bis `phase:7` an --
//     die Quelle der Wellennummern unter `phase`.
//   - `severity:high/medium` stand in zwei Vorlagen, obwohl die Skala
//     low/mid/hi/now ist.
//
// Und die schwerere Folge: eine Rolle, die einen Tag aus ihrer EIGENEN
// Anweisung vergibt, muss ihn vergeben koennen. `mux_notes_create` weist
// unbekannte Tags hart ab. `kind:lueckenanalyse`, `status:closed`,
// `category:owasp` und `skill:pre-mortem` standen in Vorlagen, ohne dass die
// Registry sie kennt -- die Note waere nicht entstanden, und die Rolle haette
// nur eine Fehlermeldung gesehen.
//
// Ein Umzug der Daten ohne einen Umzug der Anweisungen haelt nicht.
//
// Dieser Test liest den Quelltext, weil die Handoff-Definitionen inline in
// registerAllHandoffTools stehen und sich nicht als Daten durchlaufen lassen.
// Das ist der stumpfere Weg, deckt dafuer auch die Vorlagen ab -- die geben nur
// Text an eine Rolle und bestimmen trotzdem, was die Rolle tut.

const MAIN_DIR = path.join(__dirname, '..', '..', 'src', 'main')

/** Dateien, die ueber Tags SPRECHEN, statt sie zu schreiben. */
const EXEMPT = new Set(['tag-migration.ts', 'tag-repository.ts', 'note-tagging.ts'])

/**
 * Klassen, die keine Achse sind und trotzdem vergeben werden dürfen.
 *
 * Genau die Auswahlzeilen mit `source: 'registry'` — editierbar im TagManager
 * und deshalb nicht im Code aufzählbar. Ihre Werte prüft dieser Test nicht,
 * weil sie projektspezifisch sind; `severity` ist die Ausnahme und steht in
 * AXIS_VALUES nicht, hat aber eine Startbelegung, die der Code kennt.
 */
const REGISTRY_CLASSES = new Set(
  PICK_ROWS.filter(r => r.source === 'registry').map(r => r.klass),
)

/** Klassen, die im Code vorkommen und keine Tags sind (Pfade, URLs, Zeiten). */
const NOT_A_TAG_CLASS = new Set([
  'http', 'https', 'file', 'data', 'ws', 'wss', 'mailto', 'javascript',
])

async function collectSources(dir: string): Promise<Array<{ file: string; text: string }>> {
  const out: Array<{ file: string; text: string }> = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...await collectSources(full))
    } else if (entry.name.endsWith('.ts') && !EXEMPT.has(entry.name)) {
      out.push({ file: path.relative(MAIN_DIR, full), text: await fs.readFile(full, 'utf-8') })
    }
  }
  return out
}

/**
 * Tag-Literale im Quelltext finden.
 *
 * Nur die Klassen, die der Mux als Tag-Klassen kennt — nach beliebigen
 * `wort:wort`-Paaren zu suchen fände jede URL und jeden Doppelpunkt in Prosa.
 */
function findTagLiterals(
  sources: Array<{ file: string; text: string }>,
  classes: readonly string[],
): Array<{ file: string; klass: string; value: string }> {
  // Die Rueckschau verhindert, dass `status` mitten in `req-status:draft`
  // greift -- ein Bindestrich ist fuer \b eine Wortgrenze, und der Treffer
  // waere ein Artefakt der Suche und kein Befund im Code.
  const re = new RegExp(`(?<![\\w-])(${classes.join('|')}):([a-z0-9][a-z0-9_-]*)`, 'g')
  const hits: Array<{ file: string; klass: string; value: string }> = []
  for (const { file, text } of sources) {
    for (const m of text.matchAll(re)) {
      if (NOT_A_TAG_CLASS.has(m[1])) continue
      hits.push({ file, klass: m[1], value: m[2] })
    }
  }
  return hits
}

describe('Der Code schreibt und empfiehlt nur vergebbare Tags', () => {
  it('nennt fuer jede Achse nur Werte, die die Achse kennt', async () => {
    const sources = await collectSources(MAIN_DIR)
    const axes = Object.keys(AXIS_VALUES)
    const bad = findTagLiterals(sources, axes).filter(h => {
      const allowed = AXIS_VALUES[h.klass as TagAxis]
      return allowed !== undefined && !allowed.includes(h.value)
    })

    assert.deepEqual(
      bad, [],
      'Werte, die keine Achse kennt und die mux_notes_create abweisen wuerde:\n'
      + bad.map(b => `  ${b.file} -> ${b.klass}:${b.value}`).join('\n'),
    )
  })

  it('erfindet keine Klasse neben Achsen und Registry', async () => {
    const sources = await collectSources(MAIN_DIR)
    // Klassen, die in Vorlagen und Handoffs auftauchten und keine sind.
    const invented = ['scope', 'category', 'skill', 'req-status', 'project', 'domain',
      'tech', 'welle', 'verdict']
    const hits = findTagLiterals(sources, invented)
      .filter(h => !REGISTRY_CLASSES.has(h.klass))

    assert.deepEqual(
      hits, [],
      'Klassen ohne Registrierung — eine Rolle, die das vergibt, bekommt eine '
      + 'Fehlermeldung statt einer Note:\n'
      + hits.map(h => `  ${h.file} -> ${h.klass}:${h.value}`).join('\n'),
    )
  })

  it('haelt die Schwere-Skala ein', async () => {
    const sources = await collectSources(MAIN_DIR)
    const { SEVERITY_VALUES } = await import('../../src/shared/tag-axes')
    const bad = findTagLiterals(sources, ['severity'])
      .filter(h => !SEVERITY_VALUES.includes(h.value))

    assert.deepEqual(
      bad, [],
      `Skala ist ${SEVERITY_VALUES.join('/')}:\n`
      + bad.map(b => `  ${b.file} -> severity:${b.value}`).join('\n'),
    )
  })

  // ─── Und das Loch, das die drei Pruefungen oben hatten ──────
  //
  // Alle drei suchen nach `klasse:wert`. Ein Tag OHNE Klasse ist fuer sie
  // unsichtbar -- und genau so einer stand am 2026-10-01 noch in der
  // Companion-Vorlage: `**tags:** ["bugreport", "open"]` in den beiden
  // Formatvorlagen fuer Bug und Feature. Die Reparatur am Morgen war auf die
  // Sektion "Notes-Tagging" beschraenkt, und diese zwei Stellen stehen
  // woanders in derselben Datei.
  //
  // Die Folge ist nicht kosmetisch: `bugreport` ist kein FLAT_MARKER und kein
  // Klassenname, `isKnownTag` sagt false, `mux_notes_create` bricht ab. Der
  // Companion haette seine eigene Bugreport-Anleitung befolgt und eine
  // Fehlermeldung bekommen.
  it('empfiehlt keine klassenlosen Tags in Tag-Arrays', async () => {
    const sources = await collectSources(MAIN_DIR)
    const { FLAT_MARKERS } = await import('../../src/shared/tag-axes')
    const axes = Object.keys(AXIS_VALUES)
    // Erlaubt ohne Klasse: die flachen Marker (programmatisch gelesen) und ein
    // blanker Klassenname (den akzeptiert isKnownTag ausdruecklich).
    const okBare = new Set<string>([...FLAT_MARKERS, ...axes, ...REGISTRY_CLASSES])

    // Woran eine Tag-Liste zu erkennen ist: am **Wort davor**, nicht am Inhalt.
    // Eine erste Fassung verlangte, dass mindestens ein Element Klassenform hat
    // — und war damit blind fuer genau den Fall, den sie finden sollte:
    // `["bugreport", "open"]` hat kein einziges. Der Kontext traegt die Aussage.
    const ARRAY = /\[\s*((?:["'][^"'\n]*["']\s*,?\s*)+)\]/g
    const ELEM = /["']([^"'\n]*)["']/g
    /** `tags`, `tags:`, `**tags:**`, `tags=` … unmittelbar vor dem Array. */
    const TAGS_BEFORE = /tags\W{0,6}$/i
    const bad: Array<{ file: string; tag: string; array: string }> = []
    for (const { file, text } of sources) {
      for (const m of text.matchAll(ARRAY)) {
        const before = text.slice(Math.max(0, m.index - 24), m.index)
        if (!TAGS_BEFORE.test(before)) continue
        const elems = [...m[1].matchAll(ELEM)].map(e => e[1])
        for (const e of elems) {
          if (e.includes(':')) continue
          if (okBare.has(e)) continue
          bad.push({ file, tag: e, array: m[0].slice(0, 70) })
        }
      }
    }

    assert.deepEqual(
      bad, [],
      'Tags ohne Klasse in einer Tag-Liste — isKnownTag sagt false, der Aufruf '
      + 'bricht ab:\n'
      + bad.map(b => `  ${b.file} -> "${b.tag}"  in ${b.array}`).join('\n'),
    )
  })
})
