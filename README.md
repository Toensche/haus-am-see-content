# Haus am See – Inhalte

Wochenkarte, PDFs und Bilder für haus-am-see-restaurant.de

Dieses Repo wird von der **Haus-am-See-App** befüllt. Von Hand muss hier normalerweise nichts geändert werden.

## Was hier liegt

| Pfad | Inhalt |
|---|---|
| `karten/<datum>/` | eine Wochenkarte: `karte.docx` + `karte.json` (von der App), daraus erzeugt `print.pdf`, `web.pdf`, Bilder, `ergebnis.json` |
| `files/wochenkarte-aktuell.pdf` | immer die aktuelle Karte – der Link auf der Webseite zeigt dauerhaft hierher |
| `img/karte-4x5.*`, `img/karte-1x1.*`, `img/karte-a4.jpg` | aktuelle Bilder für Social Media |
| `data/wochenkarte.json` | aktuelle Karte für den Code-Block auf Squarespace |
| `fonts/` | Schriften der Word-Vorlage (alle unter SIL Open Font License, siehe `OFL-*.txt`) |

## Ablauf

1. Die App committet `karten/<datum>/karte.docx` und `karte.json`.
2. Die Action **Karte erstellen** (`.github/workflows/karte-erstellen.yml`) erzeugt PDFs und Bilder, aktualisiert `files/` und `img/` und verschickt die Paket-Mail.
3. Dauert ca. 1–2 Minuten.

Eine Karte neu erzeugen: *Actions → Karte erstellen → Run workflow*, Ordner angeben (z. B. `karten/2026-10-07`).

## Einrichtung (einmalig)

Unter *Settings → Secrets and variables → Actions* anlegen:

- `RESEND_API_KEY` – API-Key von resend.com
- `MAIL_FROM` – Absender, z. B. `Haus am See App <karte@haus-am-see-restaurant.de>` (Domain muss bei Resend bestätigt sein)
- `MAIL_TO` – Empfänger, mehrere mit Komma getrennt

Ohne diese Secrets läuft alles, nur die Mail wird übersprungen.

**Wichtig:** Dieses Repo ist öffentlich (Webseite und Instagram laden Dateien direkt von hier). Keine Zugangsdaten oder Entwürfe hier ablegen.
