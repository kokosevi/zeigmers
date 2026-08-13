# SIX-kotierte Titel mit Sitz Aargau — Herleitung

Task 15, Step 2/6. Dokumentiert, wie die Kandidatenliste für `ag_listed_companies.csv`
entstanden ist. Abgerufen am 2026-08-13.

## Route: SIX FQS-API (nicht der dokumentierte Fallback)

Die im Brief vorgeschlagene Abfrage

```
https://www.six-group.com/fqs/ref.json?select=ShortName,ISIN,ValorSymbol&where=ProductLine=EQ&pageSize=1000
```

lieferte HTTP 200, aber `totalRows: 0` — `ProductLine=EQ` ist kein gültiger Wert (der
Endpunkt meldet ungültige Property-Namen mit HTTP 400, ungültige *Werte* aber still mit
`totalRows: 0`, ohne Fehler). Durch Abfrage bekannter ISIN/Valorsymbole (z.B. ABB,
CH0012221716) wurde ermittelt, dass Aktien zwei `ProductLine`-Codes tragen:
`BC` (SMI Blue Chip, 30 Titel) und `DS` (übrige inländische Aktien, 194 Titel). Ausserdem
ignoriert der Endpunkt den Parameter `pageSize`; Paginierung läuft über `page=N` (nicht
`pageNumber`, das ebenfalls ignoriert wird).

Mit den korrigierten Parametern lieferte die API eine vollständige, verwertbare Liste
(224 Titel, `BC` + `DS`, alle Seiten abgerufen). Der dokumentierte Fallback aus Spec 8.2
war damit nicht nötig — diese Datei dokumentiert stattdessen die Herleitung der 8
Kandidaten aus dieser Liste.

Abfragen (Beispiele, abgerufen 2026-08-13):
```
https://www.six-group.com/fqs/ref.json?select=ShortName,ISIN,ValorSymbol,ProductLine&where=ProductLine=BC&page=1
https://www.six-group.com/fqs/ref.json?select=ShortName,ISIN,ValorSymbol,ProductLine&where=ProductLine=DS&page=1 … page=4
```
Quelle: SIX Group, https://www.six-group.com/fqs/ref.json (eigene, öffentlich erreichbare
Referenzdaten-API von SIX Swiss Exchange; first-party für die Tatsache "an der SIX
kotiert").

## Abgleich mit Aargauer Sitz (LINDAS/Zefix)

Die SIX-Liste nennt nur Kurzname, ISIN und Valorensymbol — keinen Sitzkanton. Der Sitz
wurde daher pro Kandidat einzeln über den offiziellen Zefix-Handelsregisterauszug via
LINDAS SPARQL-Endpunkt (`https://ld.admin.ch/query`, Graph
`https://lindas.admin.ch/foj/zefix`) geprüft: `schema:legalName` exakt oder als
Teilstring gegen `schema:address/schema:addressRegion = "AG"` abgeglichen. Nur Firmen,
bei denen die **börsenkotierte Gesellschaft selbst** (nicht nur eine Tochter oder
Betriebsstätte) mit Sitz in Aargau im Handelsregister erscheint, wurden übernommen.

Explizit geprüft und **verworfen**, weil der registrierte Sitz nicht Aargau ist (Beispiele
aus fast 200 geprüften Kurznamen, jeweils via LINDAS bestätigt):

| Titel (SIX-Symbol) | Tatsächlicher Sitz laut Zefix/LINDAS |
|---|---|
| Phoenix Mecano AG (PMN) | Stein am Rhein, SH — **nicht** Stein AG |
| SKAN Group AG (SKAN) | Allschwil, BL |
| Adval Tech Holding AG (ADVN) | Niederwangen b. Bern, BE |
| Comet Holding AG (COTN) | Flamatt, FR |
| Bossard Holding AG (BOSN) | Zug, ZG |
| Sika AG (SIKA) | Baar, ZG |
| Forbo Holding AG (FORN) | Baar, ZG |
| SFS Group AG (SFSN) | Heerbrugg, SG |
| Straumann Holding AG (STMN) | Basel, BS |
| VAT Group AG (VACN) | Haag (Rheintal), SG |
| Bachem Holding AG (BANB) | Bubendorf, BL |
| Metall Zug AG (METN) | Zug, ZG |
| Orior AG (ORON) | Zürich, ZH |
| Infracore SA (INFRAC) | Fribourg, FR |
| EEII AG (EEII) | operativ Zug, ZG |

Aargauische Kantonalbank kommt in der SIX-Liste (`BC`+`DS`) nicht vor — sie hat keine an
der SIX kotierten Beteiligungspapiere.

## Ergebnis: 8 Kandidaten mit bestätigtem Aargauer Sitz

Für jede Zeile: UID und Adresse stammen aus derselben LINDAS/Zefix-Abfrage (Company-URI
zur Nachprüfbarkeit angegeben), SIX-Symbol/ISIN aus der FQS-Liste oben.

| Firma | UID | SIX | ISIN | Sitzgemeinde | Zefix-Datensatz |
|---|---|---|---|---|---|
| Siegfried Holding AG | CHE-102.443.567 | SFZN | CH1429326825 | Zofingen | register.ld.admin.ch/zefix/company/177019 |
| Zehnder Group AG | CHE-100.707.011 | ZEHN | CH0276534614 | Gränichen | register.ld.admin.ch/zefix/company/212085 |
| naturenergie holding AG | CHE-105.949.219 | NEAG | CH0039651184 | Laufenburg | register.ld.admin.ch/zefix/company/101406 |
| Dottikon ES Holding AG | CHE-112.235.208 | DESN | CH0582581713 | Dottikon | register.ld.admin.ch/zefix/company/783457 |
| Montana Aerospace AG | CHE-248.340.671 | AERO | CH1110425654 | Reinach AG | register.ld.admin.ch/zefix/company/1417123 |
| Accelleron Industries AG | CHE-270.303.139 | ACLN | CH1169360919 | Baden | register.ld.admin.ch/zefix/company/1488671 |
| DSM-Firmenich AG | CHE-441.853.769 | DSFIR | CH1216478797 | Kaiseraugst | register.ld.admin.ch/zefix/company/1537663 |
| Hypothekarbank Lenzburg AG | CHE-105.779.532 | HBLN | CH0001341608 | Lenzburg | register.ld.admin.ch/zefix/company/85089 |

Umsatz, Mitarbeitende, Geschäftsjahr, Währung und Quell-URL je Firma stehen in
`data/manual/ag_listed_companies.csv`, jeweils aus dem eigenen Geschäftsbericht bzw. der
eigenen Investor-Relations-Seite der Firma (siehe `report_url` je Zeile).
