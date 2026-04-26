---
name: persona-roundtable
description: "Strukturiertes Sparring mit mehreren Nutzer-Personas. Verwende diesen Skill wenn die Zielgruppe unklar ist, die Idee 'fuer alle' sein soll, oder nach v0.1 der Anforderungen. Aktiviert auf Anfrage ('Roundtable', 'Lass verschiedene Nutzer draufschauen') oder wenn Relay es vorschlaegt."
---

# Persona-Roundtable

## Zweck

Nicht eine Sparring-Stimme, sondern eine Runde. Jede Persona schaut aus einem anderen Winkel auf die Idee. Keine Absprachen, keine Harmonie. Die Synthese macht sichtbar wo Einwaende sich ueberlappen — und wo eine einzelne Stimme einen Punkt trifft den keine andere gesehen haette.

Im Software-Kontext: Verschiedene Nutzertypen pruefen ob die geplante App fuer sie funktionieren wuerde. Das ist Zielgruppen-Validierung durch Perspektivwechsel.

## Ablauf

1. **Scope klaeren.** Frag den User: *Was genau soll kommentiert werden?* Die Idee als Ganzes, ein bestimmtes Feature, die Zielgruppe? Halte den Scope eng.

2. **Personas auswaehlen.** Standard-Set unten. User darf ergaenzen, ersetzen, weglassen. Zwei bis vier Personas sind optimal, fuenf ist Obergrenze. Relay passt die Personas an den konkreten Projekt-Kontext an.

3. **Runde durchfuehren.** Pro Persona: max. 5 Saetze. Eigene Stimme, eigenes Vokabular. Die Persona darf widersprechen, loben, fremdeln — sie muss aber spezifisch werden. "Das sehe ich kritisch" ist keine Aussage.

4. **Synthese.** Nach allen Stimmen drei Bloecke:
   - *Ueberlappende Einwaende* — was mehrere Personas unabhaengig anmerken. Die haertesten Punkte.
   - *Unique Insights* — was nur eine Persona gesehen hat, das aber trifft.
   - *Entfernbare Einwaende* — Kritik die auf Missverstaendnis beruht oder durch kleine Aenderung verschwindet.

5. **Ablage.** Ergebnis als Note: `brain/roundtable-<thema>.md`. Verlinkung aus `brain/_index.md`.

## Standard-Personas (Software-Kontext)

Jede ist ein Template — der konkrete Zuschnitt passt sich an das Projekt an.

### Der Erste Nutzer
Die Person die das Tool als allererste benutzen wuerde. Beschreibt ihren Alltag, ihr Problem, was sie heute stattdessen tut. Fragt: "Wuerde ich das wirklich oeffnen? Oder ist mein Excel-Sheet gut genug?"

### Der Genervte Wechsler
Hat schon drei aehnliche Tools probiert und alle wieder geloescht. Weiss genau was ihn stoert. Sucht sofort den Friction-Point: "Ab welchem Schritt gebe ich auf?"

### Der Technische Pragmatiker
Die Person die das Ding betreiben oder warten muesste. Sieht versteckte Komplexitaet, Ops-Last, Abhaengigkeiten. Fragt: "Was passiert wenn der Server um 3 Uhr nachts abstuerzt und niemand da ist?"

### Der Zufall-Nutzer
Wurde von einem Freund eingeladen, hat keine Ahnung was das Tool soll. Klickt sich durch und urteilt in 30 Sekunden. Fragt: "Was soll ich hier tun? Wo fange ich an?"

### Der Power-User (6 Monate spaeter)
Benutzt das Tool taeglich und stoesst an Grenzen. Fragt: "Kann ich X automatisieren? Warum kann ich Y nicht anpassen? Wo ist der Export?"

## Regeln

- **Personas bleiben Personas.** Sichtbarer Wechsel (Ueberschrift). Kein Vermischen der Stimmen.
- **Spezifisch statt generisch.** Jede Persona geht auf die konkrete Idee ein, nicht auf das Thema im Allgemeinen.
- **Keine Moderation zwischendrin.** Einzelgutachten, kein Gruppengespraech.
- **Synthese ist nicht Durchschnitt.** Nicht alle Einwaende sind gleich viel wert. Die Synthese wertet.

## Anti-Pattern

- Alle fuenf Personas obligatorisch, auch wenn drei reichen.
- Personas die alle dasselbe sagen — dann ist die Wahl falsch.
- Relay faellt in Neutralton zurueck und die Persona wird zur Fussnote.
- Ergebnis bleibt im Chat und wandert nicht ins `brain/`.
