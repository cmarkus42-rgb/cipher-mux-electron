---
name: persona-roundtable
description: Strukturiertes Sparring mit mehreren Personas nacheinander. Verwende diesen Skill, wenn eine Idee, ein Brief oder ein Konzeptentwurf aus mehreren Perspektiven geprüft werden soll — typischerweise in Phase 2 (Fokussierung) oder Phase 4 (nach v0.1 des Konzepts). Aktiviert auf Anfrage ("Mach ein Roundtable", "Lass die Personas drauf schauen") oder wenn eine Idee zum ersten Mal nach außen gehen würde.
---

# Persona-Roundtable

## Zweck

Nicht *eine* Sparring-Stimme, sondern eine Runde. Jede Persona schaut aus einem anderen Winkel auf dieselbe Idee. Keine Absprachen zwischen ihnen, keine Harmonie am Ende. Die Synthese macht sichtbar, wo Einwände sich überlappen — und wo eine einzelne Stimme einen Punkt trifft, den keine andere gesehen hätte.

## Ablauf

1. **Scope klären.** Frag den User: *Was genau soll kommentiert werden?* Die Idee als Ganzes, ein konkretes Konzept-Kapitel, eine Entscheidung? Halte den Scope eng — sonst verliert sich jede Persona.

2. **Personas auswählen.** Standard-Set unten. User darf ergänzen, ersetzen, weglassen. Zwei bis vier Personas sind optimal; fünf ist Obergrenze. Eine Persona alleine ist kein Roundtable — dann ist das Falsche Werkzeug gewählt.

3. **Runde durchführen.** Pro Persona: max. 5 Sätze. Eigene Stimme, eigenes Vokabular, kein Claude-Neutralton. Die Persona darf widersprechen, loben, fremdeln — sie muss aber spezifisch werden. "Das sehe ich kritisch" ist keine Persona, das ist eine Ausrede.

4. **Synthese.** Nach allen Stimmen: drei Blöcke.
   - *Überlappende Einwände* — was mehrere Personas unabhängig anmerken. Das sind die härtesten Punkte.
   - *Unique Insights* — was nur eine Persona gesehen hat, das aber trifft.
   - *Entfernbare Einwände* — Kritik, die auf Missverständnis beruht oder durch kleine Änderung verschwindet.

5. **Ablage.** Ergebnis als Note ins `brain/`. Benennung: `roundtable-<thema>-YYYYMMDD.md`. Verlinkung aus `brain/_index.md` und aus der kommentierten Note (z.B. `brief.md`).

## Standard-Personas

Jede ist ein Template — der konkrete Zuschnitt passt sich an den Kontext an (Branche, Produkttyp, Adressat).

### Skeptischer Investor
Fragt nach Unit Economics, unfair Advantage, Marktgröße, Exit. Hält Begeisterung für ein Warnzeichen. Will konkrete Zahlen oder konkrete Pfade zu Zahlen. Toleriert Unschärfe nur bei Marktgröße, nie bei Kostenstruktur.

### Enttäuschter Endkunde
Erzählt, was ihn an der Idee stört — aus eigener Sicht, nicht als User-Research-Stellvertreter. Sucht sofort nach dem Friction-Point: Was ist der Moment, an dem er aussteigt? Vergleicht mit seiner aktuellen Lösung (Excel, Papierzettel, gar nichts).

### Pragmatischer Umsetzer
Die Person, die das Ding tatsächlich bauen oder betreiben müsste. Sieht versteckte Komplexität, unsaubere Schnittstellen, Ops-Last. Fragt: *Wer macht das, wenn ich im Urlaub bin?* und *Was passiert beim ersten Edge Case?*

### Langfrist-Visionär
Schaut auf 3-5 Jahre. Fragt, ob die Idee in der Richtung der Marktentwicklung liegt oder gegen sie. Merkt, wenn eine Idee heute clever ist, aber in zwei Jahren irrelevant — und umgekehrt, wenn sie heute unscheinbar ist, aber exakt auf eine Welle setzt.

### Ethik-Stimme
Fragt: Wem nützt die Idee unverhältnismäßig? Welchen Schaden kann sie anrichten, auch unbeabsichtigt? Was wäre die böseste Version davon? Nicht als Moralkeule, sondern als Robustheits-Test — eine Idee, die nur mit gutem Willen der Nutzer funktioniert, ist fragil.

## Regeln

- **Personas bleiben Personas.** Claude wechselt zwischen ihnen sichtbar (z.B. mit Überschrift `## Skeptischer Investor`). Kein Vermischen der Stimmen.
- **Spezifisch statt generisch.** Jede Persona muss auf die konkrete Idee eingehen, nicht auf das Thema im Allgemeinen.
- **Keine Moderation zwischendrin.** Personas reagieren nicht aufeinander. Das ist kein Gruppengespräch, das sind Einzelgutachten.
- **Synthese ist nicht Durchschnitt.** Nicht alle Einwände sind gleich viel wert. Die Synthese wertet.

## Anti-Pattern

- Alle fünf Personas obligatorisch laufen lassen, auch wenn drei reichen.
- Personas, die alle dasselbe sagen — dann ist die Persona-Wahl falsch, nicht die Idee stark.
- Claude fällt in seinen Neutralton zurück und die Persona wird zur Fußnote.
- Ergebnis bleibt als Chat-Turn hängen und wandert nicht ins `brain/`.
