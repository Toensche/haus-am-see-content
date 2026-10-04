#!/usr/bin/env bash
# Kompletter Ablauf der Action "Karte erstellen". Die Workflow-Datei ruft nur dieses Skript auf,
# damit Änderungen hier keinen Token mit Workflow-Berechtigung brauchen.
#
# Zu erstellen ist jede karten/<datum>/ mit karte.docx, deren ergebnis.json fehlt oder aus einer
# anderen karte.docx gebaut wurde (Feld "docx" = git hash-object der Quelle).
# Optional: $1 = bestimmter Ordner (erzwingt Neuerstellung, z. B. von Hand über "Run workflow").
set -euo pipefail

# Läufe sind per concurrency nacheinander, starten aber auf ihrem auslösenden Commit.
# Darum zuerst auf den neuesten Stand – sonst baut ein später Lauf Veraltetes und scheitert beim Push.
git fetch -q origin main
git reset -q --hard origin/main

# Gebaut aus genau dieser karte.docx?
aktuell() { [ -f "$1/ergebnis.json" ] && [ "$(node -p "require('./$1/ergebnis.json').docx ?? ''")" = "$(git hash-object "$1/karte.docx")" ]; }

if [ -n "${1:-}" ]; then
  ORDNER=("${1%/}")
  rm -f "${ORDNER[0]}/ergebnis.json"
else
  ORDNER=()
  for d in karten/*/; do
    d="${d%/}"
    [ -f "$d/karte.docx" ] && ! aktuell "$d" && ORDNER+=("$d")
  done
fi

if [ ${#ORDNER[@]} -eq 0 ]; then
  echo "Nichts zu tun – alle Karten sind erstellt."
  exit 0
fi
echo "Zu erstellen: ${ORDNER[*]}"

echo "::group::Werkzeuge und Schriften"
sudo apt-get update -qq
sudo apt-get install -y -qq --no-install-recommends libreoffice-writer ghostscript poppler-utils
mkdir -p ~/.local/share/fonts
cp fonts/*.ttf ~/.local/share/fonts/
fc-cache -f
fc-list : family | grep -E 'Glegoo|Indie Flower' || { echo "::error::Schriften fehlen"; exit 1; }
soffice --version
echo "::endgroup::"

# print.pdf: keine Auflösungsreduzierung, verlustfreie Bildkompression
PDF_OPTIONEN='pdf:writer_pdf_Export:{"ReduceImageResolution":{"type":"boolean","value":"false"},"UseLosslessCompression":{"type":"boolean","value":"true"},"Quality":{"type":"long","value":"100"}}'

for dir in "${ORDNER[@]}"; do
  echo "::group::$dir"
  (
    cd "$dir"
    soffice --headless --convert-to "$PDF_OPTIONEN" --outdir . karte.docx
    mv karte.pdf print.pdf

    # web.pdf: print.pdf ist dank Vektor-Icons und verlustfreier Kompression meist schon klein.
    # Unter 1 MB wird es 1:1 übernommen (beste Qualität); sonst Bilder auf 220 dpi verkleinern.
    if [ "$(stat -c %s print.pdf)" -le 1000000 ]; then
      cp print.pdf web.pdf
    else
      gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.6 -dNOPAUSE -dQUIET -dBATCH \
         -dDetectDuplicateImages=true -dCompressFonts=true \
         -dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=220 -dColorImageDownsampleThreshold=1.0 \
         -dDownsampleGrayImages=true -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=220 -dGrayImageDownsampleThreshold=1.0 \
         -dAutoFilterColorImages=false -dColorImageFilter=/FlateEncode \
         -dAutoFilterGrayImages=false -dGrayImageFilter=/FlateEncode \
         -sOutputFile=web.pdf print.pdf

      # Fallback, falls die verlustfreie Variante über 1 MB liegt: hochwertiges JPEG bei 220 dpi
      if [ "$(stat -c %s web.pdf)" -gt 1000000 ]; then
        echo "web.pdf verlustfrei zu gross ($(stat -c %s web.pdf) Bytes) – nehme JPEG-Variante"
        gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.6 -dNOPAUSE -dQUIET -dBATCH \
           -dDetectDuplicateImages=true -dCompressFonts=true \
           -dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=220 -dColorImageDownsampleThreshold=1.0 \
           -dAutoFilterColorImages=false -dColorImageFilter=/DCTEncode -dJPEGQ=92 \
           -sOutputFile=web.pdf print.pdf
      fi
    fi
    ls -la print.pdf web.pdf
  )
  DOCX_HASH="$(git hash-object "$dir/karte.docx")" node tools/bilder.mjs "$dir"
  echo "::endgroup::"
done

# Aktuelle Dateien = neueste Karte (Ordnername = erster Gerichtetag)
NEUESTE=$(ls -d karten/*/ | sed 's:/$::' | sort | tail -1)
if [ -f "$NEUESTE/web.pdf" ]; then
  cp "$NEUESTE/web.pdf" files/wochenkarte-aktuell.pdf
  for f in karte-1x1 karte-4x5 karte-a4; do cp "$NEUESTE/$f".* img/; done
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add karten files img
git commit -q -m "Karte erstellt: ${ORDNER[*]}"
# Falls die App inzwischen etwas committet hat: einarbeiten und nochmal versuchen
for i in 1 2 3; do
  if git pull --rebase -q; then
    git push -q && break
  else
    git rebase --abort 2>/dev/null || true
    echo "::warning::Konflikt mit einem neueren Commit (Versuch $i)"
  fi
  [ "$i" = 3 ] && { echo "::error::Push fehlgeschlagen"; exit 1; }
  sleep 5
done

# Mail nur für Karten, die noch aktuell sind. Hat die App inzwischen eine Korrektur committet,
# baut der dadurch ausgelöste nächste Lauf die Karte neu und mailt dann die richtige Fassung.
for dir in "${ORDNER[@]}"; do
  if aktuell "$dir"; then
    node tools/mail.mjs "$dir"
  else
    echo "::notice::$dir wurde inzwischen korrigiert – Mail kommt mit dem nächsten Lauf"
  fi
done
