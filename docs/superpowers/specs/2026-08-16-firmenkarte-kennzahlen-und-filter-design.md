# zeigmers — Firmenkarte: Kennzahlen, Filter und Basiskarte

Stand 16. August 2026. Dieses Dokument beschreibt den Umbau der Seite
`/firmen/` («Börsennotierte Firmen»): eine umschaltbare Höhenkennzahl statt
allein des Umsatzes, drei Filterdimensionen statt keiner, eine Basiskarte mit
Seen und ehrlicher Rahmung, und mehrere Stellen, an denen die Karte heute
Daten besitzt, die sie nicht zeigt.

Auslöser ist eine Beurteilung der bestehenden Seite: zu wenig attraktiv, zu
wenig Information. Die Ursachen liessen sich messen, nicht nur behaupten —
siehe Ausgangslage.

## Ausgangslage

Gemessen am Artefakt `public/data/companies.json` (Stand 15. August 2026) und
an einem Screenshot der laufenden Seite:

| | |
|---|---|
| Gesellschaften im Artefakt | 201, alle recherchiert |
| Kotierte SIX-Titel (Nenner) | 224 |
| Mit Umsatzwert (Höhenquelle heute) | 188 |
| Ohne Umsatzwert | 13 (als Platzhalter gezeichnet) |
| Mit Mitarbeitendenzahl | 192, davon 6 mit dem Wert 0 |
| Ohne Mitarbeitendenzahl | 9 |
| Mit Reingewinn | 197 |
| **Davon mit Verlust** | **41** |
| Grösster Gewinn | 26.15 Mrd. |
| Grösster Verlust | −134.4 Mio. (DocMorris AG) |
| Summe Umsatz (CHF) | 762.1 Mrd. |
| Summe Mitarbeitende weltweit | 2'052'630 |

Die drei Befunde, aus denen die Arbeit folgt:

**1. Der Default zerstört das Bild.** `DEFAULT_MODE.sichtbare` ist `'linear'`
(`src/ui/nav.ts`). Bei linearer Skala liegen **153 von 188 Säulen** unter
`MIN_REAL_BAR_M` (550 m) und sitzen damit auf der Mindesthöhe — Medianhöhe
84 m gegen eine Decke von 12'000 m. Die Karte öffnet mit zwei sichtbaren
Säulen und einem Feld gleich hoher Stummel. Mit `'logarithmisch'` (der
gedämpften Potenzskala, Exponent 0.4) sind es 12 statt 153, Median 1647 m.

**2. Die Karte zeigt weniger, als sie weiss.** `productsUrl` ist bei 195 von
201 Gesellschaften gefüllt und wird nirgends verlinkt. `sixSymbol` ist
vollständig und erscheint nie. Rang, Marge, Umsatz je Mitarbeitenden und
Anteil am Gesamtumsatz lassen sich aus vorhandenen Feldern rechnen und werden
nicht gerechnet. Die Säulen der recherchierten Firmen haben **keinen Hover** —
nur die unrecherchierten Marker haben einen (`src/layers/viewLayers.ts`).

**3. Die Basiskarte trägt nicht.** Die Schweiz füllt rund 45 % der Bildfläche,
weil `fitBounds` mit festem Padding den `pitch: 50` nicht einrechnet. Es gibt
keine Seen, also keine wiedererkennbare Silhouette. Die Platte (`--land`,
`#CFD8E3`) ist so hell, dass dünne Säulen kaum darauf stehen.

## Entscheidungen

Aus der Vorbesprechung, hier als Kontext für alles Weitere:

1. **Seen aus Natural Earth** (10m lakes), nicht aus einer amtlichen
   Schweizer Quelle. Die swissBOUNDARIES3D-Datei, die das ETL bereits lädt,
   enthält nur 11 Seeflächen — Genfersee, Vierwaldstättersee, Lago Maggiore,
   Zugersee und Walensee stecken dort in den Gemeindeflächen und sind nicht
   einzeln herauszulösen.

   **Korrektur (16. August 2026, bei der Umsetzung):** Natural Earth 10m
   enthält im Schweizer Fenster nur vier Polygone — Lake Geneva, Bodensee,
   ein unbenanntes und Lago di Como. Die Annahme, es lägen dort «alle grossen
   Seen» vor, war falsch; sie stammt aus der Entscheidungsfrage, nicht aus den
   Daten. Das Artefakt entsteht deshalb aus **beiden** bereits vorhandenen
   Quellen: Natural Earth liefert Genfersee und Bodensee, swissBOUNDARIES3D
   über `objektart == 'Kantonsgebiet'` **und** `see_flaeche > 0` zusätzlich
   Zürichsee, Lac de Neuchâtel, Bielersee, Thunersee, Brienzersee und
   Greifensee. Der Flächenfilter ist Pflicht: dieselbe Objektart führt auch
   «Staatswald Galm» — ein Wald. Vierwaldstättersee, Zugersee, Walensee und
   die Tessiner Seen fehlen weiterhin in beiden Quellen; das nennt der
   Moduldocstring, statt es zu beschweigen.
2. **Verluste als negative Höhe**, wenn sie sich sichtbar zeichnen lassen;
   sonst als Betrag mit eindeutig anderer Farbe.
3. **Höhenskala an die Auswahl angepasst** — das Maximum ist das Maximum der
   gerade sichtbaren Firmen, nicht das aller.
4. **Der Umschalter für die Organisationsform erscheint sofort**, auch
   solange «börsenkotiert» der einzige Wert ist.

Dazu zwei Festlegungen ohne Rückfrage, beide mit Begründung an ihrer Stelle
unten: der Säulenradius codiert weiterhin nichts (nur Pixelgrenzen, siehe
Abschnitt 3), und die Rangfolge im Panel bezieht sich immer auf alle
recherchierten Gesellschaften, nie auf die gefilterte Auswahl (Abschnitt 7).

## 1 — Zustand: drei Dimensionen

Die Seite hat ab jetzt einen Zustand. Er besteht aus drei Dimensionen, die
nichts voneinander wissen:

```
Kennzahl          genau eine    Umsatz | Mitarbeitende | Gewinn
Branchen          Teilmenge     Default: alle vorkommenden
Organisationsform Teilmenge     Default: alle vorkommenden
```

Zwei neue, DOM-freie Module tragen das:

**`src/domain/metric.ts`** — was eine Kennzahl ist. Je Kennzahl: der
Wertzugriff auf `Company`, das Label, die Formatierung, ob negative Werte
vorkommen können, und die Einheit für Legende und Kennzahlenzeile.

```ts
export type Metric = 'umsatz' | 'mitarbeitende' | 'gewinn'
export function metricValue(company: Company, metric: Metric): number | null
```

`metricValue` liefert für `'umsatz'` den Wert `revenueChf`, für `'gewinn'`
den neuen `profitChf` (siehe Abschnitt 9), für `'mitarbeitende'`
`employees` — jeweils `null`, wenn die Zahl fehlt. **Kein Rückfall auf den
Betrag in Berichtswährung**: `heightValue()` fällt heute von `revenueChf` auf
`revenue` zurück, was nur solange trägt, wie gar keine Kurse vorliegen. Für
die neue Gewinn-Achse wäre derselbe Rückfall ein Höhenvergleich zwischen CHF,
EUR und USD. Eine Firma ohne umgerechneten Wert ist in dieser Kennzahl eine
Firma ohne Wert.

**`src/domain/selection.ts`** — der Filter, als reine Funktion:

```ts
export interface Selection { metric: Metric; branches: ReadonlySet<number>; orgForms: ReadonlySet<string> }
export interface SelectionResult {
  visible: Company[]      // gefiltert, aber noch nicht bewertet
  withValue: Company[]    // davon: metricValue() !== null
  vmax: number            // Maximum der BETRÄGE über withValue, 0 wenn leer
  sum: number             // Summe über withValue (bei Gewinn: Saldo)
  losses: number          // Anzahl mit negativem Wert
  missing: number         // visible.length - withValue.length
}
export function applySelection(companies: Company[], selection: Selection): SelectionResult
```

`karte/firmen.ts` hält den Zustand, ruft bei jeder Änderung `applySelection`
und reicht das Ergebnis an Layer, Legende, Kennzahlenzeile und Hover weiter.
Ein einziger Pfad, kein zweiter Ort, an dem gefiltert wird.

Die Vorgabewerte kommen aus den Daten, nicht aus Konstanten: welche Branchen
und welche Organisationsformen es gibt, leitet sich wie schon heute bei
`presentGroupsFromIndices` aus dem Artefakt ab. Kommt eine Genossenschaft in
die Daten, erscheint ihr Knopf, ohne dass hier eine Zeile geändert wird.

## 2 — Höhen: Kennzahl, Vorzeichen, Nulllinie

`computeElevations` in `src/domain/scale.ts` rechnet heute mit
nichtnegativen Werten. Sie bekommt eine vorzeichenfähige Schwester:

```
h(v) = sign(v) · (|v| / vmax)^0.4 · MAX_BAR_HEIGHT_M     (logarithmisch)
h(v) = sign(v) · (|v| / vmax)      · MAX_BAR_HEIGHT_M     (linear)
```

`vmax` ist das Maximum der **Beträge** über die sichtbare Auswahl
(Entscheidung 3). Damit füllt jede Auswahl die Höhe aus — auch eine Branche,
die gegen Nestlé verschwände. Der Preis ist, dass dieselbe Firma je nach
Filter unterschiedlich hoch steht; die Legende nennt deshalb bei jeder
Änderung, worauf sich die Höhe gerade bezieht («höchste Säule: <Firma>,
<Wert>»). Ohne diese Zeile behauptete die Karte einen absoluten Massstab, den
sie nicht hat.

**Die Nulllinie.** Negative Elevation zeichnet deck.gl anstandslos, aber eine
nach unten wachsende Säule verschwindet unter der opaken Kantonsplatte
(`CANTON_ELEVATION_M` = 300) — bei `pitch: 50` schaut man von oben, dort ist
nichts zu sehen. Damit «negativ» auch negativ aussieht, beginnen in der
Gewinn-Ansicht **alle** Säulen auf einer gemeinsamen Ebene über der Platte:

```
NULLLINIE = CANTON_ELEVATION_M + max(0, |kleinste negative Höhe|) + 200 m Luft
```

Zur Laufzeit aus der Auswahl hergeleitet, nicht hartkodiert — bei angepasster
Skala ändert sich der tiefste Ausschlag mit jedem Filter. Gewinne wachsen von
dieser Ebene nach oben, Verluste hängen nach unten und bleiben über der
Platte. Mit den heutigen Daten (grösster Verlust 134.4 Mio. gegen grössten
Gewinn 26.15 Mrd.) liegt der tiefste Ausschlag bei gedämpfter Skala rund
1'900 m, die Nulllinie also bei etwa 2'400 m.

Für `'umsatz'` und `'mitarbeitende'` gibt es keine negativen Werte; dort ist
die Nulllinie die Plattenoberkante wie heute, und die Ebene wird nicht
gezeichnet.

Die Ebene selbst ist sichtbar: eine dünne, halbtransparente Fläche über der
Schweiz-Silhouette auf Nulllinienhöhe. Ohne sie hinge eine Verlustsäule ohne
Bezug in der Luft, und eine kurze Gewinnsäule sähe aus wie eine Verlustsäule.

**Verlustfarbe.** Verluste bekommen einen eigenen Ton, der kein Branchenton
ist und der auch nicht der Platzhalter-Grauton ist (den es weiterhin für
fehlende Werte braucht). Die Branche einer Verlustfirma ist damit in der
Gewinn-Ansicht nicht ablesbar — das ist beabsichtigt: Vorzeichen schlägt
Branche, wenn beide um dieselbe Fläche konkurrieren.

**Mindesthöhen.** `MIN_VISIBLE_BAR_M` (400) und `MIN_REAL_BAR_M` (550) gelten
weiter, jetzt auf den Betrag angewandt. Ihre Begründung — Platzhalter müssen
niedriger bleiben als jede echte Säule — bleibt unverändert gültig.

## 3 — Sichtbarkeit und Dichte

**Radius.** `radius: 900` in Metern, fest. In Zürich (31 Gesellschaften) und
Zug (17) verklumpen die Säulen dadurch zu einem Block, während eine einzelne
Säule im Jura zum Faden wird. `radiusMinPixels` / `radiusMaxPixels` begrenzen
das zoomunabhängig, wie es `buildUnresearchedCompanyLayer` für die Marker
bereits tut.

Der Radius codiert weiterhin **nichts**. Die Mitarbeitendenzahl auf den
Radius zu legen war erwogen und ist verworfen: sie sitzt ab jetzt als eine der
drei Kennzahlen auf der Höhenachse. Dieselbe Grösse gleichzeitig auf zwei
Kanäle zu legen, von denen einer umschaltbar ist, ergäbe eine Karte, die sich
beim Umschalten selbst widerspricht.

**Bodenschatten.** Unter jeder Säule eine dunkle, halbtransparente Scheibe auf
Plattenhöhe, etwas grösser als die Säule. Das ist der billigste Weg zu Tiefe
auf einer so hellen Platte und verankert die Säule an ihrem Ort, statt sie
schweben zu lassen.

**Beschriftungen.** Die grössten N (Vorgabe 12) nach der aktiven Kennzahl
bekommen ihren Namen als `TextLayer` auf die Säulenspitze. Sie folgen dem
Filter: wer die Auswahl auf eine Branche einschränkt, sieht die grössten
Namen dieser Branche. Überlappung löst `CollisionFilterExtension` aus
`@deck.gl/extensions` — eine neue Abhängigkeit, gleiche Versionsfamilie wie
die bereits vorhandenen deck.gl-Pakete.

## 4 — Basiskarte: Seen, Kontrast, Rahmung

**Seen** (`src/layers/lakes.ts`, Artefakt `public/data/lakes.geojson`): eine
`GeoJsonLayer` auf Plattenhöhe, gefüllt in einem kühlen Blauton derselben
Palette, ohne Rand, nicht anklickbar. Sie liegt über der Kantonsfläche und
unter allem anderen.

**Kontrast**: `--land` wird um einen Schritt dunkler, damit die Platte gegen
den Grund (`--grund`) und gegen die Säulen steht. Die elf Branchenfarben
bleiben unangetastet — sie sind auf Farbenblindheit geprüft
(`etl/tests/test_palette.py`), und ihre Prüfung gilt nicht mehr, wenn der
Hintergrund unter ihnen sich ändert. Deshalb ändert sich nur der Untergrund,
und der Kontrast der Branchenfarben gegen den neuen Ton wird nachgeprüft.

**Rahmung** (`src/map.ts`): `frameBounds` bekommt statt `padding: 64` ein
seitenweises Padding, das zwei Dinge einrechnet — die tatsächliche
UI-Chrome (Steuerung oben links, Legende unten links, Eckbox unten rechts,
Panel rechts) und die Stauchung durch `pitch`. Der bisher unverifizierte
Kommentar in `map.ts` («wie stark eine Kantonsfläche dadurch tatsächlich
ausgefüllt wird, ist unverifiziert») wird durch einen Wert ersetzt, der im
Browser geprüft ist.

## 5 — Legende als Filter

`src/ui/legend.ts` wird aus einer Farbliste ein Bedienelement. Je Branche eine
Schaltfläche mit `aria-pressed`, dazu zwei Zahlen: **Anzahl** Gesellschaften
und, je nach Kennzahl, entweder ihr **Anteil** an der Summe (Umsatz,
Mitarbeitende) oder ihr **Saldo** (Gewinn). Ein Anteil an einer Summe, in die
41 negative Beträge eingehen, wäre eine Zahl ohne Bedeutung — deshalb der
Wechsel.

Ein Klick schaltet eine Branche aus oder ein — mehr Gesten gibt es nicht.
Kein Doppelklick zum Isolieren und kein Modifikator: beides ist unsichtbar
und auf einem Touchgerät nicht vorhanden. Wer eine Branche allein sehen will,
drückt «nur diese» in ihrer Zeile; ein «alle» oben in der Liste stellt den
Ausgangszustand wieder her. Sind alle Branchen abgewählt, zeigt die Karte
keine Säulen und die Legende sagt genau das, statt eine leere Karte ohne
Erklärung stehen zu lassen.

Die bestehenden Zeilen bleiben: Randmarkierung für abweichende Kennzahl,
Marker für unrecherchierte Titel, Mindesthöhen-Hinweis. Dazu neu die
Bezugszeile aus Abschnitt 2 und, in der Gewinn-Ansicht, die Verlustzeile.

## 6 — Kennzahlenzeile

Ein neues, schmales Element (`src/ui/kennzahlen.ts`) am oberen Bildrand,
mittig, das ohne Klick zeigt, was die Karte gerade summiert:

```
201 Gesellschaften · 762.1 Mrd. CHF Umsatz aus 188 Angaben
```

Der Zusatz «aus 188 Angaben» ist nicht Zierde: die Summe entsteht aus 188
Zeilen, die Zahl davor nennt 201. Ohne den Nenner stünde eine Summe über
einer Grundgesamtheit, zu der sie nicht gehört.

Es folgt Kennzahl und Filter. Bei «Mitarbeitende» kommt die Zeile hinzu, für
die es dieses Projekt gibt:

```
2'052'630 Mitarbeitende weltweit · zum Vergleich: 5'876'865 Beschäftigte in der Schweiz
```

Die Vergleichszahl wird nicht hartkodiert, sondern aus `basis.kantone`
summiert — die Firmen-Seite lädt dieses Artefakt (5.6 KB) für die Rahmung
ohnehin. Bei «Gewinn» nennt die Zeile den Saldo und die Zahl der
Verlustfirmen, weil eine Summe allein hier die Hälfte verschweigt.

## 7 — Panel

`companyContent` in `src/ui/panel.ts` bekommt, alles aus vorhandenen Feldern:

- **Rang** nach der aktiven Kennzahl («#3 von 188 nach Umsatz»). Immer über
  alle recherchierten Gesellschaften mit einem Wert, nie über die gefilterte
  Auswahl: ein Rang, der sich beim Filtern ändert, ist keine Eigenschaft der
  Firma. Der Nenner wird deshalb mitgenannt.
- **Marge** (Reingewinn / Umsatz), wo beide Zahlen vorliegen — 185
  Gesellschaften, bei allen in derselben Währung. Aber nicht dieselbe Marge:
  143 rechnen gegen Nettoumsatz, **42 gegen Geschäftsertrag** (Banken,
  `revenueType = 'operating_income'`). Das Feld heisst deshalb nach seinem
  Nenner («Marge auf Nettoumsatz» bzw. «auf Geschäftsertrag»), nach demselben
  Muster, mit dem das Panel schon heute die Umsatzzeile benennt.
- **Umsatz je Mitarbeitenden**, wo beides vorliegt und die Mitarbeitendenzahl
  über 0 liegt — 181 Gesellschaften. Die sechs mit dem Wert 0 bekommen die
  Zeile nicht, statt einer Division durch null.
- **Anteil am Gesamtumsatz** aller recherchierten Gesellschaften.
- **SIX-Symbol**, vollständig vorhanden, bisher ungenutzt.
- **Link auf `productsUrl`** neben dem Geschäftsbericht — 195 von 201, bisher
  ungenutzt.

Die bestehende Ordnung des Panels und ihre Begründungen (Sitz und Branche
zuerst, Kennzahl beim Namen genannt, für jede fehlende Zahl ein expliziter
Hinweis) bleiben unverändert.

## 8 — Hover

`showHoverLabel` wird zweizeilig: Name, darunter der Wert der aktiven Kennzahl
und die Branche. Für die unrecherchierten Marker bleibt es beim einzeiligen
Namen — dort gibt es nichts Zweites zu sagen. Das CSS (`#hover-label`,
`white-space: nowrap`) bekommt dafür eine zweite Zeile statt einer festen
Breite.

## 9 — ETL

**`profitChf`** (`etl/src/zeigmers_etl/companies.py`, `fx.py`): dieselbe
Umrechnung wie `revenueChf`, zum SNB-Jahresmittelkurs des Geschäftsjahres,
mit derselben Alles-oder-nichts-Regel — bleibt eine Umrechnung offen, fällt
die Kennzahl «Gewinn» ganz aus, statt halb umgerechnet zu erscheinen. Das
Artefakt bekommt dafür eine Kennzeichnung analog zu `stats.revenueInChf`.

**`orgForm`**: ein geschlossenes Set nach dem Muster von `revenueType` und
`consolidationBasis`, heute mit dem einzigen Wert `'boersenkotiert'` für alle
201 Zeilen. `validate()` erzwingt das Feld. Der Wert ist eine Eigenschaft der
Zeile, keine Ableitung aus der Quelle — eine später ergänzte Genossenschaft
trägt ihn genauso, ohne dass die Ladeseite Sonderfälle kennt.

**`lakes.py`**: Seeflächen aus zwei Quellen (siehe Korrektur bei Entscheidung
1) — Natural Earth 10m lakes laden (neuer Eintrag in `fetch.py` und
`data/raw/manifest.json`) und die Seezeilen aus der bereits vorhandenen
swissBOUNDARIES3D-Datei dazunehmen, beide auf das Landesgebiet zuschneiden,
vereinfachen, als `public/data/lakes.geojson` schreiben. Natural Earth ist die
einzige nicht-amtliche Quelle dieser Karte und wird in der Eckbox
(`src/ui/notices.ts`) namentlich als solche genannt, zusammen mit dem
Hinweis, dass die Seeumrisse generalisiert sind und dass mehrere grosse Seen
in beiden Quellen fehlen.

## 10 — Randfälle

| Fall | Verhalten |
|---|---|
| Kennzahl ohne Wert (13 ohne Umsatz, 9 ohne Mitarbeitende, 4 ohne Gewinn) | Platzhalter-Säule auf `MIN_VISIBLE_BAR_M`, Platzhalterfarbe, Panel nennt den Grund |
| Mitarbeitende = 0 (6 Firmen) | Echter Wert, keine Platzhalter — Säule auf Mindesthöhe, Panel zeigt 0. «Umsatz je Mitarbeitenden» entfällt |
| Umsatz = 0 mit `placeholder=true` (Molecular Partners AG) | Heute widersprüchlich: 0 als echter Wert gezeichnet, aber als Platzhalter gefärbt. Das ETL entscheidet den Fall eindeutig, die Ladeseite folgt |
| Alle Branchen abgewählt | Keine Säulen, Legende und Kennzahlenzeile sagen es ausdrücklich |
| Auswahl ohne einen einzigen Wert | `vmax = 0`; keine Division durch null, alle Säulen auf Mindesthöhe |
| Nur Verlustfirmen ausgewählt | `vmax` aus Beträgen; Nulllinie liegt oben, alle Säulen hängen |
| `lakes.geojson` fehlt oder ist kaputt | Karte zeichnet ohne Seen weiter, keine Fehlermeldung — die Seen sind Schmuck, kein Inhalt |

## 11 — Prüfung

Vor dem Code, nach dem Muster der bestehenden Testdateien:

- **`domain/metric.test.ts`** — Wertzugriff je Kennzahl, fehlende Werte, kein
  Rückfall auf Berichtswährung.
- **`domain/selection.test.ts`** — Filterkombinationen, `vmax` aus Beträgen,
  leere Auswahl, Auswahl ohne Werte, Summen mit negativen Beträgen.
- **`domain/scale.test.ts`** — die vorzeichenfähige Höhenfunktion:
  Symmetrie um null, Mindesthöhen auf Beträgen, `vmax = 0`.
- **`ui/panel.test.ts`** — die neuen Felder, jedes mit seinem Fehlfall
  (keine Marge ohne Umsatz, keine Division durch 0 Mitarbeitende, Rang mit
  Nenner).
- **`ui/legend.test.ts`** (neu) — Anteil bei Umsatz, Saldo bei Gewinn,
  Zustand der Schaltflächen.
- **`layers/viewLayers.test.ts`** — Eindeutigkeit der Layer-IDs über alle
  neuen Kombinationen aus Kennzahl und Filter, wie schon heute über Ansicht
  und Stufe.
- **pytest** — `profitChf` (Umrechnung, Alles-oder-nichts, fehlende Kurse),
  `orgForm` (Pflichtfeld, geschlossenes Set), `lakes` (Zuschnitt,
  Vereinfachung, Artefaktform).

Was kein Test beantwortet — ob die Karte gut aussieht — wird im Browser
geprüft: Rahmung, Nulllinie mit hängenden Verlustsäulen, Seen, Bodenschatten,
Beschriftungen ohne Überlappung, und der Kontrast der elf Branchenfarben
gegen die neue Plattenfarbe.

## 12 — Nicht Teil dieses Vorhabens

- **Suche und Rangliste.** Bewusst zurückgestellt.
- **Weitere Organisationsformen.** Dieses Vorhaben legt die Dimension an und
  zeigt ihren Umschalter; Genossenschaften, nicht kotierte Firmen und ihre
  Recherche sind ein eigenes Vorhaben.
- **Seitentitel und Abdeckungsangabe.** «Börsennotierte Firmen» und «201
  Gesellschaften von 224 kotierten SIX-Titeln» stimmen genau so lange, wie
  börsenkotiert die einzige Organisationsform ist. Sobald die zweite
  dazukommt, müssen Titel, `<meta>`-Beschreibungen, Landing und
  Abdeckungssatz zusammen überarbeitet werden — als ein Schritt, nicht
  verstreut.
- **Dunkle Variante der Karte.** Der Kontrast wird innerhalb der bestehenden
  hellen Palette verbessert, kein zweites Farbschema.
