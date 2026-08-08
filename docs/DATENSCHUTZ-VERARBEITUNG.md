# Dienstplan-Pro — Angaben für das Verarbeitungsverzeichnis

Stand: 2026-08-08 · Grundlage: Art. 30 DSGVO

Dieses Blatt ist zum Weitergeben gedacht — an die Datenschutzbeauftragte, die
Personalabteilung oder wen auch immer euer Haus dafür vorsieht. Alles Technische ist
ausgefüllt und aus dem laufenden System belegt. **Drei Felder sind mit «…» markiert; die
kann nur der Betreiber beantworten.**

---

## 1. Bezeichnung der Verarbeitung

Dienstplan-Pro — Erfassung geleisteter Wochenend-, Feiertags- und Bereitschaftsdienste
sowie Berechnung der daraus folgenden Zulage nach der NRW-Regelung.

## 2. Verantwortlicher

«**Zu klären:** das Haus (St. Augustinus) als Arbeitgeber — oder der Betreiber persönlich?
Davon hängt alles Weitere ab. Läuft die Anwendung als offizielles Werkzeug, gehört sie ins
bestehende Verzeichnis des Hauses. Ist sie privat entstanden und wird im Team genutzt,
sollte das ausdrücklich abgestimmt werden, weil Beschäftigtendaten des Arbeitgebers auf
privat betriebener Infrastruktur liegen.»

## 3. Zwecke

- Dokumentation, an welchen Tagen welche Person Dienst geleistet hat (ganz oder halb)
- Prüfung und Freigabe dieser Einträge durch die Leitung
- Berechnung der Zulage je Person und Monat
- Gemeinsame Übersicht über die Besetzung kommender Tage (Aushang-Funktion)

## 4. Kategorien betroffener Personen

Beschäftigte, die zum Dienst eingeteilt sind. Derzeit acht Personen.

## 5. Kategorien personenbezogener Daten

| Datum | Herkunft |
|---|---|
| Anzeigename | vom Admin eingetragen |
| Dienstliche E-Mail-Adresse | vom Admin eingetragen, dient als Anmeldekennung |
| Kalendertag und Anteil geleisteter Dienste (1,0 / 0,5) | von der Person selbst eingetragen |
| Freigabestatus je Dienst, wer wann entschieden hat, ggf. Begründung bei Ablehnung | Leitung |
| Kennzeichen „Urlaubsmonat" (halbiert die Berechnungsschwellen) | Leitung |
| Errechneter Zulagenbetrag je Person und Monat | vom System berechnet |
| Passwort — gespeichert **ausschließlich** als scrypt-Hash mit Zufalls-Salt, nie im Klartext | von der Person selbst gesetzt |
| Sitzungskennungen (nur als Hash gespeichert), Anmeldezeitpunkte | technisch |
| Protokoll sicherheitsrelevanter Ereignisse: Anmeldung, fehlgeschlagene Anmeldung, Passwort-Einrichtung, Freigabeentscheidungen, Nutzerverwaltung — je mit Zeitstempel, Nutzer-ID und **gehashter** IP-Adresse | technisch |

Besondere Kategorien nach Art. 9 DSGVO werden **nicht** verarbeitet. Insbesondere sind
Krankheits-, Gesundheits- oder Abwesenheitsgründe kein Bestandteil des Systems.

## 6. Empfänger und Zugriffsrechte

**Innerhalb der Anwendung:**

| Wer | Sieht | Darf ändern |
|---|---|---|
| Jede angemeldete Person | den vollständigen Monatsplan **aller** Kolleginnen und Kollegen mit Klarnamen, Tagen, Anteilen und Freigabestatus | ausschließlich die eigenen Einträge, und nur solange sie nicht entschieden sind |
| Jede angemeldete Person | den **eigenen** Zulagenbetrag | — |
| Administrator | zusätzlich alle Zulagenbeträge, alle Konten, das Protokoll | Freigaben, Konten anlegen/deaktivieren, Anzeigenamen |

Die gegenseitige Sichtbarkeit der Namen ist eine bewusste Entscheidung (Aushang-Prinzip:
man muss sehen, welcher Tag noch frei ist). Beträge sind davon ausgenommen und bleiben
privat. Technisch erzwungen wird das serverseitig: schreibende Zugriffe verwenden
ausschließlich die Kennung aus der eigenen Sitzung, niemals eine aus der Anfrage.

**Bekannte Grenze:** Ein Administrator kann sich über die Notzugangs-Funktion einen
Anmeldelink für jedes Konto erzeugen und damit im Namen dieser Person handeln. Jeder
solche Vorgang wird protokolliert. Das ist gewollt (Zugang ohne Mailversand), sollte aber
bekannt sein.

## 7. Auftragsverarbeiter und Übermittlungen

**Hosting:** Hetzner Online GmbH. Der Server steht unter der Adresse 65.21.60.83; dieser
Bereich gehört zum Standort Helsinki (Finnland), also EU/EWR. «**Bitte gegenprüfen** —
maßgeblich ist der Auftragsverarbeitungsvertrag, nicht die IP-Zuordnung.»

**⚠️ Übermittlung an einen Dritten außerhalb der EU — der Punkt, der am leichtesten
übersehen wird:** Die Funktion „Bild importieren" schickt ein **Foto des Dienstplans** zur
Texterkennung an **OpenRouter** (openrouter.ai, USA) und von dort an das jeweils gewählte
KI-Modell (Anthropic, Google oder OpenAI). Auf einem solchen Foto stehen in aller Regel
**Klarnamen des gesamten Teams**. Die Anwendung weist im Dialog darauf hin, und der
API-Schlüssel liegt nur lokal im Browser der jeweiligen Person — die Übermittlung findet
aber statt und gehört ins Verzeichnis.

Wenn das nicht gewollt ist, gibt es zwei saubere Auswege: die Funktion nicht nutzen (sie
ist optional und ohne hinterlegten Schlüssel wirkungslos), oder sie ganz entfernen. Beides
lässt sich ohne Eingriff in den Rest der Anwendung machen.

Weitere Übermittlungen finden nicht statt. Kein Tracking, keine Analysedienste, keine
externen Schriftarten oder Skripte — die Oberfläche lädt ausschließlich Dateien vom
eigenen Server.

## 8. Löschfristen

«**Zu klären:** Die Daten belegen die Grundlage gezahlter Vergütung und unterliegen damit
steuer- und arbeitsrechtlichen Aufbewahrungspflichten. Welche Frist gilt bei euch?»

Technischer Stand dazu:

- Ausscheidende Personen werden **deaktiviert, nicht gelöscht** — die Anmeldung ist
  gesperrt, die Dienste bleiben als Nachweis erhalten. Ein Konto mit Diensten lässt sich
  bewusst nicht per Klick löschen.
- Echtes Löschen (Art. 17 DSGVO) ist möglich, ist aber ein eigener, ausdrücklicher Vorgang
  mit vorherigem Export.
- Eine Tabelle mit früheren Datenständen (`history`) wächst seit dem Umstieg auf das neue
  Modell nicht mehr; ihre Altbestände fallen unter dieselbe Aufbewahrungsentscheidung.
- Das Ereignisprotokoll wird derzeit unbegrenzt aufbewahrt. Eine Frist ist festzulegen.

## 9. Rechtsgrundlage

«**Zu klären.** In Betracht kommen: § 26 Abs. 1 BDSG (Verarbeitung für Zwecke des
Beschäftigungsverhältnisses — Abrechnung der Zulage), ergänzend Art. 6 Abs. 1 lit. f DSGVO
für die gegenseitige Sichtbarkeit des Plans, oder eine Betriebs- bzw. Dienstvereinbarung.
Gibt es bei euch eine Mitarbeitervertretung, gehört sie bei einem System, das
Arbeitszeiten erfasst und teamweit sichtbar macht, in aller Regel beteiligt.»

## 10. Technische und organisatorische Maßnahmen

- Übertragung ausschließlich verschlüsselt (TLS, Zertifikat automatisch über Let's Encrypt)
- Anmeldung wahlweise per Passwort (scrypt, Zufalls-Salt, zeitkonstanter Vergleich,
  Mindestlänge 10 Zeichen) oder Einmal-Link
- Sitzungs-Cookies `httpOnly` und `secure`, Sitzungen laufen zeitlich ab
- Datentrennung serverseitig erzwungen; die Nutzerkennung stammt immer aus der Sitzung
- Begrenzung der Anmeldeversuche je Adresse und je IP
- Fehlermeldungen bei der Anmeldung sind bewusst nichtssagend, damit sich keine gültigen
  Adressen erraten lassen
- Protokollierung sicherheitsrelevanter Ereignisse mit gehashter IP
- Tägliche automatische Sicherung der Datenbank, zusätzlich manuelle Sicherung vor jeder
  Aktualisierung
- Zugriff auf den Server nur über SSH-Schlüssel

## 11. Offener Hinweis zur Passwort-Einrichtung

Auf Wunsch des Betreibers kann eine Person ihr Passwort selbst setzen, sobald ihre Adresse
freigeschaltet ist — ohne dass vorher ein Link übergeben wird. Das ist bequem, bedeutet
aber: **wer eine freigeschaltete Adresse kennt und schneller ist als die betreffende
Person, kann deren Konto beanspruchen.** Das Zeitfenster reicht vom Anlegen des Kontos bis
zur ersten Anmeldung; danach ist das Konto verschlossen. Jede Einrichtung wird
protokolliert. Diese Abwägung wurde bewusst getroffen und ist hier festgehalten, damit sie
nachvollziehbar bleibt.
