// Rendert print.pdf zu Bildern und schneidet sie für Social Media zu.
// Aufruf: node tools/bilder.mjs karten/2026-10-07
//
// Ergebnis im Ordner:
//   karte-a4.jpg          ganze Seite (WhatsApp, Download)
//   karte-4x5.png/.jpg    1080×1350 – Instagram/Facebook Hochformat
//   karte-1x1.png/.jpg    1080×1080 – quadratisch
//   ergebnis.json         Status für die App
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

// Der Karteninhalt (Logo bis Fusszeile "Die ganze Vielfalt …") endet vor der Allergenliste,
// die bei ca. 76 % der Seitenhöhe beginnt. Alles darunter wird für Social Media weggeschnitten.
const INHALT_UNTEN = 0.755;

/** Schneidet die A4-Seite auf das Seitenverhältnis breite:hoehe zu (Inhaltsbereich bleibt vollständig). */
export async function zuschneiden(seite, breite, hoehe, zielBreite) {
  const { width: w, height: h } = await sharp(seite).metadata();
  const inhaltH = Math.round(h * INHALT_UNTEN);
  const zielW = Math.round((inhaltH * breite) / hoehe);
  let bild = sharp(seite).extract({ left: 0, top: 0, width: w, height: inhaltH });
  if (zielW <= w) {
    // schmaler als die Seite: links/rechts gleichmässig abschneiden (dort ist nur Rand)
    bild = sharp(await bild.toBuffer()).extract({ left: Math.round((w - zielW) / 2), top: 0, width: zielW, height: inhaltH });
  } else {
    // breiter als die Seite: links/rechts weiss auffüllen
    const rand = Math.round((zielW - w) / 2);
    bild = sharp(await bild.toBuffer()).extend({ left: rand, right: zielW - w - rand, background: '#ffffff' });
  }
  // sharp skaliert immer vor extend() – darum erst zwischenspeichern, dann skalieren
  return sharp(await bild.toBuffer())
    .resize(zielBreite, Math.round((zielBreite * hoehe) / breite), { kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' });
}

async function main(dir) {
  const pdf = path.join(dir, 'print.pdf');
  const seiten = Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1] ?? 0);

  // Mit 300 dpi rendern und erst danach herunterrechnen (Lanczos) – Text und Icons bleiben knackig
  const basis = path.join(dir, 'seite');
  execFileSync('pdftoppm', ['-r', '300', '-png', '-singlefile', '-f', '1', '-l', '1', pdf, basis]);
  const seite = fs.readFileSync(`${basis}.png`);
  fs.rmSync(`${basis}.png`);

  // Ganze Seite: 1654 px breit (200 dpi) – reicht für WhatsApp und Download
  await sharp(seite).flatten({ background: '#ffffff' }).resize(1654, null, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(dir, 'karte-a4.jpg'));
  for (const [name, b, h] of [['karte-4x5', 4, 5], ['karte-1x1', 1, 1]]) {
    const bild = await zuschneiden(seite, b, h, 1080);
    await bild.clone().png({ compressionLevel: 9 }).toFile(path.join(dir, `${name}.png`));
    await bild.clone().jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(dir, `${name}.jpg`));
  }

  const warnungen = [];
  if (seiten !== 1) warnungen.push(`Die Karte hat ${seiten} Seiten statt einer – vermutlich sind die Texte zu lang.`);

  const groesse = (f) => fs.statSync(path.join(dir, f)).size;
  const ergebnis = {
    status: 'fertig',
    erstellt: new Date().toISOString(),
    seiten,
    warnungen,
    bytes: { 'print.pdf': groesse('print.pdf'), 'web.pdf': groesse('web.pdf') },
    dateien: fs.readdirSync(dir).filter((f) => f !== 'ergebnis.json').sort(),
  };
  fs.writeFileSync(path.join(dir, 'ergebnis.json'), JSON.stringify(ergebnis, null, 2) + '\n');
  console.log(ergebnis);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Aufruf: node tools/bilder.mjs karten/<datum>');
    process.exit(1);
  }
  await main(dir);
}
