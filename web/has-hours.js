/* Haus am See – Sonderöffnungszeiten
 * Liest hours.json und erzeugt daraus:
 *  1. eine Hinweisleiste unter dem Header (nur im Zeitfenster, wegklickbar)
 *  2. eine Zeile "Abweichend" am Ende jedes Textblocks, der die Öffnungszeiten enthält
 *     (erkannt an Stichwörtern, siehe anchorTexts; optional auch in Elementen mit data-has-hours="exceptions")
 *  3. strukturierte Daten (JSON-LD) für Google
 * Reguläre Öffnungszeiten werden NICHT angefasst.
 *
 * Konfiguration (optional, vor dem Skript setzen):
 *   window.HAS_HOURS_CONFIG = { url: "...", lookaheadDays: 30 };
 * Test: ?has-date=2026-10-25 an die URL hängen, um ein Datum zu simulieren.
 */
(function () {
  "use strict";

  var CFG = Object.assign({
    url: "https://raw.githubusercontent.com/Toensche/haus-am-see-content/main/data/hours.json",
    restaurantName: "Haus am See Zielfingen",
    siteUrl: "https://www.haus-am-see-restaurant.de",
    timezone: "Europe/Berlin",
    insertBefore: "#sections, main, .content-wrapper",
    appendTo: null, /* Alternative: "#header" – falls der Header die Leiste verdeckt */
    /* Stichwörter: Textblöcke, die eines davon enthalten, bekommen die Zeile "Abweichend" angehängt */
    anchorTexts: ["Öffnungszeiten Winterzeit", "Öffnungszeiten Sommerzeit", "Dienstag Ruhetag", "Montag Ruhetag"],
    lookaheadDays: 30,
    defaultShowFromDaysBefore: 7,
    schema: true
  }, window.HAS_HOURS_CONFIG || {});

  /* ---------- Datum ---------- */

  function todayIso() {
    var p = new URLSearchParams(location.search).get("has-date");
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: CFG.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
  }

  function addDays(iso, n) {
    var d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function fmtDate(iso, withWeekday) {
    var d = new Date(iso + "T12:00:00Z");
    var opts = { day: "numeric", month: "numeric", timeZone: "UTC" };
    if (withWeekday) opts.weekday = "short";
    var s = new Intl.DateTimeFormat("de-DE", opts).format(d);
    return s.replace(/\.$/, "") + ".";
  }

  function fmtRange(ex) {
    if (ex.start === ex.end) return fmtDate(ex.start, true);
    return fmtDate(ex.start, false) + " bis " + fmtDate(ex.end, false);
  }

  function fmtTime(t) { return t.replace(/:00$/, "") + " Uhr"; }

  /* ---------- Daten ---------- */

  function normalize(data) {
    var def = (data.defaults && data.defaults.showFromDaysBefore) || CFG.defaultShowFromDaysBefore;
    return (data.exceptions || []).map(function (ex) {
      var start = ex.date || ex.from;
      var end = ex.date || ex.to || start;
      var days = typeof ex.showFromDaysBefore === "number" ? ex.showFromDaysBefore : def;
      return {
        id: ex.id || start,
        start: start,
        end: end,
        open: ex.open || null,
        label: ex.label || "",
        message: ex.message || "",
        visibleFrom: addDays(start, -days)
      };
    }).filter(function (ex) { return ex.start && ex.end; })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }

  function defaultLabel(ex) {
    if (!ex.open) return "geschlossen";
    return "geöffnet " + fmtTime(ex.open[0]) + " bis " + fmtTime(ex.open[1]);
  }

  /* ---------- Rendering ---------- */

  function injectCss() {
    if (document.getElementById("has-hours-css")) return;
    var css = [
      ".has-hours-bar{--has-green:#3B643A;--has-graphite:#394C4B;--has-sand:#EAE5D8;--has-white:#F3F7F4;",
      "position:relative;z-index:5;background:var(--has-sand);color:var(--has-graphite);",
      "border-top:3px solid var(--has-green);font-size:16px;line-height:1.5}",
      ".has-hours-bar__inner{max-width:1200px;margin:0 auto;padding:12px 56px 12px 20px;position:relative}",
      ".has-hours-bar p{margin:0;padding:2px 0}",
      ".has-hours-bar p+p{border-top:1px solid rgba(57,76,75,.15);margin-top:6px;padding-top:8px}",
      ".has-hours-bar strong{color:var(--has-green);font-weight:600;margin-right:6px}",
      ".has-hours-bar__close{position:absolute;right:12px;top:50%;transform:translateY(-50%);",
      "width:36px;height:36px;border:0;background:transparent;color:var(--has-graphite);",
      "font-size:22px;line-height:1;cursor:pointer;border-radius:50%}",
      ".has-hours-bar__close:hover,.has-hours-bar__close:focus-visible{background:var(--has-white);outline:2px solid #356F88;outline-offset:1px}",
      ".has-hours-exceptions{margin:8px 0 0}",
      ".has-hours-exceptions strong{color:#3B643A}",
      ".has-hours-exceptions li{list-style:none;margin:0;padding:0}",
      ".has-hours-exceptions ul{margin:4px 0 0;padding:0}",
      "@media (max-width:640px){.has-hours-bar{font-size:15px}.has-hours-bar__inner{padding:10px 48px 10px 16px}}"
    ].join("");
    var el = document.createElement("style");
    el.id = "has-hours-css";
    el.textContent = css;
    document.head.appendChild(el);
  }

  function renderBar(active) {
    if (!active.length) return;
    var key = "has-hours-dismissed:" + active.map(function (e) { return e.id; }).join("|");
    try { if (sessionStorage.getItem(key)) return; } catch (e) {}

    var bar = document.createElement("div");
    bar.className = "has-hours-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");

    var inner = document.createElement("div");
    inner.className = "has-hours-bar__inner";
    var today = todayIso();
    active.forEach(function (ex) {
      var p = document.createElement("p");
      var s = document.createElement("strong");
      s.textContent = (ex.start <= today && today <= ex.end) ? "Heute" : "Hinweis";
      p.appendChild(s);
      p.appendChild(document.createTextNode(ex.message || (fmtRange(ex) + ": " + (ex.label || defaultLabel(ex)))));
      inner.appendChild(p);
    });

    var close = document.createElement("button");
    close.className = "has-hours-bar__close";
    close.type = "button";
    close.setAttribute("aria-label", "Hinweis schliessen");
    close.innerHTML = "&times;";
    close.addEventListener("click", function () {
      bar.remove();
      try { sessionStorage.setItem(key, "1"); } catch (e) {}
    });
    inner.appendChild(close);
    bar.appendChild(inner);

    var host = CFG.appendTo ? document.querySelector(CFG.appendTo) : null;
    var anchor = document.querySelector(CFG.insertBefore);
    if (host) host.appendChild(bar);
    else if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  /* Findet die Textblöcke, die die Öffnungszeiten enthalten (per Stichwort),
     und hängt dort am Ende einen Container an. So braucht es keinen eigenen
     Code-Block in Squarespace, und ohne Ausnahmen entsteht kein Leerraum. */
  function autoTargets() {
    var found = [];
    var seen = [];
    var nodes = document.querySelectorAll("p, h2, h3, h4, strong");
    nodes.forEach(function (n) {
      var text = (n.textContent || "").replace(/\s+/g, " ");
      var hit = CFG.anchorTexts.some(function (a) { return text.indexOf(a) !== -1; });
      if (!hit) return;
      var box = n.closest(".sqs-block-content") || n.closest(".sqs-block") || n.parentNode;
      if (!box) return;
      if (seen.some(function (s) { return s === box || s.contains(box) || box.contains(s); })) return;
      /* Nur Blöcke, die wirklich Zeiten oder Ruhetage enthalten (keine reinen Überschriften) */
      if (!/\d{1,2}[:.]\d{2}|Uhr|Ruhetag/.test(box.textContent || "")) return;
      seen.push(box);
      var t = box.querySelector('[data-has-hours="exceptions"]');
      if (!t) {
        t = document.createElement("div");
        t.setAttribute("data-has-hours", "exceptions");
        box.appendChild(t);
      }
      found.push(t);
    });
    return found;
  }

  function renderExceptions(upcoming) {
    var targets = Array.prototype.slice.call(document.querySelectorAll('[data-has-hours="exceptions"]'));
    autoTargets().forEach(function (t) { if (targets.indexOf(t) === -1) targets.push(t); });
    if (!targets.length) return;
    targets.forEach(function (t) {
      t.innerHTML = "";
      if (!upcoming.length) { t.hidden = true; return; }
      t.hidden = false;
      var wrap = document.createElement("div");
      wrap.className = "has-hours-exceptions";
      var head = document.createElement("strong");
      head.textContent = "Abweichend:";
      wrap.appendChild(head);
      var ul = document.createElement("ul");
      upcoming.forEach(function (ex) {
        var li = document.createElement("li");
        li.textContent = fmtRange(ex) + ": " + (ex.label || defaultLabel(ex));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      t.appendChild(wrap);
    });
  }

  function renderSchema(upcoming) {
    if (!CFG.schema || !upcoming.length) return;
    var spec = upcoming.map(function (ex) {
      return {
        "@type": "OpeningHoursSpecification",
        "validFrom": ex.start,
        "validThrough": ex.end,
        "opens": ex.open ? ex.open[0] : "00:00",
        "closes": ex.open ? ex.open[1] : "00:00"
      };
    });
    var ld = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      "@id": CFG.siteUrl + "/#restaurant",
      "name": CFG.restaurantName,
      "url": CFG.siteUrl,
      "openingHoursSpecification": spec
    };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "has-hours-schema";
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }

  /* ---------- Start ---------- */

  function run(data) {
    var today = todayIso();
    var horizon = addDays(today, CFG.lookaheadDays);
    var all = normalize(data);

    var active = all.filter(function (ex) { return ex.visibleFrom <= today && today <= ex.end; });
    var upcoming = all.filter(function (ex) { return ex.end >= today && ex.start <= horizon; });

    injectCss();
    renderBar(active);
    renderExceptions(upcoming);
    renderSchema(upcoming);
  }

  function start() {
    if (window.HAS_HOURS_INLINE) { run(window.HAS_HOURS_INLINE); return; }
    fetch(CFG.url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(run)
      .catch(function (e) { if (window.console) console.warn("has-hours: hours.json nicht geladen", e); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
