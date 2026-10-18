# PlayStation Spending Summary (Thunderbird add-on)

Scans your mail for PlayStation Store receipts containing `Total: €xx,xx`
and sums them up (per receipt, per year, plus CSV export).

## Load it for testing
1. Thunderbird: ☰ → Tools → Developer Tools → Debug Add-ons
2. This Thunderbird → Load Temporary Add-on...
3. Pick `manifest.json` from this folder
4. Click the "PlayStation spending" toolbar button → Scan

Temporary add-ons vanish when Thunderbird closes. Use Reload on the debug page after editing code.

## Make it permanent
Zip the *contents* of this folder (manifest.json at the zip root), rename to .xpi,
upload to addons.thunderbird.net as an unlisted add-on to get it signed,
then install via Add-ons Manager → ⚙ → Install Add-on From File.

## Tweaking
- Sender not found? Edit SENDER_HINTS in popup.js to your receipt's exact From address.
- Other currency/format? Edit TOTAL_RE in popup.js.
