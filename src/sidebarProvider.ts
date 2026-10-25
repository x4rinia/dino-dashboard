import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectScanner } from './projectScanner';
import { AutoExpander } from './autoExpander';
import { DashboardSettings } from './types';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'projectOverview.sidebarView';
    public static readonly explorerViewType = 'projectOverview.explorerView';

    private context: vscode.ExtensionContext;
    private scanner: ProjectScanner;
    private autoExpander: AutoExpander;
    private _views = new Set<vscode.WebviewView>();

    constructor(context: vscode.ExtensionContext, scanner: ProjectScanner, autoExpander: AutoExpander) {
        this.context = context;
        this.scanner = scanner;
        this.autoExpander = autoExpander;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._views.add(webviewView);
        webviewView.onDidDispose(() => {
            this._views.delete(webviewView);
        });

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'ready':
                case 'refresh': {
                    await this.updateDashboard();
                    break;
                }
                case 'addFolder': {
                    await this.promptAddFolder(false);
                    break;
                }
                case 'createNewProject': {
                    await this.promptCreateNewProject();
                    break;
                }
                case 'addAndOpenFolder': {
                    await this.promptAddFolder(true);
                    break;
                }
                case 'scanParentFolder': {
                    await this.promptScanParentFolder();
                    break;
                }
                case 'openInAntigravity': {
                    if (message.uri) {
                        await this.loadProjectInAntigravity(message.uri, message.name, false);
                    }
                    break;
                }
                case 'addToCurrentWorkspace': {
                    if (message.uri) {
                        await this.loadProjectInAntigravity(message.uri, message.name, true);
                    }
                    break;
                }
                case 'focusAntigravityPanel': {
                    try {
                        await vscode.commands.executeCommand('antigravity.panel.focus');
                    } catch {
                        vscode.window.showInformationMessage('Antigravity-Panel ist bereits aktiv.');
                    }
                    break;
                }
                case 'openFullDashboard': {
                    try {
                        await vscode.commands.executeCommand('projectOverview.sidebarView.focus');
                    } catch {
                        try {
                            await vscode.commands.executeCommand('workbench.view.extension.project-overview-container');
                        } catch { }
                    }
                    break;
                }
                case 'toggleFavorite': {
                    if (message.uri) {
                        const fsPath = vscode.Uri.parse(message.uri).fsPath;
                        const current = await this.scanner.loadPersistedDataByPath(fsPath);
                        const newFav = !current.isFavorite;
                        await this.scanner.savePersistedData(message.uri, { isFavorite: newFav });
                        const name = message.name || path.basename(fsPath);
                        vscode.window.showInformationMessage(
                            newFav
                                ? `⭐ Projekt „${name}“ zu den Favoriten hinzugefügt!`
                                : `☆ Projekt „${name}“ aus den Favoriten entfernt.`
                        );
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'setStatusHint': {
                    if (message.uri) {
                        await this.scanner.savePersistedData(message.uri, { statusHint: message.statusHint || '' });
                        const hintText = message.statusHint
                            ? `🦖 Dino-Wächter: Hinweis gesetzt auf „${message.statusHint}“!`
                            : 'Hinweis entfernt.';
                        vscode.window.showInformationMessage(hintText);
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'removeProject': {
                    if (message.uri) {
                        await this.scanner.removeProjectFolder(message.uri);
                        const label = message.name ? `Projekt „${message.name}“` : 'Projekt';
                        vscode.window.showInformationMessage(`${label} aus dem Dino Dashboard entfernt.`);
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'saveName': {
                    if (message.uri !== undefined && typeof message.customName === 'string') {
                        await this.scanner.savePersistedData(message.uri, { customName: message.customName.trim() });
                        vscode.window.showInformationMessage(
                            message.customName.trim()
                                ? `Projektname geändert zu „${message.customName.trim()}“.`
                                : 'Projektname auf Ordnernamen zurückgesetzt.'
                        );
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'saveDescription': {
                    if (message.uri !== undefined && typeof message.customDescription === 'string') {
                        await this.scanner.savePersistedData(message.uri, { customDescription: message.customDescription.trim() });
                        vscode.window.showInformationMessage(
                            message.customDescription.trim()
                                ? 'Projektbeschreibung gespeichert.'
                                : 'Automatische Projektbeschreibung wiederhergestellt.'
                        );
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'autoExpand': {
                    const settings = this.getSettings();
                    await this.autoExpander.expandWorkspace(settings, true);
                    vscode.window.showInformationMessage('Projektordner im Explorer ausgeklappt.');
                    break;
                }
                case 'openSettings': {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'projectSummary');
                    break;
                }
                case 'closeFolder':
                case 'closeCurrentProject': {
                    await this.closeCurrentProject();
                    break;
                }
                case 'openFolderNewWindow': {
                    if (message.uri) {
                        const uri = vscode.Uri.parse(message.uri);
                        await vscode.commands.executeCommand('vscode.openFolder', uri, true);
                    }
                    break;
                }
                case 'revealInExplorer': {
                    if (message.uri) {
                        const uri = vscode.Uri.parse(message.uri);
                        try {
                            await vscode.commands.executeCommand('revealInExplorer', uri);
                        } catch {
                            await vscode.env.openExternal(uri);
                        }
                    }
                    break;
                }
                case 'openReadme': {
                    if (message.uri) {
                        const uri = vscode.Uri.parse(message.uri);
                        await vscode.commands.executeCommand('vscode.open', uri);
                    } else {
                        vscode.window.showInformationMessage('Keine README-Datei in diesem Projekt gefunden.');
                    }
                    break;
                }
                case 'saveNotes': {
                    if (message.uri && typeof message.notes === 'string') {
                        await this.scanner.savePersistedData(message.uri, { notes: message.notes });
                        vscode.window.showInformationMessage('Projekt-Notizen gespeichert.');
                        await this.updateDashboard();
                    }
                    break;
                }
                case 'addTag': {
                    if (message.uri && message.tag) {
                        const trimmed = message.tag.trim();
                        if (trimmed) {
                            const fsPath = vscode.Uri.parse(message.uri).fsPath;
                            const current = await this.scanner.loadPersistedDataByPath(fsPath);
                            if (!current.tags.includes(trimmed)) {
                                const updatedTags = [...current.tags, trimmed];
                                await this.scanner.savePersistedData(message.uri, { tags: updatedTags });
                                await this.updateDashboard();
                            }
                        }
                    }
                    break;
                }
                case 'removeTag': {
                    if (message.uri && message.tag) {
                        const fsPath = vscode.Uri.parse(message.uri).fsPath;
                        const current = await this.scanner.loadPersistedDataByPath(fsPath);
                        const updatedTags = current.tags.filter(t => t !== message.tag);
                        await this.scanner.savePersistedData(message.uri, { tags: updatedTags });
                        await this.updateDashboard();
                    }
                    break;
                }
            }
        });

        this.updateDashboard();
    }

    /**
     * Öffnet einen Dialog zum Hinzufügen eines oder mehrerer Projektordner.
     */
    public async promptAddFolder(loadImmediately = false): Promise<void> {
        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
            ? vscode.Uri.file(path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath))
            : undefined;

        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: !loadImmediately,
            defaultUri,
            openLabel: loadImmediately ? 'Ordner öffnen & in Antigravity laden' : 'Projektordner zum Dino Dashboard hinzufügen',
            title: 'Projektordner auswählen (Ordnername wird automatisch als Projektname übernommen)'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        for (const uri of selected) {
            await this.scanner.addProjectFolder(uri.fsPath);
        }

        await this.updateDashboard();

        if (loadImmediately || selected.length === 1) {
            const firstUri = selected[0];
            const folderName = path.basename(firstUri.fsPath);
            if (loadImmediately) {
                await this.loadProjectInAntigravity(firstUri.toString(), folderName, false);
            } else {
                const choice = await vscode.window.showInformationMessage(
                    `Projekt „${folderName}“ wurde zum Dino Dashboard hinzugefügt! Möchtest du es direkt in Antigravity laden?`,
                    '🚀 Jetzt in Antigravity laden',
                    '➕ Zum aktuellen Workspace hinzufügen',
                    'Nur in Liste speichern'
                );
                if (choice === '🚀 Jetzt in Antigravity laden') {
                    await this.loadProjectInAntigravity(firstUri.toString(), folderName, false);
                } else if (choice === '➕ Zum aktuellen Workspace hinzufügen') {
                    await this.loadProjectInAntigravity(firstUri.toString(), folderName, true);
                }
            }
        } else {
            vscode.window.showInformationMessage(`${selected.length} Projekte wurden zum Dino Dashboard hinzugefügt.`);
        }
    }

    /**
     * Erstellt ein neues Projekt: Fragt nach Ordnername und Speicherort,
     * erstellt den Ordner, initialisiert eine README.md, speichert das Projekt im Dino Dashboard
     * und wechselt automatisch hinein.
     */
    public async promptCreateNewProject(): Promise<void> {
        // 1. Nach Ordnername / Projektname fragen
        const folderName = await vscode.window.showInputBox({
            title: '✨ Neues Projekt erstellen – Schritt 1 von 2',
            prompt: 'Gib den Namen für den neuen Projektordner ein:',
            placeHolder: 'z. B. MeinNeuesProjekt',
            validateInput: (value) => {
                if (!value || !value.trim()) {
                    return 'Bitte einen Namen für das Projekt eingeben.';
                }
                const invalidChars = /[\\/:*?"<>|]/;
                if (invalidChars.test(value)) {
                    return 'Der Name darf keine Sonderzeichen wie \\ / : * ? " < > | enthalten.';
                }
                return null;
            }
        });

        if (!folderName || !folderName.trim()) {
            return;
        }

        const cleanFolderName = folderName.trim();

        // 2. Nach Zielverzeichnis fragen
        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
            ? vscode.Uri.file(path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath))
            : undefined;

        const selectedParent = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri,
            title: `✨ Neues Projekt „${cleanFolderName}“ – Schritt 2 von 2: Speicherort wählen`,
            openLabel: `Ordner „${cleanFolderName}“ hier erstellen`
        });

        if (!selectedParent || selectedParent.length === 0) {
            return;
        }

        const parentDir = selectedParent[0].fsPath;
        const newProjectPath = path.join(parentDir, cleanFolderName);

        try {
            if (!fs.existsSync(newProjectPath)) {
                fs.mkdirSync(newProjectPath, { recursive: true });
            }

            // Standard README.md erzeugen, falls noch keine vorhanden ist
            const readmePath = path.join(newProjectPath, 'README.md');
            if (!fs.existsSync(readmePath)) {
                const initialReadme = `# 🦖 ${cleanFolderName}\n\nNeues Projekt, erstellt mit dem Dino Dashboard.\n\n## Notizen\n- Projekt initialisiert\n`;
                fs.writeFileSync(readmePath, initialReadme, 'utf-8');
            }

            const newProjectUri = vscode.Uri.file(newProjectPath).toString();

            // Im Dino Dashboard registrieren und Status auf '⚡ In Arbeit' setzen
            await this.scanner.addProjectFolder(newProjectPath);
            await this.scanner.savePersistedData(newProjectUri, {
                customName: cleanFolderName,
                statusHint: '⚡ In Arbeit'
            });

            vscode.window.showInformationMessage(`🦖 Neues Projekt „${cleanFolderName}“ wurde erstellt! Wechsel zum Projekt...`);

            // Automatisch in das neue Projekt wechseln!
            await this.loadProjectInAntigravity(newProjectUri, cleanFolderName, false);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Fehler beim Erstellen des neuen Projekts: ${err?.message || err}`);
        }
    }

    /**
     * Schließt das aktuell geöffnete Projekt (Ordner schließen), um zum Startzustand zurückzukehren.
     */
    public async closeCurrentProject(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.closeFolder');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Fehler beim Schließen des Projekts: ${err?.message || err}`);
        }
    }

    /**
     * Scannt einen Überordner und importiert alle darin enthaltenen Projektordner.
     */
    public async promptScanParentFolder(): Promise<void> {
        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
            ? vscode.Uri.file(path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath))
            : undefined;
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri,
            openLabel: 'Alle Projekte in diesem Ordner importieren',
            title: 'Überordner auswählen, um alle enthaltenen Projektordner zu erkennen'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        const parentPath = selected[0].fsPath;
        const settings = this.getSettings();
        const count = await this.scanner.scanParentDirectory(parentPath, settings.ignoredFolders);
        await this.updateDashboard();
        vscode.window.showInformationMessage(
            count > 0
                ? `${count} neue Projekte aus „${parentPath}“ automatisch erkannt und hinzugefügt!`
                : `Alle Projekte aus „${parentPath}“ sind bereits im Dino Dashboard vorhanden.`
        );
    }

    /**
     * Lädt ein ausgewähltes Projekt direkt in Antigravity / VS Code, sodass sofort daran weitergearbeitet werden kann.
     */
    public async loadProjectInAntigravity(uriStr: string, projectName?: string, addToCurrentWorkspace = false): Promise<void> {
        const uri = vscode.Uri.parse(uriStr);
        const fsPath = uri.fsPath;
        const effectiveName = projectName || path.basename(fsPath);

        // 1. In unserer Liste & in Antigravity registrieren
        await this.scanner.addProjectFolder(fsPath);
        this.scanner.ensureAntigravityProjectRegistered(fsPath, effectiveName);

        // 2. Flag setzen, damit nach dem Laden automatisch Explorer & Antigravity-Panel fokussiert werden
        await this.context.globalState.update('dinoDashboard.justLoadedProject', fsPath);

        if (addToCurrentWorkspace) {
            const existing = vscode.workspace.workspaceFolders || [];
            const alreadyOpen = existing.some(f => f.uri.fsPath.toLowerCase() === fsPath.toLowerCase());
            if (!alreadyOpen) {
                vscode.workspace.updateWorkspaceFolders(existing.length, 0, {
                    uri,
                    name: effectiveName
                });
            }
            vscode.window.showInformationMessage(`🦖 Projekt „${effectiveName}“ ist jetzt im Workspace geladen!`);
            try {
                await vscode.commands.executeCommand('antigravity.panel.focus');
            } catch { }
            await this.updateDashboard();
            return;
        }

        // Standard: Direkt als aktives Projekt in Antigravity öffnen (im selben Fenster)
        const existing = vscode.workspace.workspaceFolders || [];
        if (existing.length === 1 && existing[0].uri.fsPath.toLowerCase() === fsPath.toLowerCase()) {
            // Ist bereits geöffnet -> Direkt Antigravity-Panel und Explorer öffnen
            try {
                await vscode.commands.executeCommand('antigravity.panel.focus');
            } catch { }
            const settings = this.getSettings();
            await this.autoExpander.expandWorkspace(settings, true);
            vscode.window.showInformationMessage(`🦖 Projekt „${effectiveName}“ ist bereits aktiv – du kannst direkt in Antigravity weiterarbeiten!`);
            return;
        }

        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }

    public async updateDashboard(): Promise<void> {
        if (this._views.size === 0) {
            return;
        }
        const settings = this.getSettings();
        const projects = await this.scanner.scanAll(settings);
        const workspaceName = vscode.workspace.name || 'Workspace';

        for (const view of this._views) {
            const isExplorer = view.viewType === SidebarProvider.explorerViewType;
            const payload = {
                type: 'stateUpdate',
                projects,
                settings,
                workspaceName,
                isExplorerView: isExplorer
            };
            view.webview.postMessage(payload);
        }
    }

    public getSettings(): DashboardSettings {
        const config = vscode.workspace.getConfiguration('projectSummary');
        return {
            autoExpandExplorer: config.get<boolean>('autoExpandExplorer', true),
            autoFocusAntigravity: config.get<boolean>('autoFocusAntigravity', true),
            ignoredFolders: config.get<string[]>('ignoredFolders', [
                'node_modules',
                '.git',
                'dist',
                'build',
                '.venv',
                'venv',
                'target',
                'vendor',
                '.next',
                '.nuxt',
                'coverage',
                '.cache',
                '__pycache__'
            ]),
            showMascot: config.get<boolean>('showMascot', true),
            mascotTitle: config.get<string>('mascotTitle', 'Dino-Wächter'),
            maxAutoExpandDepth: config.get<number>('maxAutoExpandDepth', 1)
        };
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getHtmlForWebview(_webview: vscode.Webview): string {
        const nonce = this.getNonce();
        return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Dino Dashboard</title>
  <style>
    :root {
      --card-bg: var(--vscode-sideBar-background);
      --card-border: var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.25)));
      --text-muted: var(--vscode-descriptionForeground);
      --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --active-green: #2ea043;
      --active-green-text: #3fb950;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 10px 8px 34px;
      line-height: 1.4;
      overflow-x: hidden;
    }

    /* Kopfzeile mit Dino-Maskottchen */
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--card-border);
    }

    .header-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .header-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
    }

    .header-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }

    .mascot-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
    }

    .mascot-badge:hover {
      background: rgba(255, 255, 255, 0.12);
      transform: translateY(-1px);
    }

    .mascot-icon {
      font-size: 15px;
      animation: gentle-bob 3s ease-in-out infinite alternate;
      display: inline-block;
    }

    @keyframes gentle-bob {
      0% { transform: translateY(0); }
      100% { transform: translateY(-2px) scale(1.05); }
    }

    /* Haupt-Werkzeugleiste für Ordner öffnen & Suche */
    .toolbar {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }

    .toolbar-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .search-input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 11.5px;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--vscode-focusBorder, var(--accent));
    }

    /* Ansicht-Umschalter (Tabelle vs. Karten) */
    .view-switcher {
      display: inline-flex;
      border: 1px solid var(--card-border);
      border-radius: 4px;
      overflow: hidden;
      background: rgba(128, 128, 128, 0.08);
      flex-shrink: 0;
    }

    .view-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 4px 7px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.15s ease;
    }

    .view-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-weight: 600;
    }

    /* Tabelle / Kompakte Ansicht */
    .projects-table-wrap {
      border: 1px solid var(--card-border);
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-editor-background);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      display: flex;
      flex-direction: column;
    }

    .table-row-item {
      border-bottom: 1px solid var(--card-border);
      transition: background 0.12s ease;
      display: flex;
      flex-direction: column;
    }
    .table-row-item:last-child {
      border-bottom: none;
    }

    .table-main-row {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      gap: 6px;
      cursor: pointer;
      user-select: none;
      position: relative;
      transition: background 0.12s ease;
    }
    .table-main-row:hover {
      background: rgba(128, 128, 128, 0.1);
    }

    .table-row-item.active-item {
      background: rgba(46, 160, 67, 0.08);
      border-left: 3.5px solid var(--active-green-text);
    }
    .table-row-item.favorite-item:not(.active-item) {
      border-left: 3.5px solid #e3b341;
    }

    .cell-fav-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .cell-fav-btn:hover {
      transform: scale(1.3);
    }
    .cell-fav-btn.is-fav {
      color: #e3b341;
      filter: drop-shadow(0 0 3px rgba(227, 179, 65, 0.6));
    }

    .cell-icon-wrap {
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cell-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .cell-title-line {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: nowrap;
      overflow: hidden;
      min-width: 0;
    }

    .cell-title-text {
      font-size: 13px;
      font-weight: 700;
      color: var(--vscode-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 30px;
      flex: 1;
    }

    .cell-sub-line {
      font-size: 10.5px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
      min-width: 0;
    }

    .cell-path-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex: 1;
    }

    .mini-pill {
      font-size: 9.5px;
      padding: 1px 5px;
      border-radius: 8px;
      font-weight: 600;
      white-space: nowrap;
    }

    .tbl-chevron {
      font-size: 9.5px;
      color: var(--text-muted);
      transition: transform 0.15s ease;
      display: inline-block;
      width: 12px;
      text-align: center;
      flex-shrink: 0;
    }

    .note-pill {
      font-size: 10px;
      padding: 1.5px 6px;
      border-radius: 4px;
      background: rgba(234, 179, 8, 0.16);
      color: #e3b341;
      border: 1px solid rgba(234, 179, 8, 0.4);
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .note-pill:hover {
      background: rgba(234, 179, 8, 0.28);
      border-color: rgba(234, 179, 8, 0.65);
    }

    .tbl-btn-note-add {
      font-size: 9.5px;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px dashed var(--card-border);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      opacity: 0.75;
      transition: all 0.15s ease;
    }
    .tbl-btn-note-add:hover {
      opacity: 1;
      border-color: #e3b341;
      color: #e3b341;
    }

    .note-inline-edit {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px 0;
      width: 100%;
    }

    .quick-chip {
      font-size: 9.5px;
      padding: 2px 6px;
      border-radius: 10px;
      border: 1px solid var(--card-border);
      background: rgba(128, 128, 128, 0.1);
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }
    .quick-chip:hover {
      background: rgba(128, 128, 128, 0.25);
      color: var(--vscode-foreground);
      border-color: var(--vscode-focusBorder, var(--accent));
    }

    /* Status-Hinweise (In Arbeit, Abgeschlossen, etc.) */
    .status-hint-pill {
      font-size: 10px;
      padding: 1.5px 6px;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.15s ease;
    }
    .status-hint-in-arbeit {
      background: rgba(234, 179, 8, 0.18);
      color: #e3b341;
      border: 1px solid rgba(234, 179, 8, 0.45);
    }
    .status-hint-abgeschlossen {
      background: rgba(46, 160, 67, 0.18);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.45);
    }
    .status-hint-pausiert {
      background: rgba(88, 166, 255, 0.18);
      color: #58a6ff;
      border: 1px solid rgba(88, 166, 255, 0.45);
    }
    .status-hint-bugfix {
      background: rgba(248, 81, 73, 0.18);
      color: #f85149;
      border: 1px solid rgba(248, 81, 73, 0.45);
    }
    .status-hint-planung {
      background: rgba(187, 128, 255, 0.18);
      color: #bc8cff;
      border: 1px solid rgba(187, 128, 255, 0.45);
    }
    .status-hint-pill:hover {
      filter: brightness(1.2);
      transform: scale(1.05);
    }

    /* Status Picker Menu */
    .status-picker-dropdown {
      display: flex;
      flex-direction: column;
      gap: 3px;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-focusBorder, var(--accent));
      border-radius: 6px;
      padding: 6px;
      margin-top: 5px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
      animation: pop-in 0.12s ease;
    }
    .status-opt-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 11px;
      cursor: pointer;
      text-align: left;
      transition: background 0.12s ease;
    }
    .status-opt-btn:hover {
      background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.18));
    }

    /* Dino-Wächter Sprechblasen-Fenster */
    .dino-dialogue-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      backdrop-filter: blur(2px);
    }
    .dino-dialogue-window {
      background: var(--vscode-editor-background);
      border: 1.5px solid var(--accent);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      width: 100%;
      max-width: 330px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      animation: pop-in 0.16s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    @keyframes pop-in {
      0% { opacity: 0; transform: scale(0.92); }
      100% { opacity: 1; transform: scale(1); }
    }
    .dino-dialogue-header {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
    }
    .dino-speech-bubble {
      background: rgba(128, 128, 128, 0.08);
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.45;
      color: var(--vscode-foreground);
      border: 1px solid var(--card-border);
    }

    .cell-quick-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .tbl-btn {
      background: rgba(128, 128, 128, 0.15);
      color: var(--vscode-foreground);
      border: 1px solid var(--card-border);
      padding: 3px 6px;
      font-size: 11px;
      border-radius: 3px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.15s ease;
    }
    .tbl-btn:hover {
      background: rgba(128, 128, 128, 0.3);
    }
    .tbl-btn-launch {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      font-weight: 600;
      padding: 4px 9px;
    }
    .tbl-btn-launch:hover {
      filter: brightness(1.15);
    }
    .tbl-btn-active {
      background: rgba(46, 160, 67, 0.22);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.5);
      font-weight: 600;
      padding: 4px 8px;
    }
    .tbl-btn-delete:hover {
      background: rgba(248, 81, 73, 0.25);
      color: #f85149;
      border-color: rgba(248, 81, 73, 0.4);
    }

    .table-inline-details {
      padding: 10px 12px 12px;
      background: rgba(128, 128, 128, 0.05);
      border-top: 1px dashed var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    /* Projekt-Karten */
    .projects-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .project-card {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--card-border);
      border-radius: 7px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .project-card.active-card {
      border: 1.5px solid var(--active-green-text);
      box-shadow: 0 0 0 1px rgba(63, 185, 80, 0.2);
    }

    .project-card.favorite-card:not(.active-card) {
      border-color: rgba(234, 179, 8, 0.45);
      box-shadow: 0 0 0 1px rgba(234, 179, 8, 0.15);
    }

    .project-card:hover {
      border-color: var(--vscode-focusBorder, var(--accent));
    }

    .fav-star-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      padding: 1px 3px;
      border-radius: 4px;
      transition: transform 0.15s ease, filter 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      user-select: none;
    }

    .fav-star-btn:hover {
      transform: scale(1.25);
    }

    .fav-star-btn.is-fav {
      color: #e3b341;
      filter: drop-shadow(0 0 4px rgba(227, 179, 65, 0.5));
    }

    .fav-pill {
      background: rgba(227, 179, 65, 0.16);
      color: #e3b341;
      border: 1px solid rgba(227, 179, 65, 0.35);
    }

    .filter-fav-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 5px 8px;
      border-radius: 4px;
      border: 1px solid var(--card-border);
      background: rgba(128, 128, 128, 0.08);
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .filter-fav-btn:hover {
      background: rgba(128, 128, 128, 0.2);
      color: var(--vscode-foreground);
    }

    .filter-fav-btn.active {
      background: rgba(227, 179, 65, 0.22);
      border-color: rgba(227, 179, 65, 0.6);
      color: #e3b341;
      font-weight: 600;
    }

    .card-header {
      padding: 10px 12px;
      background: rgba(128, 128, 128, 0.06);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .card-header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
    }

    .card-title-area {
      flex: 1;
      min-width: 0;
    }

    .project-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .project-name {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--vscode-foreground);
      word-break: break-word;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 11px;
      padding: 1px 4px;
      border-radius: 3px;
    }

    .icon-btn:hover {
      color: var(--vscode-foreground);
      background: rgba(128, 128, 128, 0.2);
    }

    .project-path {
      font-size: 10.5px;
      color: var(--text-muted);
      word-break: break-all;
      margin-top: 2px;
    }

    .badges-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }

    /* Status-Pills */
    .health-pill {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 10px;
      font-weight: 600;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .active-pill {
      background: rgba(46, 160, 67, 0.25);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.5);
    }

    .health-healthy {
      background: rgba(46, 160, 67, 0.14);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.3);
    }

    .health-warning {
      background: rgba(210, 153, 34, 0.18);
      color: #d29922;
      border: 1px solid rgba(210, 153, 34, 0.3);
    }

    .health-info {
      background: rgba(88, 166, 255, 0.18);
      color: #58a6ff;
      border: 1px solid rgba(88, 166, 255, 0.3);
    }

    .card-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Beschreibung */
    .desc-box {
      background: rgba(128, 128, 128, 0.04);
      border: 1px solid var(--card-border);
      border-radius: 5px;
      padding: 7px 9px;
    }

    .desc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .project-desc {
      font-size: 11.5px;
      color: var(--vscode-foreground);
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Haupt-Button: In Antigravity öffnen */
    .antigravity-launch-row {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }

    .btn-launch {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      padding: 7px 10px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      transition: filter 0.15s ease, transform 0.1s ease;
    }

    .btn-launch:hover {
      filter: brightness(1.1);
    }

    .btn-launch-active {
      background: rgba(46, 160, 67, 0.22);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.45);
    }

    /* Tech Stack Tags */
    .stack-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .tag {
      font-size: 10.5px;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      user-select: none;
    }

    .custom-tag {
      background: rgba(128, 128, 128, 0.2);
      color: var(--vscode-foreground);
      border: 1px dashed var(--card-border);
    }

    .tag-remove {
      cursor: pointer;
      font-size: 11px;
      opacity: 0.6;
    }
    .tag-remove:hover {
      opacity: 1;
    }

    /* Statistiken */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      background: rgba(128, 128, 128, 0.04);
      padding: 7px 8px;
      border-radius: 4px;
      border: 1px solid var(--card-border);
    }

    .stat-item {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 9.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-muted);
    }

    .stat-value {
      font-size: 11px;
      font-weight: 500;
      color: var(--vscode-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .health-details {
      font-size: 10.5px;
      color: var(--text-muted);
      border-left: 2px solid var(--card-border);
      padding-left: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* Aktions-Buttons */
    .action-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      padding-top: 2px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: none;
      padding: 4px 8px;
      font-size: 11px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.15s ease;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.35));
    }

    .btn-primary {
      background: var(--accent);
      color: var(--accent-fg);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-danger {
      color: #f85149;
      border-color: rgba(248, 81, 73, 0.4);
    }

    .btn-danger:hover {
      background: rgba(248, 81, 73, 0.25);
      color: #ff7b72;
      border-color: #f85149;
    }

    /* Notizen & Formulare */
    .notes-box {
      padding: 6px 8px;
      background: rgba(128, 128, 128, 0.05);
      border: 1px solid var(--card-border);
      border-radius: 4px;
    }

    .notes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .notes-content {
      font-size: 11.5px;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--vscode-foreground);
    }

    .notes-textarea {
      width: 100%;
      min-height: 54px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 3px;
      padding: 6px;
      font-size: 11px;
      font-family: inherit;
      resize: vertical;
      outline: none;
    }

    .inline-input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-focusBorder, var(--card-border));
      border-radius: 3px;
      padding: 4px 6px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }

    .empty-state {
      text-align: center;
      padding: 26px 10px;
      color: var(--text-muted);
      border: 1px dashed var(--card-border);
      border-radius: 6px;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .tag-input-row {
      display: none;
      gap: 4px;
      margin-top: 4px;
    }

    .tag-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--card-border));
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 11px;
      outline: none;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title-wrap">
      <div class="header-title" id="workspaceName">🦖 DINO DASHBOARD</div>
      <div class="header-subtitle" id="projectCount">Scanne Projekte...</div>
    </div>
    <div class="mascot-badge" id="mascotBadge" title="Klicke, um den Dino-Wächter zu grüßen!">
      <span class="mascot-icon">🦖</span>
      <span id="mascotText">Dino-Wächter</span>
    </div>
  </div>

  <!-- Werkzeugleiste: Neues Projekt, Ordner öffnen, Überordner scannen, Suchen & Favoriten-Filter & Ansichten -->
  <div class="toolbar">
    <div class="toolbar-buttons">
      <button class="btn btn-primary" style="flex: 1.1; justify-content: center; padding: 6px 8px; font-weight: 600;" onclick="createNewProject()" title="Ein ganz neues Projekt anlegen: Ordnername und Speicherort wählen, direkt öffnen">
        ✨ Neues Projekt
      </button>
      <button class="btn" style="flex: 1; justify-content: center; padding: 6px 8px;" onclick="addFolder()" title="Bestehenden Projektordner auswählen und im Dashboard speichern">
        📁 Ordner öffnen
      </button>
      <button class="btn" style="padding: 6px 8px;" onclick="scanParentFolder()" title="Einen Hauptordner nach allen Projekten durchsuchen">
        🔍 Scannen
      </button>
    </div>
    <div style="display: flex; gap: 5px; align-items: center;">
      <input type="text" class="search-input" id="searchInput" placeholder="🔎 Suchen..." oninput="handleSearch(event)">
      <button class="filter-fav-btn" id="filterFavBtn" onclick="toggleFilterFavorites()" title="Nur mit Stern markierte Favoriten anzeigen">
        ⭐ Favoriten
      </button>
      <div class="view-switcher">
        <button class="view-btn" id="viewBtnTable" onclick="setViewMode('table')" title="Kompakte Tabellenansicht (Standard)">☰ Tabelle</button>
        <button class="view-btn" id="viewBtnCards" onclick="setViewMode('cards')" title="Detaillierte Kartenansicht">☲ Karten</button>
      </div>
    </div>
  </div>

  <div class="projects-container" id="projectsContainer">
    <div class="empty-state">
      <div class="empty-icon">🦖</div>
      <p>Noch keine Projekte hinzugefügt.</p>
      <p style="font-size: 11px; margin-top: 4px;">Klicke oben auf „📁 Ordner hinzufügen / öffnen“, um deine Projekte zu verwalten.</p>
    </div>
  </div>

  <!-- Dino-Wächter Sprechblasen-Fenster (Dialog) -->
  <div id="dinoDialogueBackdrop" class="dino-dialogue-backdrop" style="display: none;" onclick="closeDinoDialogue(event)">
    <div class="dino-dialogue-window" onclick="event.stopPropagation()">
      <div class="dino-dialogue-header">
        <span style="font-size: 22px;">🦖</span>
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 13px; color: var(--accent);">Dino-Wächter</div>
          <div id="dialogueProjectName" style="font-size: 11px; color: var(--text-muted);">Projekt-Statusbericht</div>
        </div>
        <button class="icon-btn" onclick="closeDinoDialogue()" style="font-size: 14px; cursor: pointer;">✕</button>
      </div>
      <div class="dino-speech-bubble" id="dialogueSpeechText">
        <!-- Dynamischer Inhalt -->
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px;">
        <button class="btn btn-primary" onclick="closeDinoDialogue()" style="padding: 5px 14px; font-weight: 600;">Alles klar! 🦖</button>
      </div>
    </div>
  </div>

  <!-- Projekt-Notiz Fenster (Modal bei Klick auf i-Button) -->
  <div id="projectNoteBackdrop" class="dino-dialogue-backdrop" style="display: none;" onclick="closeNoteModal(event)">
    <div class="dino-dialogue-window" onclick="event.stopPropagation()" style="max-width: 380px;">
      <div class="dino-dialogue-header">
        <span style="font-size: 20px;">📌</span>
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 13px; color: var(--accent);" id="noteModalTitle">Projekt-Notiz</div>
          <div id="noteModalSubtitle" style="font-size: 11px; color: var(--text-muted);">Notizen & To-Dos bearbeiten</div>
        </div>
        <button class="icon-btn" onclick="closeNoteModal()" style="font-size: 14px; cursor: pointer;">✕</button>
      </div>
      <div style="margin-top: 6px;">
        <textarea class="notes-textarea" id="noteModalTextarea" rows="6" placeholder="Trage hier Notizen, To-Dos oder Fehler ein (z. B. 'ist in arbeit, button noch verbuggt')..."></textarea>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;">
        <button class="btn" onclick="closeNoteModal()">Schließen</button>
        <button class="btn btn-primary" onclick="saveNoteFromModal()" style="padding: 5px 14px; font-weight: 600;">💾 Speichern</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let state = {
      projects: [],
      settings: {
        showMascot: true,
        mascotTitle: 'Dino-Wächter'
      },
      workspaceName: 'Workspace',
      searchQuery: '',
      filterFavorites: false,
      viewMode: 'table',
      isExplorerView: false,
      expandedDetailsFor: null,
      editingNameFor: null,
      editingDescFor: null,
      editingNotesFor: null,
      addingTagFor: null,
      selectingStatusFor: null
    };

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'stateUpdate') {
        state.projects = message.projects || [];
        state.settings = message.settings || state.settings;
        state.workspaceName = message.workspaceName || 'Workspace';
        state.isExplorerView = !!message.isExplorerView;
        render();
      }
    });

    const mascotBadge = document.getElementById('mascotBadge');
    mascotBadge.addEventListener('click', () => {
      showDinoDialogue(null);
    });

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function handleSearch(e) {
      state.searchQuery = (e.target.value || '').toLowerCase().trim();
      render();
    }

    function render() {
      const mascotBadgeEl = document.getElementById('mascotBadge');
      if (state.settings.showMascot) {
        mascotBadgeEl.style.display = 'inline-flex';
        document.getElementById('mascotText').innerText = state.settings.mascotTitle || 'Dino-Wächter';
      } else {
        mascotBadgeEl.style.display = 'none';
      }

      const totalCount = state.projects.length;
      const favCount = state.projects.filter(p => p.isFavorite).length;
      const activeCount = state.projects.filter(p => p.isActiveWorkspace).length;
      const container = document.getElementById('projectsContainer');
      const toolbarEl = document.querySelector('.toolbar');
      const headerBarEl = document.querySelector('.header-bar');

      // WENN SEITENLEISTEN-ANSICHT (Explorer): Nur das geöffnete Projekt mit Beschreibung & Notiz anzeigen!
      if (state.isExplorerView) {
        if (toolbarEl) toolbarEl.style.display = 'none';
        const activeProject = state.projects.find(p => p.isActiveWorkspace);

        if (!activeProject) {
          // Im Explorer wenn kein Projekt geöffnet ist: Redundante header-bar ausblenden für ein kompaktes Layout ohne Scrollen!
          if (headerBarEl) headerBarEl.style.display = 'none';
          container.innerHTML = \`
            <div class="empty-state" style="padding: 10px 8px; margin-top: 2px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 2px 4px;">
                <span style="font-size: 22px; line-height: 1;">🦖</span>
                <div style="text-align: left;">
                  <div style="font-size: 12.5px; font-weight: 700; color: var(--vscode-foreground); line-height: 1.2;">Kein Projekt geöffnet</div>
                  <div style="font-size: 10.5px; color: var(--text-muted);">\${totalCount} \${totalCount === 1 ? 'Projekt' : 'Projekte'} gespeichert</div>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px;">
                <button class="btn btn-primary" style="justify-content: center; padding: 7px 10px; font-weight: 600; font-size: 11.5px;" onclick="openFullDashboard()" title="Dino Dashboard in der Seitenleiste öffnen">
                  🦖 Dino Dashboard öffnen (\${totalCount}) ➔
                </button>
                <div style="display: flex; gap: 6px;">
                  <button class="btn" style="flex: 1; justify-content: center; padding: 5px 6px; font-size: 11px;" onclick="createNewProject()" title="Ein ganz neues Projekt anlegen: Ordnername und Speicherort wählen, direkt öffnen">
                    ✨ Neues Projekt
                  </button>
                  <button class="btn" style="flex: 1; justify-content: center; padding: 5px 6px; font-size: 11px;" onclick="addFolder()" title="Einen bestehenden Projektordner öffnen">
                    📁 Ordner öffnen
                  </button>
                </div>
              </div>
            </div>
          \`;
          return;
        }

        // Aktives geöffnetes Projekt in der Seitenleiste anzeigen
        if (headerBarEl) headerBarEl.style.display = 'flex';
        document.getElementById('workspaceName').innerText = '🦖 ' + activeProject.name;
        document.getElementById('projectCount').innerText = 'Geöffnetes Projekt im Workspace';

        const isEditingDesc = state.editingDescFor === activeProject.id;
        const isEditingNotes = state.editingNotesFor === activeProject.id;
        const isEditingName = state.editingNameFor === activeProject.id;
        const isSelectingStatus = state.selectingStatusFor === activeProject.id;

        const techTagsHtml = (activeProject.techStack || []).map(t => \`<span class="tag">\${escapeHtml(t)}</span>\`).join('');
        const customTagsHtml = (activeProject.customTags || []).map(t => \`
          <span class="tag custom-tag">
            \${escapeHtml(t)}
            <span class="tag-remove" title="Tag entfernen" onclick="removeTag('\${escapeHtml(activeProject.id)}', '\${escapeHtml(t)}')">×</span>
          </span>
        \`).join('');

        container.innerHTML = \`
          <div class="project-card active-card" style="margin-top: 4px;">
            <div class="card-header">
              <div class="card-header-top">
                <div class="card-title-area">
                  \${isEditingName ? \`
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <input type="text" class="inline-input" id="nameInput_\${escapeHtml(activeProject.id)}" value="\${escapeHtml(activeProject.name)}" onkeydown="handleNameKey(event, '\${escapeHtml(activeProject.id)}')">
                      <div style="display: flex; gap: 4px;">
                        <button class="btn btn-primary" onclick="saveName('\${escapeHtml(activeProject.id)}')">💾 Speichern</button>
                        <button class="btn" onclick="resetName('\${escapeHtml(activeProject.id)}')">Ordnername</button>
                        <button class="btn" onclick="toggleEditName('\${escapeHtml(activeProject.id)}')">✕</button>
                      </div>
                    </div>
                  \` : \`
                    <div class="project-name-row">
                      <button class="cell-fav-btn \${activeProject.isFavorite ? 'is-fav' : ''}" onclick="toggleFavorite('\${escapeHtml(activeProject.folderUri)}', '\${escapeHtml(activeProject.name)}')" title="\${activeProject.isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit mit Stern markieren'}">
                        \${activeProject.isFavorite ? '⭐' : '☆'}
                      </button>
                      <div class="project-name" onclick="showDinoDialogueById('\${escapeHtml(activeProject.id)}')" style="cursor: pointer;" title="Dino-Wächter nach diesem Projekt fragen">
                        <span>🦖</span>
                        <span>\${escapeHtml(activeProject.name)}</span>
                      </div>
                      <button class="icon-btn" onclick="toggleEditName('\${escapeHtml(activeProject.id)}')" title="Name ändern">✏️</button>
                    </div>
                  \`}
                  <div class="project-path" title="\${escapeHtml(activeProject.folderPath)}">
                    \${escapeHtml(activeProject.folderPath)}
                  </div>
                </div>
                <div class="badges-wrap" style="display: flex; gap: 4px; align-items: center;">
                  <span class="health-pill active-pill">🟢 Aktiv</span>
                  <button class="btn btn-danger" style="padding: 2px 7px; font-size: 10px;" onclick="closeFolder()" title="Geöffneten Ordner schließen und zum Start zurückkehren">
                    ✕ Schließen
                  </button>
                </div>
              </div>

              <!-- Status-Hinweis & Notiz Zeile -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; padding: 4px 6px; background: rgba(128,128,128,0.06); border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Status:</span>
                  <button class="status-hint-pill \${getStatusHintClass(activeProject.statusHint || '⚡ In Arbeit')}" onclick="toggleStatusPicker('\${escapeHtml(activeProject.id)}')" title="Status ändern (Klicken für Auswahl)">
                    \${escapeHtml(activeProject.statusHint || '⚡ In Arbeit')} ▾
                  </button>
                </div>
                <button class="btn" style="padding: 2px 7px; font-size: 10px;" onclick="openNoteModal('\${escapeHtml(activeProject.id)}')" title="Notiz im Fenster anzeigen / bearbeiten">
                  ℹ️ Notiz
                </button>
              </div>

              <!-- Dropdown für Status-Wahl -->
              \${isSelectingStatus ? \`
                <div class="status-picker-dropdown">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span style="font-size: 10px; font-weight: 700; color: var(--accent);">HINWEIS / STATUS WÄHLEN:</span>
                    <button class="icon-btn" onclick="toggleStatusPicker(null)">✕</button>
                  </div>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '⚡ In Arbeit')">⚡ In Arbeit</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '✅ Abgeschlossen')">✅ Abgeschlossen</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '⏳ Pausiert')">⏳ Pausiert</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '🐛 Bugfix')">🐛 Bugfix</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '✨ In Planung')">✨ In Planung</button>
                  <button class="status-opt-btn" style="color: var(--text-muted); border-top: 1px dashed var(--card-border); margin-top: 2px; padding-top: 4px;" onclick="applyStatusHint('\${escapeHtml(activeProject.folderUri)}', '')">🔄 Status entfernen</button>
                </div>
              \` : ''}
            </div>

            <div class="card-body">
              <!-- Beschreibung -->
              <div class="desc-box">
                <div class="desc-header">
                  <span>\${activeProject.customDescription ? '📝 Beschreibung (Angepasst)' : '🤖 Beschreibung (Automatisch)'}</span>
                  <button class="icon-btn" onclick="toggleEditDesc('\${escapeHtml(activeProject.id)}')">
                    \${isEditingDesc ? 'Schließen' : '✏️ Ändern'}
                  </button>
                </div>
                \${isEditingDesc ? \`
                  <div>
                    <textarea class="notes-textarea" id="descInput_\${escapeHtml(activeProject.id)}">\${escapeHtml(activeProject.description)}</textarea>
                    <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                      <button class="btn" onclick="resetDescription('\${escapeHtml(activeProject.id)}')">🔄 Auto-Erkennung</button>
                      <button class="btn btn-primary" onclick="saveDescription('\${escapeHtml(activeProject.id)}')">💾 Speichern</button>
                    </div>
                  </div>
                \` : \`
                  <div class="project-desc">\${escapeHtml(activeProject.description)}</div>
                \`}
              </div>

              <!-- Ausführliche Notizen (Mehr Text) -->
              <div class="notes-box">
                <div class="notes-header">
                  <span>📌 PROJEKT-NOTIZEN (LÄNGERER TEXT / TO-DOS)</span>
                  <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="toggleEditNotes('\${escapeHtml(activeProject.id)}')">
                    \${isEditingNotes ? 'Schließen' : (activeProject.customNotes ? '✏️ Bearbeiten' : '+ Notiz')}
                  </button>
                </div>
                \${isEditingNotes ? \`
                  <div>
                    <textarea class="notes-textarea" id="notesInput_\${escapeHtml(activeProject.id)}" rows="5" placeholder="Schreibe hier ausführliche Notizen zum Projekt (z. B. 'ist in arbeit, button noch verbuggt etc.')...">\${escapeHtml(activeProject.customNotes || '')}</textarea>
                    <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                      <button class="btn" onclick="toggleEditNotes('\${escapeHtml(activeProject.id)}')">✕ Abbrechen</button>
                      <button class="btn btn-primary" onclick="saveNotes('\${escapeHtml(activeProject.id)}')">💾 Notiz speichern</button>
                    </div>
                  </div>
                \` : \`
                  <div class="notes-content" style="white-space: pre-wrap; font-size: 11.5px; line-height: 1.45;">
                    \${activeProject.customNotes ? escapeHtml(activeProject.customNotes) : '<span style="color: var(--text-muted); font-style: italic;">Keine Notiz hinterlegt. Klicke auf „+ Notiz“, um ausführliche Informationen einzutragen.</span>'}
                  </div>
                \`}
              </div>

              <!-- Tech-Stack -->
              <div class="stack-tags">
                \${techTagsHtml}
                \${customTagsHtml}
                <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="toggleAddTag('\${escapeHtml(activeProject.id)}')">+ Tag</button>
              </div>

              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">Dateien</span>
                  <span class="stat-value">\${activeProject.stats.fileCount.toLocaleString('de-DE')}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Git-Branch</span>
                  <span class="stat-value">\${escapeHtml(activeProject.stats.gitBranch ? \`⎇ \${activeProject.stats.gitBranch}\` : 'Kein Git')}</span>
                </div>
              </div>

              <div class="action-row" style="flex-wrap: wrap; gap: 6px;">
                <button class="btn btn-primary" style="flex: 1; justify-content: center; font-weight: 600;" onclick="focusAntigravityPanel()" title="Antigravity-Chat fokussieren">
                  💬 Antigravity-Chat
                </button>
                <button class="btn" onclick="autoExpand()" title="Unterordner im Explorer ausklappen">
                  ⚡ Ausklappen
                </button>
                \${activeProject.hasReadme ? \`
                  <button class="btn" onclick="openReadme('\\\${escapeHtml(activeProject.readmeUri || '')}')">
                    📖 README
                  </button>
                \` : ''}
                <button class="btn btn-danger" onclick="closeFolder()" title="Geöffneten Ordner schließen und zum Start zurückkehren">
                  ❌ Projekt schließen
                </button>
              </div>
            </div>
          </div>

          <!-- Verlinkung zum vollständigen Dashboard -->
          <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--card-border);">
            <button class="btn" style="width: 100%; justify-content: center; padding: 7px 10px; font-weight: 600;" onclick="openFullDashboard()" title="Öffnet das vollständige Dino Dashboard mit allen Projekten">
              🦖 Alle \${totalCount} Projekte im Dino Dashboard öffnen ➔
            </button>
          </div>
        \`;
        return;
      }

      // STANDARD VOLL-DASHBOARD (Aktivitätsleiste / Dino-Icon)
      if (headerBarEl) headerBarEl.style.display = 'flex';
      if (toolbarEl) toolbarEl.style.display = 'flex';

      const favFilterBtn = document.getElementById('filterFavBtn');
      if (favFilterBtn) {
        if (state.filterFavorites) {
          favFilterBtn.classList.add('active');
        } else {
          favFilterBtn.classList.remove('active');
        }
      }

      const btnTable = document.getElementById('viewBtnTable');
      const btnCards = document.getElementById('viewBtnCards');
      if (btnTable && btnCards) {
        if (state.viewMode === 'table') {
          btnTable.classList.add('active');
          btnCards.classList.remove('active');
        } else {
          btnTable.classList.remove('active');
          btnCards.classList.add('active');
        }
      }

      const filtered = state.projects.filter(proj => {
        if (state.filterFavorites && !proj.isFavorite) return false;
        if (!state.searchQuery) return true;
        const hay = [
          proj.name,
          proj.folderName,
          proj.description,
          proj.folderPath,
          ...(proj.techStack || []),
          ...(proj.customTags || []),
          proj.customNotes || ''
        ].join(' ').toLowerCase();
        return hay.includes(state.searchQuery);
      });

      const favLabel = favCount > 0 ? (', ⭐ ' + favCount + (favCount === 1 ? ' Favorit' : ' Favoriten')) : '';
      document.getElementById('projectCount').innerText =
        totalCount === 0
          ? 'Keine Projekte gespeichert'
          : \`\${totalCount} \${totalCount === 1 ? 'Projekt' : 'Projekte'} (\${activeCount} aktiv\${favLabel})\`;

      if (filtered.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">\${state.filterFavorites ? '⭐' : '📁'}</div>
            <p>\${state.filterFavorites ? 'Noch keine Favoriten markiert.' : (totalCount === 0 ? 'Noch kein Projektordner vorhanden.' : 'Keine passenden Projekte gefunden.')}</p>
            <p style="font-size: 11px; margin-top: 6px;">
              \${state.filterFavorites
                ? 'Klicke bei einem Projekt auf den Stern <b>☆</b>, um es zu deinen Favoriten hinzuzufügen.'
                : 'Klicke oben auf <b>„📁 Ordner hinzufügen / öffnen“</b> oder <b>„🔍 Ordner scannen“</b>, um deine Projekte hinzuzufügen.'}
            </p>
          </div>
        \`;
        return;
      }

      // 1. STANDARD: KOMPAKTE TABELLEN-ANSICHT (Name & Schnell-Aktionen, Klick klappt Details aus)
      if (state.viewMode === 'table') {
        container.innerHTML = \`
          <div class="projects-table-wrap">
            \${filtered.map(proj => {
              const isExpanded = state.expandedDetailsFor === proj.id;
              const isEditingName = state.editingNameFor === proj.id;
              const isEditingNotes = state.editingNotesFor === proj.id;
              const isSelectingStatus = state.selectingStatusFor === proj.id;
              const folderDiffHint = (proj.customName && proj.customName !== proj.folderName)
                ? \` (Ordner: \${escapeHtml(proj.folderName)})\`
                : '';

              return \`
                <div class="table-row-item \${proj.isActiveWorkspace ? 'active-item' : ''} \${proj.isFavorite ? 'favorite-item' : ''}" data-id="\${escapeHtml(proj.id)}">
                  <div class="table-main-row" onclick="toggleRowDetails('\${escapeHtml(proj.id)}')">
                    <!-- Ausklapp-Pfeil -->
                    <span class="tbl-chevron" title="\${isExpanded ? 'Details einklappen' : 'Details ausklappen'}">
                      \${isExpanded ? '▼' : '▶'}
                    </span>

                    <!-- Stern Favorit -->
                    <button class="cell-fav-btn \${proj.isFavorite ? 'is-fav' : ''}" onclick="event.stopPropagation(); toggleFavorite('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="\${proj.isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit mit Stern markieren'}">
                      \${proj.isFavorite ? '⭐' : '☆'}
                    </button>

                    <!-- Paket-Icon entfernt für volle Breite des Projektnamens -->

                    <!-- Name & Pfad & Status & Notizen -->
                    <div class="cell-content">
                      \${isEditingName ? \`
                        <div style="display: flex; gap: 4px; align-items: center;" onclick="event.stopPropagation();">
                          <input type="text" class="inline-input" id="nameInput_\${escapeHtml(proj.id)}" value="\${escapeHtml(proj.name)}" onkeydown="handleNameKey(event, '\${escapeHtml(proj.id)}')">
                          <button class="tbl-btn tbl-btn-launch" onclick="saveName('\${escapeHtml(proj.id)}')">Speichern</button>
                          <button class="tbl-btn" onclick="resetName('\${escapeHtml(proj.id)}')">Ordnername</button>
                          <button class="tbl-btn" onclick="toggleEditName('\${escapeHtml(proj.id)}')">✕</button>
                        </div>
                      \` : \`
                        <div class="cell-title-line">
                          \${proj.isActiveWorkspace ? '<span style="font-size: 13px; line-height: 1;">🦖</span>' : ''}
                          <span class="cell-title-text" title="\${escapeHtml(proj.name)} (Klicken für Details)">\${escapeHtml(proj.name)}</span>
                          <button class="icon-btn" onclick="event.stopPropagation(); toggleEditName('\${escapeHtml(proj.id)}')" title="Name umbenennen">✏️</button>
                          \${proj.isActiveWorkspace ? '<span class="mini-pill active-pill">🟢 Aktiv</span>' : ''}
                        </div>

                        <div class="cell-sub-line">
                          <!-- Status-Button: In Zeile 2 neben Pfad, damit Projektname oben volle Breite hat! -->
                          <button class="status-hint-pill \${getStatusHintClass(proj.statusHint || (proj.isActiveWorkspace ? '⚡ In Arbeit' : '🟢 Bereit'))}" onclick="event.stopPropagation(); toggleStatusPicker('\${escapeHtml(proj.id)}')" title="Status ändern (Klicken für Auswahl)">
                            \${escapeHtml(proj.statusHint || (proj.isActiveWorkspace ? '⚡ In Arbeit' : '🟢 Bereit'))} ▾
                          </button>
                          <span class="cell-path-text" title="\${escapeHtml(proj.folderPath)}">\${escapeHtml(proj.folderPath)}\${folderDiffHint}</span>
                        </div>
                      \`}

                      <!-- Status-Picker Dropdown inline in Zeile -->
                      \${isSelectingStatus ? \`
                        <div class="status-picker-dropdown" onclick="event.stopPropagation();">
                          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                            <span style="font-size: 10px; font-weight: 700; color: var(--accent);">HINWEIS / STATUS WÄHLEN:</span>
                            <button class="icon-btn" onclick="toggleStatusPicker(null)">✕</button>
                          </div>
                          <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '⚡ In Arbeit')">⚡ In Arbeit</button>
                          <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '✅ Abgeschlossen')">✅ Abgeschlossen</button>
                          <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '⏳ Pausiert')">⏳ Pausiert</button>
                          <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '🐛 Bugfix')">🐛 Bugfix</button>
                          <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '✨ In Planung')">✨ In Planung</button>
                          <button class="status-opt-btn" style="color: var(--text-muted); border-top: 1px dashed var(--card-border); margin-top: 2px; padding-top: 4px;" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '')">🔄 Status entfernen</button>
                        </div>
                      \` : ''}
                    </div>

                    <!-- Schnell-Aktionen (Rechts) -->
                    <div class="cell-quick-actions" onclick="event.stopPropagation();">
                      \${proj.isActiveWorkspace ? \`
                        <button class="tbl-btn tbl-btn-active" onclick="focusAntigravityPanel()" title="Projekt ist aktiv! Zum Antigravity-Chat wechseln">
                          🦖 Aktiv
                        </button>
                        <button class="tbl-btn tbl-btn-delete" onclick="event.stopPropagation(); closeFolder();" title="Projekt bzw. Ordner schließen (zurück zum Start)">
                          ✕ Schließen
                        </button>
                      \` : \`
                        <button class="tbl-btn tbl-btn-launch" onclick="openInAntigravity('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="Projekt in Antigravity laden & weiterarbeiten">
                          🚀 Öffnen
                        </button>
                      \`}
                      <button class="tbl-btn" onclick="event.stopPropagation(); openNoteModal('\${escapeHtml(proj.id)}')" title="Projekt-Notiz im Fenster anzeigen & bearbeiten">
                        ℹ️
                      </button>
                      <button class="tbl-btn tbl-btn-delete" onclick="removeProject('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="Projekt aus dem Dino Dashboard entfernen">
                        🗑️
                      </button>
                    </div>
                  </div>

                  <!-- Inline Details (wenn ausgeklappt) -->
                  \${isExpanded ? \`
                    <div class="table-inline-details">
                      <!-- Ausführliche Notizen (Mehr Text) -->
                      <div class="notes-box">
                        <div class="notes-header">
                          <div style="display: flex; align-items: center; gap: 6px;">
                            <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="showDinoDialogueById('\${escapeHtml(proj.id)}')">🦖 Dino-Wächter</button>
                            <span>📌 PROJEKT-NOTIZEN (LÄNGERER TEXT)</span>
                          </div>
                          <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="toggleEditNotes('\${escapeHtml(proj.id)}')">
                            \${isEditingNotes ? 'Schließen' : (proj.customNotes ? '✏️ Bearbeiten' : '+ Notiz')}
                          </button>
                        </div>
                        \${isEditingNotes ? \`
                          <div>
                            <textarea class="notes-textarea" id="notesInput_\${escapeHtml(proj.id)}" rows="4" placeholder="Ausführliche Notiz zum Projekt eintragen... Primo: ist in arbeit, button noch verbuggt... ">\${escapeHtml(proj.customNotes || '')}</textarea>
                            <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                              <button class="btn" onclick="toggleEditNotes('\${escapeHtml(proj.id)}')">✕ Abbrechen</button>
                              <button class="btn btn-primary" onclick="saveNotes('\${escapeHtml(proj.id)}')">💾 Notiz speichern</button>
                            </div>
                          </div>
                        \` : \`
                          <div class="notes-content" style="white-space: pre-wrap; font-size: 11.5px; line-height: 1.45;">
                            \${proj.customNotes ? escapeHtml(proj.customNotes) : '<span style="color: var(--text-muted); font-style: italic;">Keine Notiz hinterlegt. Klicke auf „+ Notiz“, um ausführliche Informationen einzutragen.</span>'}
                          </div>
                        \`}
                      </div>

                      <div style="font-size: 11px; line-height: 1.4; color: var(--vscode-foreground);">
                        <b>Beschreibung:</b> \${escapeHtml(proj.description)}
                      </div>
                      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        \${(proj.techStack || []).map(t => \`<span class="tag">\${escapeHtml(t)}</span>\`).join('')}
                        \${(proj.customTags || []).map(t => \`<span class="tag custom-tag">\${escapeHtml(t)}</span>\`).join('')}
                      </div>
                      <div style="font-size: 10.5px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                        <span>Dateien: \${proj.stats.fileCount}</span>
                        <span>Branch: \${escapeHtml(proj.stats.gitBranch || 'Kein Git')}</span>
                        <span>\${escapeHtml(proj.stats.lastCommit || '')}</span>
                      </div>
                      <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px;">
                        \${!proj.isActiveWorkspace ? \`
                          <button class="tbl-btn tbl-btn-launch" onclick="openInAntigravity('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')">🚀 In Antigravity laden</button>
                          <button class="tbl-btn" onclick="addToCurrentWorkspace('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')">➕ Dazu laden</button>
                        \` : ''}
                        <button class="tbl-btn" onclick="revealInExplorer('\${escapeHtml(proj.folderUri)}')">📂 Explorer</button>
                        <button class="tbl-btn" onclick="openFolderNewWindow('\${escapeHtml(proj.folderUri)}')">↗ Neues Fenster</button>
                        \${proj.hasReadme ? \`<button class="tbl-btn" onclick="openReadme('\${escapeHtml(proj.readmeUri || '')}')">📖 README</button>\` : ''}
                      </div>
                    </div>
                  \` : ''}
                </div>
              \`;
            }).join('')}
          </div>
        \`;
        return;
      }

      // 2. KARTEN-ANSICHT
      container.innerHTML = filtered.map(proj => {
        const healthClass = \`health-\${proj.health.status}\`;
        const isEditingName = state.editingNameFor === proj.id;
        const isEditingDesc = state.editingDescFor === proj.id;
        const isEditingNotes = state.editingNotesFor === proj.id;
        const isAddingTag = state.addingTagFor === proj.id;
        const isSelectingStatus = state.selectingStatusFor === proj.id;

        const techTagsHtml = (proj.techStack || []).map(t => \`<span class="tag">\${escapeHtml(t)}</span>\`).join('');
        const customTagsHtml = (proj.customTags || []).map(t => \`
          <span class="tag custom-tag">
            \${escapeHtml(t)}
            <span class="tag-remove" title="Tag entfernen" onclick="removeTag('\${escapeHtml(proj.id)}', '\${escapeHtml(t)}')">×</span>
          </span>
        \`).join('');

        const keyDirsHtml = (proj.keyDirectories || []).length > 0
          ? \`<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              Unterordner: \${proj.keyDirectories.map(d => \`<code>\${escapeHtml(d)}</code>\`).join(', ')}
             </div>\`
          : '';

        const folderDiffHint = (proj.customName && proj.customName !== proj.folderName)
          ? \` <span style="opacity:0.75;">(Ordner: \${escapeHtml(proj.folderName)})</span>\`
          : '';

        return \`
          <div class="project-card \${proj.isActiveWorkspace ? 'active-card' : ''} \${proj.isFavorite ? 'favorite-card' : ''}" data-id="\${escapeHtml(proj.id)}">
            <div class="card-header">
              <div class="card-header-top">
                <div class="card-title-area">
                  \${isEditingName ? \`
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <input type="text" class="inline-input" id="nameInput_\${escapeHtml(proj.id)}" value="\${escapeHtml(proj.name)}" placeholder="Projektname (leer = Ordnername)" onkeydown="handleNameKey(event, '\${escapeHtml(proj.id)}')">
                      <div style="display: flex; gap: 4px;">
                        <button class="btn btn-primary" onclick="saveName('\${escapeHtml(proj.id)}')">💾 Speichern</button>
                        <button class="btn" onclick="resetName('\${escapeHtml(proj.id)}')" title="Wieder den Ordnernamen verwenden">🔄 Ordnername</button>
                        <button class="btn" onclick="toggleEditName('\${escapeHtml(proj.id)}')">Abbrechen</button>
                      </div>
                    </div>
                  \` : \`
                    <div class="project-name-row">
                      <button class="fav-star-btn \${proj.isFavorite ? 'is-fav' : ''}" onclick="toggleFavorite('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="\${proj.isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit mit Stern markieren'}">
                        \${proj.isFavorite ? '⭐' : '☆'}
                      </button>
                      <div class="project-name" onclick="showDinoDialogueById('\${escapeHtml(proj.id)}')" style="cursor: pointer;" title="Dino-Wächter nach diesem Projekt fragen">
                        \${proj.isActiveWorkspace ? '<span>🦖</span>' : ''}
                        <span>\${escapeHtml(proj.name)}</span>
                      </div>
                      <button class="icon-btn" title="Projektnamen ändern (aktuell: \${escapeHtml(proj.name)})" onclick="toggleEditName('\${escapeHtml(proj.id)}')">
                        ✏️ Name
                      </button>
                    </div>
                  \`}
                  <div class="project-path" title="\${escapeHtml(proj.folderPath)}">
                    \${escapeHtml(proj.folderPath)}\${folderDiffHint}
                  </div>
                </div>

                <div class="badges-wrap">
                  \${proj.isFavorite ? \`
                    <span class="health-pill fav-pill" title="Dieses Projekt ist als Favorit markiert">
                      ⭐ Favorit
                    </span>
                  \` : ''}
                  \${proj.isActiveWorkspace ? \`
                    <span class="health-pill active-pill" title="Dieses Projekt ist aktuell in Antigravity geladen">
                      🟢 Aktiv
                    </span>
                  \` : ''}
                  <button class="status-hint-pill \${getStatusHintClass(proj.statusHint || (proj.isActiveWorkspace ? '⚡ In Arbeit' : '🟢 Bereit'))}" onclick="toggleStatusPicker('\${escapeHtml(proj.id)}')" title="Status ändern (Klicken für Auswahl: In Arbeit, Abgeschlossen...)">
                    \${escapeHtml(proj.statusHint || (proj.isActiveWorkspace ? '⚡ In Arbeit' : '🟢 Bereit'))} ▾
                  </button>
                  <button class="btn" style="padding: 2px 7px; font-size: 10px;" onclick="openNoteModal('\${escapeHtml(proj.id)}')" title="Notiz im Fenster anzeigen / bearbeiten">
                    ℹ️ Notiz
                  </button>
                  <span class="health-pill \${healthClass}" title="\${escapeHtml(proj.health.message)}">
                    \${escapeHtml(proj.health.badge)}
                  </span>
                </div>
              </div>

              <!-- Status Dropdown (wenn i-Button geklickt) -->
              \${isSelectingStatus ? \`
                <div class="status-picker-dropdown">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span style="font-size: 10px; font-weight: 700; color: var(--accent);">HINWEIS / STATUS WÄHLEN:</span>
                    <button class="icon-btn" onclick="toggleStatusPicker(null)">✕</button>
                  </div>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '⚡ In Arbeit')">⚡ In Arbeit</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '✅ Abgeschlossen')">✅ Abgeschlossen</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '⏳ Pausiert')">⏳ Pausiert</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '🐛 Bugfix')">🐛 Bugfix</button>
                  <button class="status-opt-btn" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '✨ In Planung')">✨ In Planung</button>
                  <button class="status-opt-btn" style="color: var(--text-muted); border-top: 1px dashed var(--card-border); margin-top: 2px; padding-top: 4px;" onclick="applyStatusHint('\${escapeHtml(proj.folderUri)}', '')">🔄 Status entfernen</button>
                </div>
              \` : ''}

              <!-- Primärer Antigravity-Ladebutton -->
              <div class="antigravity-launch-row">
                \${proj.isActiveWorkspace ? \`
                  <div style="display: flex; gap: 6px;">
                    <button class="btn-launch btn-launch-active" style="flex: 1;" onclick="focusAntigravityPanel()" title="Projekt ist geladen! Klicke, um direkt zum Antigravity-Chat zu wechseln">
                      🦖 Aktiv in Antigravity – Weiterarbeiten
                    </button>
                    <button class="btn btn-danger" style="padding: 6px 12px; font-weight: 600;" onclick="closeFolder()" title="Projekt bzw. Ordner schließen (zurück zum Start)">
                      ✕ Schließen
                    </button>
                  </div>
                \` : \`
                  <button class="btn-launch" onclick="openInAntigravity('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="Lädt dieses Projekt sofort in Antigravity, ohne dass du den Ordner manuell öffnen musst">
                    🚀 Projekt in Antigravity laden & arbeiten
                  </button>
                  <button class="btn" onclick="addToCurrentWorkspace('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')" title="Fügt diesen Projektordner zusätzlich zum aktuellen Workspace hinzu (ohne Fenster-Neuladen)">
                    ➕ Dazu laden
                  </button>
                \`}
              </div>
            </div>

            <div class="card-body">
              <!-- Projektbeschreibung (Automatisch erkannt oder bearbeitet) -->
              <div class="desc-box">
                <div class="desc-header">
                  <span>\${proj.customDescription ? '📝 Beschreibung (Angepasst)' : '🤖 Beschreibung (Automatisch erkannt)'}</span>
                  <button class="icon-btn" onclick="toggleEditDesc('\${escapeHtml(proj.id)}')">
                    \${isEditingDesc ? 'Schließen' : '✏️ Ändern'}
                  </button>
                </div>
                \${isEditingDesc ? \`
                  <div>
                    <textarea class="notes-textarea" id="descInput_\${escapeHtml(proj.id)}" placeholder="Eigene Projektbeschreibung eingeben...">\${escapeHtml(proj.description)}</textarea>
                    <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                      <button class="btn" onclick="resetDescription('\${escapeHtml(proj.id)}')" title="Beschreibung wieder automatisch aus README/Inhalt erkennen">🔄 Automatisch erkennen</button>
                      <button class="btn btn-primary" onclick="saveDescription('\${escapeHtml(proj.id)}')">💾 Speichern</button>
                    </div>
                  </div>
                \` : \`
                  <div class="project-desc">\${escapeHtml(proj.description)}</div>
                \`}
              </div>

              <!-- Tech-Stack & Tags -->
              <div class="stack-tags">
                \${techTagsHtml}
                \${customTagsHtml}
                <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="toggleAddTag('\${escapeHtml(proj.id)}')">
                  + Tag
                </button>
              </div>

              <!-- Tag hinzufügen -->
              <div class="tag-input-row" id="tagInputRow_\${escapeHtml(proj.id)}" style="display: \${isAddingTag ? 'flex' : 'none'};">
                <input type="text" class="tag-input" id="tagInput_\${escapeHtml(proj.id)}" placeholder="z. B. Spiel, Wichtig, v2" onkeydown="handleTagKey(event, '\${escapeHtml(proj.id)}')">
                <button class="btn btn-primary" onclick="submitTag('\${escapeHtml(proj.id)}')">OK</button>
                <button class="btn" onclick="toggleAddTag('\${escapeHtml(proj.id)}')">✕</button>
              </div>

              <!-- Statistik-Grid -->
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">Dateien</span>
                  <span class="stat-value">\${proj.stats.fileCount.toLocaleString('de-DE')}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Git-Branch</span>
                  <span class="stat-value" title="\${escapeHtml(proj.stats.gitBranch || 'Kein Git')}">
                    \${escapeHtml(proj.stats.gitBranch ? \`⎇ \${proj.stats.gitBranch}\` : 'Kein Git')}
                  </span>
                </div>
                <div class="stat-item" style="grid-column: span 2;">
                  <span class="stat-label">Letzter Commit</span>
                  <span class="stat-value" title="\${escapeHtml(proj.stats.lastCommit || 'Keine Commits')}">
                    \${escapeHtml(proj.stats.lastCommit || 'Keine Commits erkannt')} \${proj.stats.lastCommitDate ? \`(\${escapeHtml(proj.stats.lastCommitDate)})\` : ''}
                  </span>
                </div>
              </div>

              \${keyDirsHtml}

              <div class="health-details">
                \${proj.health.details.map(d => \`<div>\${escapeHtml(d)}</div>\`).join('')}
              </div>

              <!-- Eigene Notizen (Ausführlicher Text) -->
              <div class="notes-box">
                <div class="notes-header">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="showDinoDialogueById('\${escapeHtml(proj.id)}')">🦖 Dino-Wächter</button>
                    <span>📌 PROJEKT-NOTIZEN (LÄNGERER TEXT)</span>
                  </div>
                  <button class="btn" style="padding: 1px 6px; font-size: 10px;" onclick="toggleEditNotes('\${escapeHtml(proj.id)}')">
                    \${isEditingNotes ? 'Schließen' : (proj.customNotes ? '✏️ Bearbeiten' : '+ Notiz')}
                  </button>
                </div>
                \${isEditingNotes ? \`
                  <div>
                    <textarea class="notes-textarea" id="notesInput_\${escapeHtml(proj.id)}" rows="4" placeholder="Ausführliche Notiz oder To-Dos zum Projekt eintragen...">\${escapeHtml(proj.customNotes || '')}</textarea>
                    <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                      <button class="btn" onclick="toggleEditNotes('\${escapeHtml(proj.id)}')">✕ Abbrechen</button>
                      <button class="btn btn-primary" onclick="saveNotes('\${escapeHtml(proj.id)}')">💾 Notiz speichern</button>
                    </div>
                  </div>
                \` : \`
                  <div class="notes-content" style="white-space: pre-wrap; font-size: 11.5px; line-height: 1.45;">
                    \${proj.customNotes ? escapeHtml(proj.customNotes) : '<span style="color: var(--text-muted); font-style: italic;">Keine Notizen. Klicke auf „+ Notiz“, um ausführliche Informationen einzutragen.</span>'}
                  </div>
                \`}
              </div>

              <!-- Weitere Aktionen -->
              <div class="action-row">
                <button class="btn" title="Im Explorer zeigen" onclick="revealInExplorer('\${escapeHtml(proj.folderUri)}')">
                  📂 Explorer
                </button>
                \${proj.hasReadme ? \`
                  <button class="btn" title="README-Datei öffnen" onclick="openReadme('\${escapeHtml(proj.readmeUri || '')}')">
                    📖 README
                  </button>
                \` : ''}
                <button class="btn" title="In einem neuen Fenster öffnen" onclick="openFolderNewWindow('\${escapeHtml(proj.folderUri)}')">
                  ↗ Neues Fenster
                </button>
                \${proj.isActiveWorkspace ? \`
                  <button class="btn" title="Wichtige Unterordner im Explorer ausklappen" onclick="autoExpand()">
                    ⚡ Ausklappen
                  </button>
                \` : \`
                  <button class="btn btn-danger" title="Aus der Dashboard-Liste entfernen (löscht keine Dateien)" onclick="removeProject('\${escapeHtml(proj.folderUri)}', '\${escapeHtml(proj.name)}')">
                    🗑️ Entfernen
                  </button>
                \`}
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Aktionen an Extension senden
    function closeFolder() {
      vscode.postMessage({ command: 'closeFolder' });
    }

    function openFullDashboard() {
      vscode.postMessage({ command: 'openFullDashboard' });
    }

    function setViewMode(mode) {
      state.viewMode = mode;
      render();
    }

    function toggleRowDetails(id) {
      state.expandedDetailsFor = state.expandedDetailsFor === id ? null : id;
      render();
    }

    function toggleFavorite(uri, name) {
      vscode.postMessage({ command: 'toggleFavorite', uri, name });
    }

    function toggleFilterFavorites() {
      state.filterFavorites = !state.filterFavorites;
      render();
    }

    function addFolder() {
      vscode.postMessage({ command: 'addFolder' });
    }

    function createNewProject() {
      vscode.postMessage({ command: 'createNewProject' });
    }

    function scanParentFolder() {
      vscode.postMessage({ command: 'scanParentFolder' });
    }

    function openInAntigravity(uri, name) {
      vscode.postMessage({ command: 'openInAntigravity', uri, name });
    }

    function addToCurrentWorkspace(uri, name) {
      vscode.postMessage({ command: 'addToCurrentWorkspace', uri, name });
    }

    function focusAntigravityPanel() {
      vscode.postMessage({ command: 'focusAntigravityPanel' });
    }

    function removeProject(uri, name) {
      vscode.postMessage({ command: 'removeProject', uri, name });
    }

    function revealInExplorer(uri) {
      vscode.postMessage({ command: 'revealInExplorer', uri });
    }

    function openReadme(uri) {
      vscode.postMessage({ command: 'openReadme', uri });
    }

    function openFolderNewWindow(uri) {
      vscode.postMessage({ command: 'openFolderNewWindow', uri });
    }

    function autoExpand() {
      vscode.postMessage({ command: 'autoExpand' });
    }

    // Name bearbeiten
    function toggleEditName(projId) {
      state.editingNameFor = state.editingNameFor === projId ? null : projId;
      render();
      if (state.editingNameFor === projId) {
        setTimeout(() => {
          const el = document.getElementById(\`nameInput_\${projId}\`);
          if (el) { el.focus(); el.select(); }
        }, 40);
      }
    }

    function handleNameKey(event, projId) {
      if (event.key === 'Enter') {
        saveName(projId);
      } else if (event.key === 'Escape') {
        toggleEditName(projId);
      }
    }

    function saveName(projId) {
      const input = document.getElementById(\`nameInput_\${projId}\`);
      if (input) {
        vscode.postMessage({
          command: 'saveName',
          uri: projId,
          customName: input.value.trim()
        });
        state.editingNameFor = null;
      }
    }

    function resetName(projId) {
      vscode.postMessage({
        command: 'saveName',
        uri: projId,
        customName: ''
      });
      state.editingNameFor = null;
    }

    // Beschreibung bearbeiten
    function toggleEditDesc(projId) {
      state.editingDescFor = state.editingDescFor === projId ? null : projId;
      render();
      if (state.editingDescFor === projId) {
        setTimeout(() => {
          const el = document.getElementById(\`descInput_\${projId}\`);
          if (el) el.focus();
        }, 40);
      }
    }

    function saveDescription(projId) {
      const textarea = document.getElementById(\`descInput_\${projId}\`);
      if (textarea) {
        vscode.postMessage({
          command: 'saveDescription',
          uri: projId,
          customDescription: textarea.value.trim()
        });
        state.editingDescFor = null;
      }
    }

    function resetDescription(projId) {
      vscode.postMessage({
        command: 'saveDescription',
        uri: projId,
        customDescription: ''
      });
      state.editingDescFor = null;
    }

    // Notizen bearbeiten
    function toggleEditNotes(projId) {
      state.editingNotesFor = state.editingNotesFor === projId ? null : projId;
      render();
      if (state.editingNotesFor === projId) {
        setTimeout(() => {
          const el = document.getElementById(\`quickNoteInput_\${projId}\`) || document.getElementById(\`notesInput_\${projId}\`);
          if (el) { el.focus(); el.select(); }
        }, 40);
      }
    }

    function handleNoteKey(event, projId) {
      if (event.key === 'Enter') {
        saveQuickNote(projId);
      } else if (event.key === 'Escape') {
        toggleEditNotes(projId);
      }
    }

    function saveQuickNote(projId) {
      const input = document.getElementById(\`quickNoteInput_\${projId}\`);
      if (input) {
        vscode.postMessage({
          command: 'saveNotes',
          uri: projId,
          notes: input.value.trim()
        });
        state.editingNotesFor = null;
      }
    }

    function setQuickNote(projId, text) {
      const input = document.getElementById(\`quickNoteInput_\${projId}\`) || document.getElementById(\`notesInput_\${projId}\`);
      if (input) {
        input.value = text;
        input.focus();
      }
    }

    function saveNotes(projId) {
      const textarea = document.getElementById(\`notesInput_\${projId}\`);
      if (textarea) {
        vscode.postMessage({
          command: 'saveNotes',
          uri: projId,
          notes: textarea.value
        });
        state.editingNotesFor = null;
      }
    }

    // Tags verwalten
    function toggleAddTag(projId) {
      state.addingTagFor = state.addingTagFor === projId ? null : projId;
      render();
      if (state.addingTagFor === projId) {
        setTimeout(() => {
          const el = document.getElementById(\`tagInput_\${projId}\`);
          if (el) el.focus();
        }, 50);
      }
    }

    function handleTagKey(event, projId) {
      if (event.key === 'Enter') {
        submitTag(projId);
      } else if (event.key === 'Escape') {
        toggleAddTag(projId);
      }
    }

    function submitTag(projId) {
      const input = document.getElementById(\`tagInput_\${projId}\`);
      if (input && input.value.trim()) {
        vscode.postMessage({
          command: 'addTag',
          uri: projId,
          tag: input.value.trim()
        });
        state.addingTagFor = null;
      }
    }

    function removeTag(projId, tag) {
      vscode.postMessage({
        command: 'removeTag',
        uri: projId,
        tag
      });
    }

    // Status-Hinweis Picker & Dino-Wächter Dialog
    function toggleStatusPicker(projId) {
      state.selectingStatusFor = state.selectingStatusFor === projId ? null : projId;
      render();
    }

    function applyStatusHint(uri, hint) {
      vscode.postMessage({
        command: 'setStatusHint',
        uri,
        statusHint: hint
      });
      state.selectingStatusFor = null;
    }

    function getStatusHintClass(hint) {
      if (!hint) return '';
      const lower = hint.toLowerCase();
      if (lower.includes('arbeit')) return 'status-hint-in-arbeit';
      if (lower.includes('abgeschloss') || lower.includes('fertig')) return 'status-hint-abgeschlossen';
      if (lower.includes('pause') || lower.includes('pausiert')) return 'status-hint-pausiert';
      if (lower.includes('bug')) return 'status-hint-bugfix';
      if (lower.includes('plan')) return 'status-hint-planung';
      return 'status-hint-in-arbeit';
    }

    function showDinoDialogueById(projId) {
      const proj = state.projects.find(p => p.id === projId);
      showDinoDialogue(proj);
    }

    function showDinoDialogue(proj) {
      if (!proj) {
        proj = state.projects.find(p => p.isActiveWorkspace);
      }

      const backdrop = document.getElementById('dinoDialogueBackdrop');
      const nameEl = document.getElementById('dialogueProjectName');
      const speechEl = document.getElementById('dialogueSpeechText');
      if (!backdrop || !nameEl || !speechEl) return;

      if (proj) {
        nameEl.innerText = '🦖 Statusbericht: ' + proj.name;
        const statusText = proj.statusHint || (proj.isActiveWorkspace ? '⚡ In Arbeit (Aktiv)' : '🟢 Bereit');
        const notesText = proj.customNotes
          ? \`<div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed var(--card-border);"><b>📝 Notiz:</b><br><div style="white-space: pre-wrap; margin-top: 4px; color: var(--vscode-foreground);">\${escapeHtml(proj.customNotes)}</div></div>\`
          : \`<div style="margin-top: 8px; font-size: 11px; color: var(--text-muted); font-style: italic;">Noch keine Notiz hinterlegt. Klicke auf „ℹ️“, um eine Notiz einzutragen!</div>\`;

        speechEl.innerHTML = \`
          <div style="font-size: 13px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">
            🦖 „Rawr! Ich bewache „\${escapeHtml(proj.name)}“!“
          </div>
          <div style="font-size: 12px; margin-top: 5px;">
            <b>Aktueller Status:</b> <span class="status-hint-pill \${getStatusHintClass(statusText)}" style="margin-left: 4px;">\${escapeHtml(statusText)}</span>
          </div>
          \${notesText}
        \`;
      } else {
        nameEl.innerText = '🦖 Dino-Wächter sagt Hallo!';
        speechEl.innerHTML = \`
          <div style="font-size: 14px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">
            🦖 „Hallo! Schön, dass du da bist!“
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: var(--vscode-foreground);">
            Ich passe gut auf alle deine Projekte auf und wünsche dir einen wunderschönen, produktiven Tag!<br><br>
            Wähle einfach ein Projekt aus deiner Liste aus oder erstelle mit <b>„✨ Neues Projekt“</b> ein neues – ich bin jederzeit für dich da!
          </div>
        \`;
      }

      backdrop.style.display = 'flex';
    }

    function closeDinoDialogue(event) {
      if (event && event.target && event.target.id !== 'dinoDialogueBackdrop' && !event.target.classList.contains('icon-btn') && !event.target.classList.contains('btn')) {
        return;
      }
      const backdrop = document.getElementById('dinoDialogueBackdrop');
      if (backdrop) backdrop.style.display = 'none';
    }

    // Notiz-Fenster (Modal bei Klick auf i-Button)
    let currentNoteProjectId = null;

    function openNoteModal(projId) {
      currentNoteProjectId = projId;
      const proj = state.projects.find(p => p.id === projId);
      if (!proj) return;
      const backdrop = document.getElementById('projectNoteBackdrop');
      const titleEl = document.getElementById('noteModalTitle');
      const subEl = document.getElementById('noteModalSubtitle');
      const textarea = document.getElementById('noteModalTextarea');
      if (titleEl) titleEl.innerText = '📌 Notiz: ' + proj.name;
      if (subEl) subEl.innerText = proj.folderPath || '';
      if (textarea) textarea.value = proj.customNotes || '';
      if (backdrop) backdrop.style.display = 'flex';
      setTimeout(() => { if (textarea) textarea.focus(); }, 50);
    }

    function closeNoteModal(event) {
      if (event && event.target && event.target.id !== 'projectNoteBackdrop' && !event.target.classList.contains('icon-btn') && !event.target.classList.contains('btn')) {
        return;
      }
      const backdrop = document.getElementById('projectNoteBackdrop');
      if (backdrop) backdrop.style.display = 'none';
      currentNoteProjectId = null;
    }

    function saveNoteFromModal() {
      if (!currentNoteProjectId) return;
      const textarea = document.getElementById('noteModalTextarea');
      const notes = textarea ? textarea.value : '';
      vscode.postMessage({
        command: 'saveNotes',
        uri: currentNoteProjectId,
        notes: notes
      });
      closeNoteModal();
    }

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
    }
}

