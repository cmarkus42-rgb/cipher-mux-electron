# Feature Request: Feature-Request-System als tiefe Integration

## Idee

Feature-Requests bekommen einen eigenen dedizierten Bereich in cipher-mux — gleichwertig mit dem Bugreport-System. Aktuell landen Feature-Requests ueber ein Tag im Bugreport-Flow im manuell angelegten `moreismore/`-Ordner. Das soll eine echte, veroeffentlichbare Funktion werden.

## Ziel

- Eigener Bereich in der UI (wie Bugreports, wie Testcases)
- Strukturiertes Erfassen von Feature-Requests (Titel, Beschreibung, Prioritaet, Quelle)
- Automatisches Routing: Bugreport-Funktion erkennt Feature-Request-Tag und leitet weiter
- Perspektivisch: GitHub-Issues-Anbindung (eingehende Feature-Requests von Nutzern, ausgehende Reports)

## Kontext

cipher-mux wird veroeffentlicht. Das Feature-Request-System ist Teil des Workflows der fuer externe Nutzer sichtbar und nutzbar sein soll. GitHub-Issues waere der natuerliche Kanal fuer Community-Feedback.

## Abhaengigkeiten

- Bugreport-System (besteht, als Vorlage)
- Archiv + Retention-Policy (separater Feature-Request)

---

*Erstellt: 2026-04-26, Quelle: Relay-Ideation*
