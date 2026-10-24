# 🦖 Dino Dashboard (Deutsch) – Projekt-Manager für Antigravity & VS Code

Das **Dino Dashboard** ist deine zentrale Projektverwaltung auf Deutsch. Du kannst damit beliebige Projektordner hinzufügen, ihnen eigene Namen geben (standardmäßig wird automatisch der Ordnername übernommen), Beschreibungen automatisch aus dem Projektinhalt/README erkennen lassen und jedes Projekt mit **einem einzigen Klick direkt in Antigravity laden**, um sofort daran weiterzuarbeiten.

---

## Hauptfunktionen

### 1. Projektordner hinzufügen & dauerhaft speichern
- Klicke oben im Dashboard auf **„Ordner hinzufügen / öffnen“**, um einzelne oder mehrere Projektordner auszuwählen.
- Oder klicke auf **„Ordner scannen“**, um einen übergeordneten Ordner oder ein Laufwerk automatisch nach allen enthaltenen Projektordnern zu durchsuchen.
- Alle hinzugefügten Projekte bleiben **dauerhaft im Dino Dashboard gespeichert** (`~/.gemini/dino-dashboard-projects.json`), auch wenn du das Projekt wechselst oder das Programm neu startest.

### 2. Kompakte Tabellenansicht & 1-Klick-Öffnen
- **Kompakte Tabellenübersicht (Standard)**: Alle Projekte übersichtlich untereinander ohne riesige Kartenblöcke – perfekt auch bei 20+ Projekten.
- **1-Klick-Projektladen**: Klicke einfach auf den Projektnamen oder das Dino-Icon in der Tabelle, und das Projekt öffnet sich sofort in Antigravity!
- **Ansicht wählbar**: Über die Buttons **„☰ Tabelle“** und **„☲ Karten“** oben rechts kann jederzeit zwischen kompakter Tabelle und detaillierter Kartenansicht gewechselt werden.

### 3. ⭐ Favoriten-System (Mit Stern markieren)
- Klicke bei einem beliebigen Projekt auf das **Stern-Symbol (☆ / ⭐)**, um es als Favorit festzupinnen.
- Favoriten werden **automatisch an den Anfang der Liste sortiert**, direkt nach aktiven Workspace-Projekten.
- Über den Button **„⭐ Favoriten“** in der Werkzeugleiste kannst du mit einem Klick alle Nicht-Favoriten ausblenden und hast nur deine wichtigsten Projekte im Blick.

### 4. Projektnamen vergeben (Ordnername als Standard)
- Beim Hinzufügen übernimmt das Dino Dashboard **zuerst automatisch den Ordnernamen** als Projektnamen.
- Über den Button **„Name“** neben dem Projekttitel kannst du dem Projekt jederzeit einen eigenen Wunschnamen geben (oder mit **„Ordnername“** wieder auf den Ordnernamen zurücksetzen).

### 5. Automatische Projektbeschreibung (aus README & Ordnerinhalt)
- Das Dashboard untersucht automatisch den Inhalt jedes Projektordners:
  - Liest `README.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, `index.html` (`<title>` / `<meta>`) oder Python-Docstrings (`main.py` / `app.py`).
  - Falls keine README existiert, erkennt es anhand der vorhandenen Dateien und Unterordner automatisch, worum es sich handelt (z. B. *Web- & Spiel-Projekt*, *Python-Anwendung*, *Kodi Addon*, *C#/.NET-Projekt*) und erstellt eine passende deutsche Beschreibung.
- Über **„Ändern“** kannst du die Beschreibung jederzeit selbst anpassen oder per **„Automatisch erkennen“** neu generieren lassen.

### 6. Mit 1 Klick in Antigravity laden & weiterarbeiten
- Klicke bei einem beliebigen Projekt auf **„Projekt in Antigravity laden & arbeiten“**:
  - Das Projekt wird automatisch in Antigravity registriert (`~/.gemini/config/projects/`).
  - Der Projektordner wird sofort geladen, die wichtigsten Unterordner werden im Explorer ausgeklappt und das **Antigravity-Panel** wird aktiviert – ganz ohne manuelles *Datei -> Ordner öffnen*!
- Mit **„Dazu laden“** kannst du ein weiteres Projekt zusätzlich in deinen aktuellen Workspace holen, ohne das Fenster neu zu laden.

---

## 📦 Installation der Extension (.vsix)

Für dich und andere Nutzer:

1. Lade die Datei `dino-dashboard-1.4.1.vsix` herunter (direkt aus dem Repository oder aus den [GitHub Releases](https://github.com/X4rinia/dino-dashboard/releases)).
2. Öffne Antigravity / VS Code / Cursor.
3. Gehe in das **Erweiterungen-Menü** (`Strg + Umschalt + X`).
4. Klicke oben rechts auf die drei Punkte (`...`) und wähle **„Aus VSIX installieren...“** (oder *„Install from VSIX...“*).
5. Wähle die heruntergeladene `.vsix`-Datei aus – fertig!

Alternativ per Terminal / Konsole:
```bash
code --install-extension dino-dashboard-1.4.1.vsix
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
