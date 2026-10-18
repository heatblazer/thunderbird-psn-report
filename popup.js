// ---- Settings ----
const SENDER_HINTS = ["playstation", "sonyentertainmentnetwork", "sony"];
const BGN_PER_EUR = 1.95583;          // official fixed conversion rate
// An email is only considered if its subject or body contains this (case-insensitive)
const PURCHASE_RE = /thank you for (?:your )?purchase/i;
const SKIP_ZERO = true;               // ignore totals of 0.00
// ------------------

const CUR = "(€|EUR|BGN|лв\\.?|lv\\.?)";
const NUM = "(\\d{1,3}(?:[.,\\s]\\d{3})*[.,]\\d{2}|\\d+[.,]\\d{2})";
// "Total: €49,99" / "Total: 59,80 BGN" / "Total: BGN 59.80" / "Общо: 59,80 лв."
const TOTAL_RE = new RegExp(
  `(?:Total|Общо|Сума)\\s*:?\\s*${CUR}\\s*${NUM}|(?:Total|Общо|Сума)\\s*:?\\s*${NUM}\\s*${CUR}`,
  "i"
);

let csvData = "";

const toCode = (c) => (/€|eur/i.test(c) ? "EUR" : "BGN");
const toEur = (a, cur) => (cur === "EUR" ? a : a / BGN_PER_EUR);
const fmt = (n) => n.toFixed(2);
const csvEscape = (s) => `"${String(s).replace(/"/g, '""')}"`;

function parseNumber(s) {
  s = s.replace(/\s/g, "");
  const i = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  return parseFloat(s.slice(0, i).replace(/[.,]/g, "") + "." + s.slice(i + 1));
}

function normalize(t) {
  return t
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&euro;|&#8364;|&#x20AC;/gi, "€")
    .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
    .replace(/[\u200b-\u200f\u2060\ufeff\u00ad\u034f]/g, "")
    .replace(/\s+/g, " ");
}

function getText(part) {
  const chunks = [];
  const walk = (p) => {
    if (p.body && (p.contentType === "text/plain" || p.contentType === "text/html"))
      chunks.push(p.body);
    (p.parts || []).forEach(walk);
  };
  walk(part);
  return normalize(chunks.join(" "));
}

async function findMessages(fromDate) {
  const seen = new Map();
  for (const hint of SENDER_HINTS) {
    let page = await browser.messages.query({ author: hint, fromDate });
    while (true) {
      page.messages.forEach((m) => seen.set(m.id, m));
      if (!page.id) break;
      page = await browser.messages.continueList(page.id);
      if (!page.messages.length) break;
    }
  }
  return [...seen.values()].sort((a, b) => a.date - b.date);
}

document.getElementById("run").onclick = async () => {
  const out = document.getElementById("out");
  const copyBtn = document.getElementById("copy");
  copyBtn.disabled = true;
  out.textContent = "Scanning...";

  const years = parseInt(document.getElementById("years").value, 10) || 12;
  const from = new Date();
  from.setFullYear(from.getFullYear() - years);

  const messages = await findMessages(from);
  const rows = [];
  const dedupe = new Set();
  let dupes = 0, failed = 0;

  for (const msg of messages) {
    try {
      const full = await browser.messages.getFull(msg.id);
      const text = getText(full);

      // 1) must be a "Thank you for your purchase" email
      if (!PURCHASE_RE.test(msg.subject + " " + text)) continue;

      // 2) find "Total:"
      const m = text.match(TOTAL_RE);
      if (!m) continue;
      const cur = toCode(m[1] || m[4]);
      const amount = parseNumber(m[2] || m[3]);

      // 3) skip zero totals
      if (SKIP_ZERO && amount === 0) continue;

      const day = msg.date.toISOString().slice(0, 10);
      const key = `${day}|${amount}|${cur}|${msg.subject}`;
      if (dedupe.has(key)) { dupes++; continue; }  // same mail in several folders
      dedupe.add(key);

      rows.push({ day, amount, cur, eur: toEur(amount, cur), subject: msg.subject });
    } catch (e) {
      failed++;
      console.warn("Could not read message", msg.id, e);
    }
  }

  const byYear = {};
  for (const r of rows) {
    const y = r.day.slice(0, 4);
    byYear[y] ??= { BGN: 0, EUR: 0, n: 0 };
    byYear[y][r.cur] += r.amount;
    byYear[y].n++;
  }
  const yearLines = Object.keys(byYear).sort().map((y) => {
    const t = byYear[y];
    const parts = [];
    if (t.BGN) parts.push(`${fmt(t.BGN)} BGN`);
    if (t.EUR) parts.push(`${fmt(t.EUR)} EUR`);
    return `${y}: ${parts.join(" + ")}  ≈ €${fmt(t.EUR + t.BGN / BGN_PER_EUR)}   (${t.n} receipts)`;
  });

  const grand = rows.reduce((s, r) => s + r.eur, 0);
  const sumBgn = rows.filter((r) => r.cur === "BGN").reduce((s, r) => s + r.amount, 0);
  const sumEur = rows.filter((r) => r.cur === "EUR").reduce((s, r) => s + r.amount, 0);

  out.textContent =
    rows.map((r) => `${r.day}  ${fmt(r.amount).padStart(8)} ${r.cur}  ${r.subject}`).join("\n") +
    "\n\nBY YEAR\n" + yearLines.join("\n") +
    `\n\n${rows.length} receipts` +
    `\nIn BGN: ${fmt(sumBgn)}   In EUR: ${fmt(sumEur)}` +
    `\nGRAND TOTAL ≈ €${fmt(grand)}  (BGN converted at ${BGN_PER_EUR})` +
    `\n(${messages.length} emails checked, ${dupes} duplicates ignored, ${failed} unreadable)`;

  csvData = "date,amount,currency,eur_equivalent,subject\n" +
    rows.map((r) => `${r.day},${fmt(r.amount)},${r.cur},${fmt(r.eur)},${csvEscape(r.subject)}`).join("\n");
  copyBtn.disabled = rows.length === 0;
};

document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(csvData);
  const b = document.getElementById("copy");
  b.textContent = "Copied!";
  setTimeout(() => (b.textContent = "Copy CSV"), 1500);
};
