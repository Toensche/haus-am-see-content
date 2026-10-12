// Prüft die gerenderte Karte (print.pdf) auf abgeschnittenen Text. Ergebnis: Warnungen für ergebnis.json und die Mail.
// Aufruf: node tools/pruefen.mjs karten/2026-10-14   (bilder.mjs ruft pruefeKarte() selbst auf)
//
// 1. Jeder Gerichtname und jede Beschreibung aus karte.json muss vollständig im PDF stehen.
// 2. Kein Text der Gerichte darf unter die Schnittkante der Social-Bilder reichen (dort beginnt die Allergenliste).
// 3. Die Gerichte-Zeilen der Word-Datei dürfen keine feste Höhe ("genau") haben – sonst schneidet Word/LibreOffice
//    eine zu lange Beschreibung unten ab, obwohl der Text im PDF noch vorhanden ist.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { INHALT_UNTEN } from './bilder.mjs';

const SPALTE_BIS = 480; // pt – rechts davon stehen die Preise
const entity = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => entity[e]).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const ohneLeer = (s) => String(s ?? '').replace(/\s+/g, '');

/** Wörter mit Position aus `pdftotext -bbox` (Seite 1). */
export function woerterAusBbox(html) {
  const seite = html.match(/<page width="([\d.]+)" height="([\d.]+)"/);
  const woerter = [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
    ([, x0, y0, x1, y1, t]) => ({ x0: +x0, y0: +y0, x1: +x1, y1: +y1, text: decode(t) }),
  );
  return { breite: Number(seite?.[1] ?? 595.3), hoehe: Number(seite?.[2] ?? 841.9), woerter };
}

/**
 * @param karte   Inhalt von karte.json ({ days: [{ tag, name, beschreibung }] })
 * @param pdf     { hoehe, woerter } aus woerterAusBbox
 * @param docxXml word/document.xml der befüllten Karte
 */
export function pruefeKarte(karte, pdf, docxXml = '') {
  const warnungen = [];
  // Bereich der Gerichte: unter der Ruhetag-Zeile, über dem Kopf der Allergenliste, links der Preise
  const ruhetag = pdf.woerter.find((w) => w.text === 'Ruhetag');
  const allergenKopf = pdf.woerter.find((w) => w.text === 'Gluten' && (!ruhetag || w.y0 > ruhetag.y1));
  const oben = ruhetag ? ruhetag.y1 : 0;
  const imBereich = pdf.woerter.filter((w) => w.y0 > oben && w.x0 < SPALTE_BIS && (!allergenKopf || w.y0 < allergenKopf.y0 - 2));
  // Lesereihenfolge: nach Zeilen (Grundlinie), dann von links nach rechts
  const sortiert = [...imBereich].sort((a, b) => (Math.abs(a.y1 - b.y1) > 2 ? a.y1 - b.y1 : a.x0 - b.x0));
  const text = ohneLeer(sortiert.map((w) => w.text).join(''));

  // Tage der Reihe nach suchen – jeder Tag muss nach dem vorigen stehen (auch bei ähnlichen Texten)
  let ab0 = 0;
  for (const d of karte.days ?? []) {
    const soll = ohneLeer(`${d.name}${d.beschreibung}`);
    if (!soll) continue;
    const fund = text.indexOf(soll, ab0);
    if (fund >= 0) {
      ab0 = fund + soll.length;
      continue;
    }
    // Wie weit ist der Text vollständig? Ab dort fehlt etwas.
    let n = 0;
    while (n < soll.length && text.indexOf(soll.slice(0, n + 1), ab0) >= 0) n++;
    const woerter = `${d.name} ${d.beschreibung}`.split(/\s+/);
    let zeichen = 0;
    const ab = woerter.findIndex((w) => (zeichen += w.length) > n);
    warnungen.push(`${d.tag}: Der Text ist im PDF nicht vollständig – ab „${woerter.slice(Math.max(0, ab), ab + 3).join(' ')}…“ fehlt etwas oder ist abgeschnitten. Bitte die Beschreibung kürzen.`);
  }

  const kante = pdf.hoehe * INHALT_UNTEN;
  const unterster = imBereich.reduce((u, w) => (!u || w.y1 > u.y1 ? w : u), null);
  if (unterster && unterster.y1 > kante) {
    warnungen.push('Die Gerichte reichen zu weit nach unten – bis an die Allergenliste. Im Bild für Facebook/Instagram wird der Text unten abgeschnitten. Bitte Beschreibungen kürzen.');
  }

  // Im Haupttext steht nur die Gerichte-Tabelle; die Allergenliste liegt in der Fusszeile und darf "genau" bleiben
  if (/w:hRule="exact"/.test(docxXml)) {
    warnungen.push('Die Word-Vorlage hat feste Zeilenhöhen – längere Beschreibungen werden darin unten abgeschnitten. Bitte Anto Bescheid geben (npm run vorlagen:zeilenhoehe).');
  }
  return warnungen;
}

/** Prüft karten/<datum>/ (print.pdf, karte.json, karte.docx). Fehler beim Prüfen selbst werden zur Warnung, nie zum Abbruch. */
export function pruefeOrdner(dir) {
  try {
    const karte = JSON.parse(fs.readFileSync(path.join(dir, 'karte.json'), 'utf8'));
    const html = execFileSync('pdftotext', ['-bbox', '-f', '1', '-l', '1', path.join(dir, 'print.pdf'), '-'], { encoding: 'utf8', maxBuffer: 20e6 });
    const docxXml = execFileSync('unzip', ['-p', path.join(dir, 'karte.docx'), 'word/document.xml'], { encoding: 'utf8', maxBuffer: 50e6 });
    return pruefeKarte(karte, woerterAusBbox(html), docxXml);
  } catch (err) {
    console.log(`::warning::Textprüfung nicht möglich: ${err.message}`);
    return ['Die Karte konnte nicht auf abgeschnittenen Text geprüft werden – bitte das PDF kurz ansehen.'];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const warnungen = pruefeOrdner(process.argv[2]);
  console.log(warnungen.length ? warnungen.join('\n') : 'Kein abgeschnittener Text.');
}
