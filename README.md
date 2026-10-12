# Haus am See – Inhalte

Wochenkarte, PDFs und Bilder für haus-am-see-restaurant.de

Dieses Repo wird von der **Haus-am-See-App** befüllt. Von Hand muss hier normalerweise nichts geändert werden.

## Was hier liegt

| Pfad | Inhalt |
|---|---|
| `karten/<datum>/` | eine Wochenkarte: `karte.docx` + `karte.json` (von der App), daraus erzeugt `print.pdf`, `web.pdf`, Bilder, `ergebnis.json` |
| `files/wochenkarte-aktuell.pdf` | die zuletzt veröffentlichte Karte unter festem Namen (der PDF-Knopf der Webseite nutzt ab Embed Version 5 den festen Link `pdf` aus `data/wochenkarte.json`) |
| `img/karte-4x5.*`, `img/karte-1x1.*`, `img/karte-a4.jpg` | Bilder der zuletzt veröffentlichten Karte |
| `data/wochenkarte.json` | veröffentlichte Karte für den Code-Block auf Squarespace (inkl. `pdf`) |
| `fonts/` | Schriften der Word-Vorlage (alle unter SIL Open Font License, siehe `OFL-*.txt`) |

## Ablauf

1. Die App committet `karten/<datum>/karte.docx`, `karte.json` und `web.json` (Entwurf).
2. Die Action **Karte erstellen** (`.github/workflows/karte-erstellen.yml`) erzeugt PDFs und Bilder **nur in `karten/<datum>/`** und verschickt die Paket-Mail („Entwurf ist fertig“). Die Webseite bleibt unverändert.
3. `tools/pruefen.mjs` prüft das PDF auf abgeschnittenen Text (alle Gerichte vollständig, nichts unter der Schnittkante der Social-Bilder, keine festen Zeilenhöhen in der Vorlage). Funde stehen in `ergebnis.json` (`warnungen`) und in der Mail. Dauert zusammen ca. 1–2 Minuten.
4. **Veröffentlichen** in der App schreibt `data/wochenkarte.json` (mit festem PDF-Link `pdf`) und kopiert PDF und Bilder nach `files/` und `img/`.

Eine Karte neu erzeugen: *Actions → Karte erstellen → Run workflow*, Ordner angeben (z. B. `karten/2026-10-07`).

## Einrichtung (einmalig)

Unter *Settings → Secrets and variables → Actions* anlegen:

- `RESEND_API_KEY` – API-Key von resend.com
- `MAIL_FROM` – Absender, z. B. `Haus am See App <karte@haus-am-see-restaurant.de>` (Domain muss bei Resend bestätigt sein)
- `MAIL_TO` – Empfänger, mehrere mit Komma getrennt

Ohne diese Secrets läuft alles, nur die Mail wird übersprungen.

**Wichtig:** Dieses Repo ist öffentlich (Webseite und Instagram laden Dateien direkt von hier). Keine Zugangsdaten oder Entwürfe hier ablegen.
