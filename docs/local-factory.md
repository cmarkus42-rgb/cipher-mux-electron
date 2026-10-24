# Local Cyber Factory und Local Workshop

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an Local Cyber Factory oder Local Workshop arbeitet, liest diese Datei vollständig.

## Local Cyber Factory — Claude schneidet zu, ein lokales Modell codet

Seit 0.12.0. Spec mit Messungen: `docs/superpowers/specs/2026-10-09-local-cyber-factory-design.md`.
Zwei Rollen: `local-factory` (Claude Code, darf keinen Produktionscode schreiben) und
`local-worker` (opencode, Modell aus `agent.localWorker` — Basis-URL, Modell, Kontext, Ausgabelimit;
kein Schlüssel). Der Läufer in `src/main/local-factory/` hat kein Modell: Vorprüfung (roter
Abnahmetest, sauberer Baum, Branch des Laufs), frischer Worker pro Versuch, Ende über
`REPORT.md` + `session.idle`, Gate über Testbefehl, Prüfsumme und `git diff --no-renames`, grün →
ein Commit (`--no-verify`), rot → Patch + Reset, höchstens zwei Versuche (`lauf.json` unter
`runs/<ws>/local-factory/laeufe/`), dann Eskalation. **`agent.skipPermissions` muss an sein**,
sonst hängt opencode im Rückfrage-Dialog — der Mux lehnt dann mit genau diesem Grund ab.

**Vier gemessene Dinge, die hier still kaputtgehen** (2026-10-09, opencode 1.18.35, qwen3.8-27b):

1. **Am Ausgabelimit endet das lokale Modell still** — kein Werkzeugaufruf, kein Fehler, nur
   `session.idle` ohne `REPORT.md`. Der Läufer wertet das nach der Ruhezeit als Fehlversuch.
2. **Text + `\r` in einem `send-keys` schickt bei Claude Code nicht ab** — es wird ein
   Zeilenumbruch im Eingabefeld. `submitLine` tippt den Text und schickt Enter getrennt.
3. **Der lokale MCP-Eintrag schlägt die `.mcp.json`.** Ohne `X-Mux-Entity` darin sieht der Server
   keine Rolle — bis 0.12.0 galt das für **alle** Claude-Code-Rollen (Companion-Memory-Grenze
   inklusive). `buildClaudeCodeMcpEntry` trägt die Rolle.
4. **Claude Code verbindet MCP asynchron** und blendet Eingabevorschläge grau ins Feld ein. Ein
   Architekt kann im ersten Zug „Werkzeug fehlt“ melden, und eine Zeile im Eingabefeld ist nicht
   zwingend eine Eingabe des Users.

Grundlast von opencode: rund 15 k Tokens Kontext pro Auftrag (System-Prompt + Werkzeuge) — das
Argument für einen späteren Vergleich mit pi.

## Local Workshop — der Claude-Alltag, Routine lokal

Seit 0.12.8 (Branch `local-workshop`). Spec: `docs/superpowers/specs/2026-10-12-local-workshop-design.md`.
Rolle `local-workshop` (Claude Code), derselbe Läufer und derselbe `local-worker` wie bei der
Factory — aber als tägliche Arbeitsweise: Claude denkt, Routine geht an das lokale Modell, und am
Ende steht eine Zahl, ob sich das lohnt. **Drei Unterschiede zur Factory:**

1. **Kein Pflicht-Abnahmetest.** `geschuetzteTests` darf leer sein (nur für diese Rolle);
   `testBefehl` bleibt Pflicht, das Gate läuft weiter.
2. **Profile statt einer Worker-Config.** `agent.localWorkerProfiles` (Name → Basis-URL, Modell,
   Kontext, Ausgabelimit, optional `modelOptions`) und `agent.localWorkerDefaultProfile`. Ohne
   Profile gilt das alte `agent.localWorker` als Profil `default` — bestehende Configs laufen
   unverändert. `modelOptions` gehen unverändert an opencode (`buildLocalProviderBlock`), der Code
   rät keine Schlüssel. Gewählt wird pro Dispatch über `profil`.
3. **Ein Urteil pro Häppchen.** `accept` trägt `ergebnis` (`uebernommen`, `nachgebessert`,
   `neu-geschnitten`, `selbst-uebernommen`), `kategorie` (`test boilerplate refactor doku ui config
   logik`) und `notiz` (Pflicht bei `nachgebessert`). Status danach `beurteilt`; ein beurteiltes
   Häppchen lässt sich nicht erneut starten. Fakten misst der Läufer, das Urteil gibt Claude.

**Das Profil reicht eine Datei an den Worker:** `local-profile.json` im Run-Verzeichnis des
Workers (`writeLocalProfileFile` / `readLocalProfileFile`, Inhalt `{profil, cfg}`). Der Adapter liest
die Datei; die Bilanz bekommt Profil und Modell aus dem Rückgabewert von `startFreshWorker` — beides
stammt aus **demselben** `resolveLocalWorkerProfile`-Aufruf, sonst stünde in der Bilanz ein anderes
Modell als das, das lief. Landet die Session nicht im erwarteten Run-Verzeichnis (Workspace
gelöscht → ungebunden), wird sie gestoppt und `Workspace nicht mehr vorhanden` geworfen; der
Adapter hätte die Datei sonst im falschen Verzeichnis gesucht und still das Standardprofil genommen.
Eine Messung am falschen Modell ist schlimmer als keine.

**Worker-Sperre pro Workspace** (`worker-lock.ts`): Factory und Workshop teilen sich den einen
`local-worker`. Ohne Sperre würde jede Rolle beim Start den Worker der anderen beenden.

**Bilanz:** `~/.config/cipher-mux/entities/local-workshop/bilanz.jsonl` ist die Wahrheit, die Note
„Local Workshop: Bilanz" ist eine Sicht darauf (`bilanz-sink.ts`). Scheitert die Note, ist das eine
Warnung, kein Fehler — die Zeile steht dann trotzdem in der jsonl.

**Zwei Rennen sind in `judge`/`prepare` behoben — beim Ändern nicht wieder einbauen:** ein
Urteil lädt den Lauf **frisch**, bevor es speichert (sonst überschreibt es einen zwischenzeitlich
fertigen Versuch), und ein Doppelurteil wird per **In-Memory-Claim** abgefangen (zwei gleichzeitige
`accept` sähen beide „noch nicht beurteilt"). `prepare` lädt ebenfalls frisch und speichert ohne
`await` dazwischen. Im Urteil gilt außerdem: erst die Bilanzzeile, dann der Status; die Note ist
best effort (`bilanz-sink`).

**Ollama-Falle:** Das Kontextfenster lässt sich über die OpenAI-kompatible API **nicht** setzen.
`contextWindow` im Profil sagt opencode nur, wie viel es einplanen darf; Ollama selbst schneidet
bei seinem eigenen `num_ctx` ab — still. Wirksam ist nur `num_ctx` im Modelfile.
`OLLAMA_CONTEXT_LENGTH` wirkt global für alle Modelle und ist deshalb keine Profil-Einstellung.
