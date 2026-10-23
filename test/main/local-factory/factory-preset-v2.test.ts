/**
 * Rollentext local-factory v2 (Wellenplan Welle 3, LESSONS L4–L20).
 *
 * Der Text muss sagen, was erlaubt ist (L20d), was gesperrt ist, und die Felder
 * aus Paket 3 und der Projekt-Config so erklären, wie das Werkzeug sie nimmt —
 * Rollentext und Werkzeugbeschreibung dürfen sich nicht widersprechen.
 */
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { generateLocalFactoryPreset } from '../../../src/main/local-factory/presets'
import { buildDispatchDescription, DISPATCH_INPUT_SCHEMA } from '../../../src/main/mcp/local-factory-tool'
import { LEERE_PROJEKT_CONFIG, PROJEKT_CONFIG_PFAD } from '../../../src/main/local-factory/projekt-config'
import { comparePresetVersion, parsePresetVersion } from '../../../src/main/entity-content/preset-version'
import { presetTemplateFor } from '../../../src/main/entity-content/preset-templates'

const p = generateLocalFactoryPreset()

describe('local-factory v2 — Marker und Rückstand', () => {
  it('trägt den Marker local-factory-v3 als erste Zeile (Retry-Feld laeuferfehler)', () => {
    assert.ok(p.startsWith('<!-- local-factory-v3 -->\n'))
    assert.deepEqual(parsePresetVersion(p), { entityId: 'local-factory', version: 3 })
  })

  it('ein v2-Text im Betrieb → Rückstand erkannt', () => {
    const v2 = p.replace('<!-- local-factory-v3 -->', '<!-- local-factory-v2 -->')
    assert.equal(comparePresetVersion(v2, presetTemplateFor('local-factory') as string).stale, true)
  })

  it('ist im Rückstands-Mechanismus eingehängt', () => {
    assert.equal(presetTemplateFor('local-factory'), p)
  })

  it('alter Text ohne Marker → Rückstand erkannt', () => {
    const alt = '# Local Cyber Factory — Architekt und Prüfer\n\nDu schneidest Arbeit in kleine Häppchen …\n'
    const c = comparePresetVersion(alt, presetTemplateFor('local-factory') as string)
    assert.equal(c.status, 'ohne-datei-marker')
    assert.equal(c.stale, true)
  })

  it('v3 gegen v3 → kein Rückstand', () => {
    const c = comparePresetVersion(p, presetTemplateFor('local-factory') as string)
    assert.equal(c.status, 'aktuell')
    assert.equal(c.stale, false)
  })
})

describe('local-factory v2 — git und Worktrees (L4, L5, L20d)', () => {
  it('erlaubt vor dem Dispatch ausdrücklich worktree add per git -C und Lesebefehle', () => {
    assert.match(p, /git -C <repo> worktree add/)
    for (const b of ['log', 'show', 'diff', 'status', 'archive']) assert.match(p, new RegExp(`\`${b}\``), b)
    assert.match(p, /[Vv]or dem Dispatch/)
  })

  it('während der Worker läuft, ist sein Worktree tabu — auch über die Shell', () => {
    assert.match(p, /Während der Worker läuft, ist sein Worktree tabu/)
    assert.match(p, /Shell/)
  })

  it('nennt die gesperrten git-Befehle und die Edit-Sperren', () => {
    for (const b of ['git stash', 'checkout', 'switch', 'reset --hard']) assert.ok(p.includes(b), b)
    assert.match(p, /\/src\//)
    assert.match(p, /\/lib\//)
    assert.ok(p.includes(PROJEKT_CONFIG_PFAD))
  })

  it('L5: Gegenproben nur über git archive in ein Temp-Verzeichnis', () => {
    assert.match(p, /Gegenprobe[n]?[^\n]*git archive/)
    assert.match(p, /tar -x -C/)
  })
})

describe('local-factory v2 — Zuschnitt (L7, L8, L10, L16, L17)', () => {
  it('L10: -k/Filter nur für den Abnahmetest, „deselected“ warnt', () => {
    assert.match(p, /`-k`/)
    assert.match(p, /deselected/)
  })

  it('L7: Fundstellen vor dem Zuschnitt zählen und im Auftrag nennen', () => {
    assert.match(p, /Fundstellen/)
    assert.match(p, /zählen/)
  })

  it('L8: Katalog-/Daten- und Code-Häppchen getrennt', () => {
    assert.match(p, /Katalog/)
    assert.match(p, /getrennt/)
  })

  it('L16: Abnahmetest vor dem Dispatch rot aus dem richtigen Grund; Test-Hilfsobjekte nicht übersteuerbar', () => {
    assert.match(p, /aus dem richtigen Grund/)
    assert.match(p, /rotGrund/)
    assert.match(p, /globalThis/)
    assert.match(p, /__name/)
    assert.match(p, /nicht übersteuerbar/)
  })

  it('L17: Stufe 3 nur Backend/reine Komponente; Frontend mit Mount in zwei Häppchen', () => {
    assert.match(p, /Stufe 3/)
    assert.match(p, /Backend/)
    assert.match(p, /Einbindung/)
    assert.match(p, /zwei Häppchen/)
  })
})

describe('local-factory v2 — Paket-3- und Projekt-Config-Felder', () => {
  it('erklärt ersetzungen, architektenfehler (Deckel 1) und rotGrund', () => {
    assert.match(p, /`ersetzungen`/)
    assert.match(p, /`architektenfehler`/)
    assert.match(p, /einmal je Häppchen|1 je Häppchen/)
    assert.match(p, /`rotGrund`/)
  })

  it('erklärt jedes Feld der Projekt-Config und dass der Architekt sie nicht ändert', () => {
    for (const k of Object.keys(LEERE_PROJEKT_CONFIG)) assert.ok(p.includes(`\`${k}\``), k)
    assert.match(p, /pflegen nur der User oder die Systems-Session/)
  })

  it('„Nicht bereit“ zählt keinen Versuch', () => {
    assert.match(p, /Nicht bereit[^\n]*kein(en)? Versuch/)
  })

  it('Workshop-Nachtrag: worktreeVorbereitung idempotent, Symlinks unter sauberkeitIgnoriert nur auf Abhängigkeiten', () => {
    assert.match(p, /idempotent/)
    assert.match(p, /Symlink/)
    assert.match(p, /node_modules/)
    assert.match(p, /nie auf Code/)
  })

  it('E3-Ehrlichkeit: Grenze gilt nicht für die Shell allgemein, Umgehung ist Regelbruch', () => {
    assert.match(p, /nicht für die Shell allgemein/)
    assert.match(p, /Regelbruch/)
  })
})

describe('local-factory v2 — kein Widerspruch zur Werkzeugbeschreibung', () => {
  const beschreibung = buildDispatchDescription('local-factory')

  it('jedes Eingabefeld des Werkzeugs (außer den Workshop-Urteilsfeldern) kommt im Rollentext vor', () => {
    const nurWorkshop = new Set(['ergebnis', 'kategorie', 'notiz', 'profil'])
    for (const k of Object.keys(DISPATCH_INPUT_SCHEMA)) {
      if (nurWorkshop.has(k)) continue
      assert.ok(p.includes(k), `Rollentext nennt ${k} nicht`)
    }
  })

  it('beide nennen dieselbe Versuchsgrenze und denselben Weckpräfix', () => {
    assert.match(beschreibung, /Max 2 attempts/)
    assert.match(p, /Maximal 2 Versuche/)
    assert.ok(beschreibung.includes('[local-factory] #N'))
    assert.ok(p.includes('[local-factory] #N'))
  })

  it('architektenfehler: beide sagen „zählt nicht gegen die 2 Versuche, einmal je Häppchen, auch nach Eskalation“', () => {
    assert.match(beschreibung, /does not count against the 2 attempts, works once per item, also after escalation/)
    assert.match(p, /zählt nicht gegen die 2 Versuche/)
    assert.match(p, /auch nach der Eskalation/)
  })
})

describe('local-factory v3 — Läuferfehler', () => {
  const beschreibung = buildDispatchDescription('local-factory')

  it('Rollentext: Weckzeile LÄUFERFEHLER, Arbeit liegt im Worktree, Retry-Feld laeuferfehler mit eigenem Deckel', () => {
    assert.match(p, /`\[local-factory\] #N „ziel“: LÄUFERFEHLER/)
    assert.match(p, /ungesichert im Worktree/)
    assert.match(p, /`laeuferfehler`/)
    assert.match(p, /zählt nicht gegen die 2 Versuche/)
    assert.match(p, /unabhängig vom Architektenfehler/)
    assert.match(p, /HÄNGT[^\n]*grün/)
    assert.match(p, /zweiter Läuferfehler[^\n]*eskaliert/i)
  })

  it('Beschreibung: laeuferfehler, Deckel 1, nicht gezählt, auch nach HÄNGT mit grünem Gate', () => {
    assert.match(beschreibung, /laeuferfehler: "<reason>"/)
    assert.match(beschreibung, /does not count against the 2 attempts, once per item, independent of architektenfehler/)
    assert.match(beschreibung, /green gate/)
    assert.match(beschreibung, /second runner failure escalates/)
  })
})
