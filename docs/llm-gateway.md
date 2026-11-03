# LLM-Gateway

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an dem LLM-Gateway arbeitet, liest diese Datei vollständig.

## LLM-Aufrufe: das Gateway, nicht der eigene Zoo

Seit dem 2026-10-02 gehen Modellaufrufe an das **litellm-Tier-Gateway auf gateway-host**
(OpenAI-kompatibel, Adresse und Schlüssel in `~/.cipher-litellm.env`), nicht mehr an einen im Mux gepflegten
Ollama-Katalog. Der Grund ist nicht Bequemlichkeit: Jede Anwendung im Haus, die Host, Port und
Modellnamen selbst hält, pflegt dieselbe Tabelle noch einmal — und sie altert in jeder einzeln.
Das Gateway hat sie einmal (`litellm/config.yaml`).

**Tiers statt Modellnamen.** `t1`/`t2` laufen lokal auf gateway-host und kosten nichts, taugen aber nicht
zum Formulieren; `t3` ist das Arbeitstier (MiniMax M3); `t4`/`t5` sind Sonnet und Opus. Wer hier
wählt, wählt eine **Preis- und Qualitätsklasse**, kein Modell — ein Modellwechsel am Gateway
erreicht den Mux ohne Codeänderung.

**Vier Dinge, die hier leicht kaputtgehen:**

1. **Der Schlüssel steht in `~/.cipher-litellm.env`, nicht in der Config.** Eine Config wandert in
   Backups, Logs und Fehlerberichte. `readGatewayKey` liest die Datei, und keine Fehlermeldung
   des Klienten enthält den Wert — `test/main/bugreport-enrich.test.ts` hält das fest. Erkannt
   wird **`LITELLM_MASTER_KEY`** (so heißt er auch im Betriebslog von `projekt-f`), dazu
   `LLM_API_KEY` und `LITELLM_API_KEY` als geduldete Schreibweisen. Die Datei darf auch
   `LITELLM_BASE_URL` tragen, und die **schlägt die Config**: wer das Gateway umzieht, ändert
   dann genau eine Datei.
2. **`/v1` wird ergänzt, wenn es fehlt.** Die Env-Datei trägt `http://…:4000`, die Config
   `http://…:4000/v1`. Ohne Normalisierung landet die Anfrage auf `/chat/completions` statt
   `/v1/chat/completions`, und litellm antwortet dort **gar nicht** — der Aufruf läuft in die
   Frist statt in einen 404, und ein 45-Sekunden-Timeout sieht aus wie ein überlastetes Gateway.
   Genau daran ist der erste Rauchtest am 2026-10-02 gescheitert; gegen einen Mock wäre weder
   das noch der Schlüsselname je aufgefallen.
3. **`node:http`, nicht `fetch`.** Dieselbe Falle wie beim Ollama-Klienten: `fetch` im
   Main-Prozess geht über Electrons Chromium-Netzstack und fällt dort über
   System-Proxy-Einstellungen.
4. **Der Prompt und `parseEnrichedOutput` müssen dieselben Feldnamen nennen.** Der Parser liest
   zeilenweise `name:` und erkennt Listen an `- `; nennt der Prompt ein Feld anders, fällt es
   **still** auf seinen Default zurück. `ERWARTETE_FELDER` und ein Test halten die Naht.

**Der Bugreport nutzt das als erster:** Diktat rein, aufgeräumter Report raus, Original bleibt
wörtlich erhalten, Ausfall blockiert nichts. Dazu Panezustand (`capture-pane`, Pane-Maße,
`alternate_on`) und Anker-Commit im Report, plus eine Notiz, die die outbox-Datei spiegelt.
