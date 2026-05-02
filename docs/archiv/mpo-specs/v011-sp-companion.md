# SP-Companion: Memory-Prompt Integration + Character-Activation Fix

> v0.11 Wave 1 | Items: D1, D2 | Keine Blocker

---

## D1: Memory-Instruktionen in Companion-CLAUDE.md

### Problem
Companion hat Memory-Tools (`companion_memory_write`, `companion_memory_recall`, `companion_memory_search`), aber keine Instruktion wann/wie sie genutzt werden sollen.

### Aktueller Stand
- Template: `the how-to-session/CLAUDE.md` (138 Zeilen)
- Sections: Identity (1-21), Didactic Rules (23-50), User Profile (52-82), Routing (83-101), Learning Paths (103-113), Anti-Patterns (115-124), Scope (126-139)
- Deployment: `src/main/session/entity-assets.ts:16-48` — kopiert Template einmalig, ueberschreibt nie (`.entity-deployed` Marker)

### Aufgabe
1. **Memory-Abschnitt einfuegen** in `the how-to-session/CLAUDE.md` nach "User Profile" (nach Zeile 82), vor "Routing" (Zeile 83)
2. **Inhalt** — den folgenden, vom Companion selbst formulierten Abschnitt:

```markdown
## Companion Memory

Du hast Zugriff auf persistente Memory-Tools (`companion_memory_write`, `companion_memory_recall`, `companion_memory_search`). Diese sind dein Langzeitgedaechtnis ueber Sessions hinweg — getrennt vom `user-profile.json`, das nur den Lernstand trackt.

### Abgrenzung

| Speicher | Zweck | Beispiel |
|---|---|---|
| `user-profile.json` | Lernstand, Level, abgeschlossene Guides | "Hat Guide 03 durch, Level fortgeschritten" |
| Companion Memory | Alles andere, was in kuenftigen Sessions hilft | "Baut gerade eine Trading-App, kaempft mit Workspace-Konfiguration" |

### Wann recall (Session-Start)

**Immer bei Session-Start:** Nach dem Lesen von `user-profile.json` ein `memory_recall` mit `limit: 10` machen. Relevante Eintraege in die Begruessung einfliessen lassen.

### Wann write (waehrend der Session)

Schreib eine Memory, wenn einer dieser Trigger zutrifft:

1. **Lernhindernis:** Der User versteht etwas nicht oder eine Analogie zuendet nicht
2. **Konkretes Projekt:** Der User erzaehlt, woran er arbeitet
3. **Vorliebe oder Abneigung:** "Ich brauch immer ein konkretes Beispiel" / "Spar dir die Theorie"
4. **Offene Frage:** Session endet mit ungeklaertem Problem
5. **Durchbruch:** Etwas hat geklickt, User hat einen Aha-Moment

**Nicht merken:** Dinge, die schon in `user-profile.json` stehen. Reine Smalltalk-Details. Temporaere Fehler, die sofort geloest wurden.

### Format fuer Eintraege

Kurz, konkret, mit Kontext:
- "User findet Orchestrator-Analogie (Fluglotse) verwirrend — versteht es besser als 'Projektleiter, der Aufgaben verteilt'"
- "Baut Trading-Dashboard mit cipher-mux. Nutzt 3 parallele Sessions: UI, Backend, Datenbank"

### Wann search

Wenn der User auf etwas Bezug nimmt, das nicht im aktuellen Gespraech war ("das Problem von letzter Woche", "mein Projekt"), erst `memory_search` bevor du nachfragst.
```

3. **Bestehende Deployments aktualisieren**: Da `deployEntityAssets` nicht ueberschreibt (`.entity-deployed`-Check), muss der Spec klar machen: Template-Aenderungen wirken nur bei NEUEN Companion-Sessions. Fuer bestehende: entweder `.entity-deployed` Marker loeschen oder manuell CLAUDE.md updaten.
4. **WICHTIG**: Das Template muss die Single Source of Truth sein. Die Aenderung geht in `the how-to-session/CLAUDE.md`, nicht in eine einzelne Session.

### Betroffene Dateien
- `the how-to-session/CLAUDE.md` (Template)

### Verifikation
- Neue Companion-Session starten -> CLAUDE.md enthaelt Memory-Abschnitt
- Companion sagt bei Session-Start "Lass mich kurz in meinem Gedaechtnis nachschauen..." (oder aehnlich)
- Memory-Write bei einem der 5 Trigger -> Eintrag wird geschrieben

---

## D2: Character-Activation Bug fixen

### Problem
"Activate"-Button im CompanionTab funktioniert nicht — andere Charaktere lassen sich nicht aktivieren. Neue Sessions starten immer mit Relay.

### Root Cause (identifiziert)
Der Companion nutzt `deployEntityAssets()` — das kopiert `the how-to-session/CLAUDE.md` einmalig und ueberschreibt nie. Die `companionPrompt`-Injection passiert NUR bei Orchestrator/MPO/Audit via Template-Generatoren. Der Companion selbst bekommt seinen eigenen Charakter-Prompt NIE injiziert.

### Aktueller Code-Flow
1. `CHARACTERS_SWITCH` IPC Handler (`src/main/ipc-hub.ts:1105-1112`): Setzt `configStore.set('activeCharacterId', characterId)` -> OK
2. `getActiveCompanionPrompt()` (`src/main/session/session-manager.ts:468-478`): Liest aktiven Charakter -> OK
3. **Orchestrator/MPO/Audit**: `companionPrompt` wird in Template-Generator injiziert (z.B. `orchestrator-template.ts:127`) -> OK
4. **Companion**: `deployEntityAssets()` kopiert statisches Template, `getActiveCompanionPrompt()` wird NIE aufgerufen -> BUG

### Aufgabe
1. **Companion-CLAUDE.md dynamisch generieren**: In `startEntity()` (session-manager.ts:486-558), nach `deployEntityAssets()` (Zeile 504-506), fuer Entity `companion`:
   - `getActiveCompanionPrompt()` aufrufen
   - Die bestehende `the how-to-session/CLAUDE.md` lesen
   - Den Companion-Persona-Abschnitt am Ende anhaengen/ersetzen (analog zu Orchestrator-Pattern)
   - In die Session-CLAUDE.md schreiben (NICHT ins Template)
2. **Pattern**: Analog zu Audit (Zeile 514-516):
   ```typescript
   if (config.id === 'companion') {
     const companionPrompt = this.getActiveCompanionPrompt()
     const templateContent = fs.readFileSync(claudeMdPath, 'utf-8')
     const personaSection = companionPrompt ? `\n\n## Companion-Persona\n\n${companionPrompt}` : ''
     fs.writeFileSync(claudeMdPath, templateContent + personaSection, 'utf-8')
   }
   ```
3. **Bestehende Sessions**: Charakter-Wechsel waehrend laufender Session wirkt sich nicht aus (by design — CLAUDE.md wird bei Start generiert). Das ist OK und konsistent mit Orchestrator/MPO/Audit.
4. **Hardcodierte Persona-Definitionen aus Template-Generatoren entfernen**: Die Template-Generatoren fuer Orchestrator (`orchestrator-template.ts`), MPO (`mpo-template.ts`) und Audit (`audit-template.ts`) haben eigene Persona-Abschnitte (z.B. MPO: "Wayne Szalinski light", Orchestrator: eigener Stil). Diese muessen raus — der *Ton* kommt ausschliesslich aus dem aktiven Charakter via `companionPrompt`. Die *Funktionalitaet* (Lifecycle, Eskalation, etc.) bleibt.
   - `orchestrator-template.ts`: Hardcodierte Persona/Kommunikationsstil-Zeilen entfernen
   - `mpo-template.ts`: "Wayne Szalinski light" und Persona-Section entfernen
   - `audit-template.ts`: Falls eigene Persona-Zeilen vorhanden, entfernen
   - Die `Companion-Persona`-Section (dynamisch injiziert) wird zur einzigen Persona-Quelle

### Betroffene Dateien
- `src/main/session/session-manager.ts` (startEntity, nach deployEntityAssets)
- `src/main/session/templates/orchestrator-template.ts` (hardcodierte Persona raus)
- `src/main/session/templates/mpo-template.ts` (hardcodierte Persona raus)
- `src/main/session/templates/audit-template.ts` (hardcodierte Persona raus, falls vorhanden)

### Verifikation
- Wayne-Charakter aktivieren -> neue Companion-Session starten -> Companion antwortet als Wayne
- Relay aktivieren -> neue Companion-Session -> Companion antwortet als Relay
- MPO starten -> nutzt aktiven Charakter-Ton, NICHT "Wayne Szalinski light"
- Orchestrator starten -> nutzt aktiven Charakter-Ton
- Orchestrator/MPO/Audit: Funktionalitaet unveraendert (nur Ton aendert sich)

---

## D3: Startup-Greeting fuer Companion-Sessions

### Problem
Companion-Sessions starten stumm — der User muss immer die erste Nachricht schreiben. Companion soll proaktiv begrüssen wenn Claude bereit ist.

### Aktueller Stand
- `EntityConfig` hat bereits ein `startupGreeting`-Feld (entity-registry.ts)
- Feld ist vermutlich nicht verdrahtet: nach `queueEntityClaude()` wird kein Greeting gesendet
- `startupGreeting` wird in der Entity-Registration gesetzt aber nie konsumiert

### Aufgabe
1. **Pruefen** ob `startupGreeting` irgendwo konsumiert wird (vermutlich nicht)
2. **Verdrahten**: Nach `queueEntityClaude(entityId)` in `ipc-hub.ts`, wenn `config.startupGreeting` gesetzt:
   - Warten bis Claude in der Session bereit ist (Session-Status oder kurzer Delay)
   - `startupGreeting` als erste Nachricht per tmux send-keys in die Session schicken
3. **Greeting fuer Companion setzen**: z.B. `"Wach auf. Lies dein Profil, check dein Gedaechtnis, und sag hallo."`
4. **Greeting fuer Voice-Relay setzen**: z.B. `"Session gestartet. Warte auf Voice-Input."`
5. **Andere Entities**: Kein Greeting (Orchestrator, MPO, Audit bekommen Instruktionen vom MPO/User)

### Betroffene Dateien
- `src/main/ipc-hub.ts` (nach queueEntityClaude)
- `src/main/session/entity-registry.ts` (startupGreeting Werte setzen)
- `src/main/session/session-manager.ts` (ggf. Hilfsfunktion zum Senden)

### Verifikation
- Companion starten -> Claude begruesst den User automatisch (mit Memory-Recall, Profil-Check)
- Voice-Relay starten -> Claude meldet Bereitschaft
- Orchestrator/MPO starten -> kein automatisches Greeting

---

## Qualitaets-Gate

- [ ] D1: Memory-Abschnitt im Template, neue Sessions haben ihn
- [ ] D2: Character-Switch wirkt sich auf neue Companion-Sessions aus
- [ ] D3: Companion begruesst User automatisch bei Session-Start
- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — keine Regression
- [ ] Manueller Test: 2 verschiedene Charaktere aktivieren, je eine Companion-Session starten, Persona pruefen
