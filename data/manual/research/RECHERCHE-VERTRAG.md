# Recherche-Vertrag: eine Firma, ein Profil

Du recherchierst **eine** börsenkotierte Schweizer Gesellschaft für eine
3D-Wirtschaftskarte. Die Karte zeichnet jede Firma als Säule nach Umsatz.
Eine falsche Zahl fällt niemandem auf — sie sieht genauso richtig aus wie
eine richtige. Deshalb gilt: **lieber ein leeres Feld mit Begründung als
ein gefülltes ohne Beleg.**

## Quellenpflicht

`report_url` muss auf eine **Primärquelle** zeigen: Geschäftsbericht (PDF),
Jahresabschluss oder die Investor-Relations-Seite der Firma selbst.
Wikipedia, Zeitungsartikel, Börsenportale (finanzen.net, marketscreener,
wisesheets o. ä.) sind **keine** zulässigen Quellen für Zahlen. Wenn du
eine Zahl nur dort findest, ist sie für uns nicht vorhanden.

Prüfe, dass die Zahl, die du einträgst, in der verlinkten Quelle
**tatsächlich so steht**. Rechne nichts um, das du nicht belegen kannst.

## Die drei Fallen (an echten Fehlern dieses Projekts gelernt)

1. **Umsatz ist nicht gleich Umsatz.** Ein Industrieunternehmen weist
   Nettoumsatz aus, eine Bank hat keinen — dort ist der Geschäftsertrag
   (operating income / produit d'exploitation) das Gegenstück.
   → `revenue_type`: `net_sales` oder `operating_income`.

2. **Konzern oder fortgeführtes Geschäft?** Wird ein Geschäftsbereich
   verkauft, weist die Firma oft beides aus. DSM-Firmenich meldete EUR
   12'521 Mio. (Gesamtkonzern inkl. zum Verkauf gehaltenem Bereich) und
   EUR 9'034 Mio. (fortgeführt) — das ist ein Unterschied von 39 % in der
   Säulenhöhe. → `consolidation_basis`: `total_group` oder
   `continuing_operations`.

3. **Umsatz und Gewinn müssen denselben Umfang meinen.** Bei Montana
   Aerospace stand einmal ein Umsatz aus fortgeführtem Geschäft neben
   einem Gewinn des Gesamtkonzerns — arithmetisch zwei verschiedene
   Firmen in einer Zeile. Beide Zahlen kommen aus **derselben**
   konsolidierten Rechnung, **demselben** Geschäftsjahr, **demselben**
   Umfang. Wenn das nicht geht: `profit` leer lassen und in `note` sagen
   warum.

## Drei weitere Regeln (aus dem Pilotlauf, jede an einem echten Fehler gelernt)

4. **Nimm die Zeile, die so heisst — keine Summe.** Avolta weist «Turnover»
   13'983 aus (Net sales 13'760 + Advertising income 223). Als `net_sales`
   eingetragen war das falsch etikettiert. Trage die Zahl der Zeile ein, die
   im Bericht wirklich «Net sales»/«Umsatz»/«Sales revenue» heisst, und nenne
   die Bezeichnung in `_verification`.

5. **Gewinn: Aktionärsanteil, und sag es.** Fast alle Konzerne weisen
   «Profit for the year» und darunter den auf die Aktionäre entfallenden
   Anteil aus. Wir wollen den **Aktionärsanteil**. Steht daneben ein
   abweichender Konzerngewinn (Minderheitsanteile), gehört das in `note`.

6. **Beschäftigte: Köpfe, nicht Vollzeitstellen — wenn beides dasteht.**
   Alcon nennt 25'942 Vollzeitäquivalente, Clariant 10'449 Köpfe und 10'281
   FTE. Nimm die Kopfzahl («head count»), wenn der Bericht sie ausweist,
   sonst die FTE — und schreibe in `note`, welche der beiden es ist. Runde
   nie (25'000 statt 25'942 ist ein Fehler, keine Vereinfachung).

7. **Eine Zeile, die «Total revenues» heisst, ist nicht automatisch der
   Umsatz.** Partners Group führt «Total revenues from management services,
   net and other operating income» (2'563.1 Mio.) — darin stecken 101.9 Mio.
   Zins- und Beteiligungserträge, die der Bericht in seiner eigenen
   Bilanzierungsnotiz ausdrücklich als «not revenue from management
   services» abgrenzt. Der Umsatz ist die Zeile darüber (2'461.2 Mio.).
   Prüfe deshalb nicht nur, wie eine Zeile **heisst**, sondern woraus sie
   **besteht** — und ob der Bericht selbst ihre Bestandteile als Umsatz
   bezeichnet. Ein Blick in die Segmentberichterstattung entscheidet meist:
   welche Zahl dort durchgängig als Umsatzgrösse geführt wird, ist die
   richtige.

## Felder

| Feld | Inhalt |
|---|---|
| `noga_group` | genau einer von: `landwirtschaft`, `industrie`, `bau`, `handel`, `verkehr`, `gastgewerbe`, `ikt`, `finanz`, `dienstleistung`, `oeffentlich`, `uebrige` |
| `consolidation_basis` | `total_group` oder `continuing_operations` — Pflicht, sobald `profit` gesetzt ist |
| `revenue` | Zahl wie berichtet, Dezimalpunkt (z. B. `1327.8`) |
| `revenue_currency` | `CHF`, `EUR` oder `USD` — die Berichtswährung, nicht umgerechnet |
| `revenue_type` | `net_sales` oder `operating_income` |
| `revenue_unit` | `1000000`, wenn der Wert in Millionen steht |
| `profit` | Reingewinn/Konzerngewinn den Aktionären zurechenbar; Verlust negativ (`-12.4`) |
| `profit_currency`, `profit_unit` | wie oben |
| `core_products` | ein Satz auf Deutsch, was die Firma tatsächlich herstellt oder anbietet — konkret, nicht Marketing («Pharmazeutische Wirkstoffe im Auftrag», nicht «innovative Lösungen») |
| `products_url` | Seite der Firma, die das belegt |
| `founding_year` | Jahr als Zahl |
| `founding_year_source` | eigene Quelle dafür (oft die Firmengeschichte-Seite) |
| `employees` | **Ganze Zahl** aus demselben Bericht; ob Vollzeitäquivalente oder Köpfe, gehört in `note`, wenn der Bericht es sagt. Banken weisen Vollzeitstellen oft mit Dezimalstelle aus («159.3») — dann runde auf die ganze Zahl und halte die Rundung in `note` fest. Die Karte zählt Personen; eine Zehntelstelle wäre eine Genauigkeit, die die Grösse nicht hat |
| `fiscal_year` | Geschäftsjahr der Zahlen (z. B. `2025`); bei abweichendem Geschäftsjahr das Endjahr |
| `report_url` | Primärquelle für Umsatz/Gewinn/Beschäftigte |
| `note` | nur wenn nötig: Besonderheiten, Abweichungen, warum ein Feld leer ist |

## Wenn eine Zahl nicht öffentlich ist

Manche Gesellschaften (Beteiligungsvehikel, Immobilienfonds, kleine
Holdings) veröffentlichen keinen Umsatz im üblichen Sinn. Dann:
`revenue` leer, `note` erklärt in einem Satz warum. Das ist ein
**gültiges** Ergebnis, kein Scheitern — es ist etwas anderes als «noch
nicht nachgesehen», und die Karte stellt es auch anders dar.

## Rückgabe

Schreibe **eine** JSON-Datei nach dem angegebenen Pfad, ein Objekt mit
genau den Feldnamen oben (leere Felder als `""`). Zusätzlich ein Feld
`_verification` mit zwei Sätzen: woher Umsatz und Gewinn stammen (Seite
im Bericht, Bezeichnung der Zeile) und was du geprüft hast.

Deine Textantwort ist **eine Zeile**: `OK <Firmenname> <revenue> <currency>`
oder `LEER <Firmenname> <Grund in fünf Wörtern>`. Keine Zusammenfassung.
