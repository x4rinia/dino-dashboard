# 🦖 Dino Dashboard (Deutsch) – Projekt-Manager für Antigravity & VS Code

![Dino Dashboard Vorschau](resources/preview.png)

> **Das Dino Dashboard** ist deine zentrale Projektverwaltung auf Deutsch für Antigravity & VS Code. Du kannst neue Projekte im Handumdrehen anlegen, bestehende Ordner hinzufügen, eigene Projektnamen vergeben, Status-Hinweise setzen, ausführliche Notizen festhalten und jedes Projekt mit **einem einzigen Klick direkt in Antigravity laden**, um sofort weiterzuarbeiten.

---

## 🚀 Hauptfunktionen

### 1. ✨ Neues Projekt anlegen (mit automatischem Wechsel)
- Klicke oben auf **„✨ Neues Projekt“**:
  1. Gib den gewünschten Projektnamen / Ordnernamen ein (z. B. `MeinNeuesProjekt`).
  2. Wähle das Zielverzeichnis aus, in dem der neue Ordner erstellt werden soll.
- Das Dashboard erstellt den Ordner, initialisiert eine passende `README.md`, trägt das Projekt mit Status `⚡ In Arbeit` ein und **wechselt sofort automatisch in das neue Projekt**!

### 2. 📁 Projektordner hinzufügen & dauerhaft speichern
- Klicke auf **„📁 Ordner öffnen“**, um bestehende Projektordner auszuwählen und im Dashboard dauerhaft zu sichern.
- Klicke auf **„🔍 Scannen“**, um einen übergeordneten Hauptordner oder ein Laufwerk automatisch nach allen Unterprojekten zu durchsuchen.
- Alle Projekte bleiben **dauerhaft gespeichert** (`~/.gemini/dino-dashboard-projects.json`), auch über Neustarts hinweg.

### 3. ℹ️ Status-Hinweise & 🦖 Dino-Wächter Dialog
- **Status per Klick auf `ℹ️`**: Wähle blitzschnell den aktuellen Projektstatus:
  - `⚡ In Arbeit`
  - `✅ Abgeschlossen`
  - `⏳ Pausiert`
  - `🐛 Bugfix`
  - `✨ In Planung`
- **🦖 Dino-Wächter Sprechfenster**: Klicke oben auf den Dino-Wächter oder auf das Dino-Icon / Status-Badge eines Projekts – ein modales Dialogfenster öffnet sich und der Dino berichtet dir den Status und die Notizen deines Projekts!

### 4. 📌 Ausführliche Notizen (Mehrzeilig)
- Jedes Projekt besitzt ein komfortables mehrzeiliges Notizfeld (`textarea`).
- Halte hier ausführliche To-Dos, aktuelle Meilensteine oder Fehlerbeschreibungen (z. B. *„ist in arbeit, button noch verbuggt etc.“*) fest.
- In der Tabelle siehst du eine praktische Vorschau mit Klick zur Bearbeitung.

### 5. ☰ Kompakte Tabellenansicht & 1-Klick-Öffnen
- **Kompakte Tabellenübersicht (Standard)**: Alle Projekte übersichtlich untereinander – perfekt auch bei 20+ Projekten.
- **1-Klick-Projektladen**: Klicke auf **„🚀 Öffnen“** oder auf das Dino-Icon, und das Projekt öffnet sich sofort in Antigravity!
- **Ansicht wählbar**: Über die Buttons **„☰ Tabelle“** und **„☲ Karten“** oben rechts kann jederzeit zwischen kompakter Tabelle und detaillierten Karten gewechselt werden.

### 6. ⭐ Favoriten-System (Mit Stern markieren)
- Klicke bei einem Projekt auf das **Stern-Symbol (☆ / ⭐)**, um es als Favorit festzupinnen.
- Favoriten werden **automatisch an den Anfang der Liste sortiert**.
- Über den Button **„⭐ Favoriten“** in der Leiste filterst du mit einem Klick alle Nicht-Favoriten heraus.

### 7. 🏷️ Eigene Namen & automatische Projektbeschreibung
- Passe Projektnamen mit Klick auf **✏️** an oder setze sie auf den Ordnernamen zurück.
- Das Dashboard analysiert automatisch den Inhalt (README, `package.json`, Python, HTML etc.) und generiert deutsche Projektbeschreibungen.

---

## 📦 Installation der Extension (.vsix)

1. Lade die Datei `dino-dashboard-1.4.5.vsix` herunter (aus dem Repository oder den [GitHub Releases](https://github.com/X4rinia/dino-dashboard/releases)).
2. Öffne Antigravity / VS Code / Cursor.
3. Gehe in das **Erweiterungen-Menü** (`Strg + Umschalt + X`).
4. Klicke oben rechts auf die drei Punkte (`...`) und wähle **„Aus VSIX installieren...“** (*„Install from VSIX...“*).
5. Wähle die heruntergeladene `.vsix`-Datei aus – fertig!

Alternativ per Terminal:
```bash
code --install-extension dino-dashboard-1.4.5.vsix
```

---

## Entwicklung & Kompilierung

Aufbau des Quellcodes:

- `src/extension.ts` – Einstiegspunkt, Befehle und automatischer Antigravity-Fokus
- `src/projectScanner.ts` – Persistente Projekt-Registry, automatische Beschreibungserkennung & Antigravity-Synchronisation
- `src/sidebarProvider.ts` – Deutsche Benutzeroberfläche des Dino Dashboards
- `src/autoExpander.ts` – Automatisches Ausklappen wichtiger Projektordner im Explorer
- `src/types.ts` – TypeScript-Datentypen

Kompilieren:
```bash
npm run compile
```
