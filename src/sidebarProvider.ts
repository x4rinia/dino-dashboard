import * as vscode from 'vscode';
import * as path from 'path';
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
                case 'removeProject': {
                    if (message.uri) {
                        await this.scanner.removeProjectFolder(message.uri);
                        vscode.window.showInformationMessage('Projekt aus dem Dino Dashboard entfernt (Dateien bleiben erhalten).');
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
        const payload = {
            type: 'stateUpdate',
            projects,
            settings,
            workspaceName: vscode.workspace.name || 'Workspace'
        };
        for (const view of this._views) {
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

    .btn-danger:hover {
      background: rgba(248, 81, 73, 0.25);
      color: #f85149;
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

  <!-- Werkzeugleiste: Ordner öffnen, Überordner scannen, Suchen & Favoriten-Filter -->
  <div class="toolbar">
    <div class="toolbar-buttons">
      <button class="btn btn-primary" style="flex: 1; justify-content: center; padding: 6px 8px; font-weight: 600;" onclick="addFolder()" title="Einen oder mehrere Projektordner auswählen und im Dashboard speichern">
        📁 Ordner hinzufügen / öffnen
      </button>
      <button class="btn" style="padding: 6px 8px;" onclick="scanParentFolder()" title="Einen Hauptordner nach allen Projekten durchsuchen">
        🔍 Ordner scannen
      </button>
    </div>
    <div style="display: flex; gap: 5px; align-items: center;">
      <input type="text" class="search-input" id="searchInput" placeholder="🔎 Suchen..." oninput="handleSearch(event)">
      <button class="filter-fav-btn" id="filterFavBtn" onclick="toggleFilterFavorites()" title="Nur mit Stern markierte Favoriten anzeigen">
        ⭐ Favoriten
      </button>
    </div>
  </div>

  <div class="projects-container" id="projectsContainer">
    <div class="empty-state">
      <div class="empty-icon">🦖</div>
      <p>Noch keine Projekte hinzugefügt.</p>
      <p style="font-size: 11px; margin-top: 4px;">Klicke oben auf „📁 Ordner hinzufügen / öffnen“, um deine Projekte zu verwalten.</p>
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
      editingNameFor: null,
      editingDescFor: null,
      editingNotesFor: null,
      addingTagFor: null
    };

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'stateUpdate') {
        state.projects = message.projects || [];
        state.settings = message.settings || state.settings;
        state.workspaceName = message.workspaceName || 'Workspace';
        render();
      }
    });

    const mascotBadge = document.getElementById('mascotBadge');
    mascotBadge.addEventListener('click', () => {
      const greetings = [
        "🦖 Rawr! Alle Projekte im Blick!",
        "🦖 Tipp: Mit 1 Klick in Antigravity laden!",
        "🦖 Deine Projekte sind sicher gespeichert!",
        "🦖 Bereit zum Weiterarbeiten!"
      ];
      const randomGreet = greetings[Math.floor(Math.random() * greetings.length)];
      const textEl = document.getElementById('mascotText');
      textEl.innerText = randomGreet;
      setTimeout(() => {
        textEl.innerText = state.settings.mascotTitle || 'Dino-Wächter';
      }, 2200);
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

      const favFilterBtn = document.getElementById('filterFavBtn');
      if (favFilterBtn) {
        if (state.filterFavorites) {
          favFilterBtn.classList.add('active');
        } else {
          favFilterBtn.classList.remove('active');
        }
      }

      const totalCount = state.projects.length;
      const favCount = state.projects.filter(p => p.isFavorite).length;
      const activeCount = state.projects.filter(p => p.isActiveWorkspace).length;

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

      const container = document.getElementById('projectsContainer');
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

      container.innerHTML = filtered.map(proj => {
        const healthClass = \`health-\${proj.health.status}\`;
        const isEditingName = state.editingNameFor === proj.id;
        const isEditingDesc = state.editingDescFor === proj.id;
        const isEditingNotes = state.editingNotesFor === proj.id;
        const isAddingTag = state.addingTagFor === proj.id;

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
                      <div class="project-name" title="Klicke auf ✏️, um dem Projekt einen eigenen Namen zu geben">
                        <span>\${proj.isActiveWorkspace ? '🦖' : '📦'}</span>
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
                  <span class="health-pill \${healthClass}" title="\${escapeHtml(proj.health.message)}">
                    \${escapeHtml(proj.health.badge)}
                  </span>
                </div>
              </div>

              <!-- Primärer Antigravity-Ladebutton -->
              <div class="antigravity-launch-row">
                \${proj.isActiveWorkspace ? \`
                  <button class="btn-launch btn-launch-active" onclick="focusAntigravityPanel()" title="Projekt ist geladen! Klicke, um direkt zum Antigravity-Chat zu wechseln">
                    🦖 Aktiv in Antigravity – Weiterarbeiten
                  </button>
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

              <!-- Eigene Notizen -->
              <div class="notes-box">
                <div class="notes-header">
                  <span>PROJEKT-NOTIZEN</span>
                  <button class="btn" style="padding: 1px 5px; font-size: 10px;" onclick="toggleEditNotes('\${escapeHtml(proj.id)}')">
                    \${isEditingNotes ? 'Schließen' : (proj.customNotes ? '✏️ Bearbeiten' : '+ Notiz')}
                  </button>
                </div>
                \${isEditingNotes ? \`
                  <div>
                    <textarea class="notes-textarea" id="notesInput_\${escapeHtml(proj.id)}" placeholder="Eigene Notizen oder To-Dos zum Projekt...">\${escapeHtml(proj.customNotes)}</textarea>
                    <div style="display: flex; gap: 4px; justify-content: flex-end; margin-top: 4px;">
                      <button class="btn btn-primary" onclick="saveNotes('\${escapeHtml(proj.id)}')">Notiz speichern</button>
                    </div>
                  </div>
                \` : \`
                  <div class="notes-content">\${proj.customNotes ? escapeHtml(proj.customNotes) : '<span style="color: var(--text-muted); font-style: italic;">Keine Notizen. Klicke auf „+ Notiz“, um welche hinzuzufügen.</span>'}</div>
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
                  <button class="btn btn-danger" title="Aus der Dashboard-Liste entfernen (löscht keine Dateien)" onclick="removeProject('\${escapeHtml(proj.folderUri)}')">
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

    function removeProject(uri) {
      vscode.postMessage({ command: 'removeProject', uri });
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

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
    }
}

