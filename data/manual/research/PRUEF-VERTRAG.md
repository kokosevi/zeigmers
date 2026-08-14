# Prüf-Vertrag: eine recherchierte Zeile widerlegen

Vor dir liegt eine bereits recherchierte Firmenzeile. **Deine Aufgabe ist
nicht, sie zu bestätigen, sondern zu widerlegen.** Gehe davon aus, dass sie
falsch ist, und suche den Fehler. Findest du keinen, sag das — aber suche
zuerst ernsthaft.

Du arbeitest **unabhängig**: hole die Zahlen selbst aus der Primärquelle,
statt die vorgelegten nachzuvollziehen. Erst danach vergleichst du.

## Worauf du besonders schaust

1. **Steht die Zahl wirklich so in der Quelle?** Öffne `report_url` und
   suche die Zeile. Nenne ihre genaue Bezeichnung im Bericht («Sales»,
   «Net sales», «Geschäftsertrag», «Konzerngewinn») und, wenn möglich, die
   Seite. Eine Zahl, die du in der Quelle nicht findest, ist ein Fund.

2. **Meinen Umsatz und Gewinn denselben Umfang?** Beide müssen aus
   derselben konsolidierten Rechnung stammen, demselben Geschäftsjahr,
   demselben Konsolidierungskreis (Gesamtkonzern oder fortgeführtes
   Geschäft). Ein Umsatz aus fortgeführtem Geschäft neben einem
   Konzerngewinn ist ein Fund, auch wenn beide Zahlen einzeln stimmen.

3. **Ist `revenue_type` richtig?** Banken und Versicherer haben keinen
   Nettoumsatz; dort gehört der Geschäftsertrag hin (`operating_income`).
   Umgekehrt ist `operating_income` bei einem Industrieunternehmen falsch.

4. **Stimmen Währung und Einheit?** Berichtet die Firma in EUR oder USD,
   und steht das auch so da? Ist der Wert wirklich in Millionen?

5. **Ist die Quelle eine Primärquelle?** Geschäftsbericht, Jahresabschluss
   oder Investor-Relations-Seite der Firma. Börsenportale, Wikipedia oder
   Presseartikel sind keine.

6. **Heisst die Firma so?** Nenne den Namen der Rechtseinheit, wie er im
   Geschäftsbericht steht (Titelblatt oder Impressum). Weicht er vom
   vorgelegten Namen ab, ist das ein Fund — wir haben Fälle, in denen eine
   Tochter- oder eine fremde Gesellschaft mit ähnlichem Namen erwischt
   wurde.

## Rückgabe

Schreibe eine JSON-Datei an den angegebenen Pfad:

```json
{
  "verdict": "bestaetigt" | "abweichung",
  "legal_name_im_bericht": "...",
  "revenue_gefunden": "<Zahl>", "revenue_zeile": "<Bezeichnung im Bericht>",
  "profit_gefunden": "<Zahl>",  "profit_zeile":  "<Bezeichnung im Bericht>",
  "abweichungen": ["je ein Satz pro Fund, leer wenn keine"],
  "begruendung": "zwei Sätze: was du geöffnet hast und was du gesehen hast"
}
```

Deine Textantwort ist **eine Zeile**: `BESTAETIGT <Firma>` oder
`ABWEICHUNG <Firma> <Fund in acht Wörtern>`.
