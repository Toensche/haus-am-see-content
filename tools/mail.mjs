// Schickt das Paket (Druck-PDF, Word, Bilder) per Resend an die Betreiberin.
// Aufruf: node tools/mail.mjs karten/2026-10-07
// Secrets: RESEND_API_KEY, MAIL_FROM, MAIL_TO (mehrere Empfänger mit Komma trennen)
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const { RESEND_API_KEY, MAIL_FROM, MAIL_TO } = process.env;

if (!RESEND_API_KEY || !MAIL_FROM || !MAIL_TO) {
  console.log('::notice::Paket-Mail übersprungen – RESEND_API_KEY, MAIL_FROM oder MAIL_TO fehlen als Secret.');
  process.exit(0);
}

const karte = JSON.parse(fs.readFileSync(path.join(dir, 'karte.json'), 'utf8'));
const ergebnis = JSON.parse(fs.readFileSync(path.join(dir, 'ergebnis.json'), 'utf8'));
const name = karte.dateiname; // z. B. HausAmSee_Mittagstisch_07.10.-09.10.2026

const anhang = (datei, dateiname) => ({
  filename: dateiname,
  content: fs.readFileSync(path.join(dir, datei)).toString('base64'),
});

const attachments = [
  anhang('print.pdf', `${name}.pdf`),
  anhang('karte.docx', `${name}.docx`),
  anhang('karte-4x5.jpg', `${name}_Hochformat.jpg`),
  anhang('karte-1x1.jpg', `${name}_Quadrat.jpg`),
  anhang('karte-a4.jpg', `${name}_Seite.jpg`),
];

const warnung = ergebnis.warnungen.length
  ? `<p style="background:#EAE5D8;padding:10px 14px;border-left:5px solid #356F88"><strong>Bitte prüfen:</strong> ${ergebnis.warnungen.join(' ')}</p>`
  : '';

const html = `
<div style="font-family:Georgia,serif;color:#394C4B;font-size:16px;line-height:1.5">
  <h2 style="color:#3B643A;margin:0 0 12px">Die Karte ist fertig 🌿</h2>
  <p>Unser Mittagstisch vom <strong>${karte.kw}</strong> ist erstellt und auf der Webseite.</p>
  ${warnung}
  <p>Im Anhang:</p>
  <ul>
    <li><strong>${name}.pdf</strong> – zum Ausdrucken</li>
    <li><strong>${name}.docx</strong> – falls noch etwas geändert werden muss</li>
    <li>Bilder für Social Media (Hochformat, Quadrat, ganze Seite)</li>
  </ul>
  <p style="color:#6D8E6F;font-size:14px">Diese Mail kommt automatisch aus der Haus-am-See-App.</p>
</div>`;

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: MAIL_FROM,
    to: MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
    subject: `Mittagstisch ${karte.kw}: Karte ist fertig`,
    html,
    attachments,
  }),
});

const antwort = await res.text();
if (!res.ok) {
  console.error(`::error::Paket-Mail fehlgeschlagen (${res.status}): ${antwort}`);
  process.exit(1);
}
console.log('Paket-Mail verschickt:', antwort);
