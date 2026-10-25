"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WelcomePanel = void 0;
const vscode = __importStar(require("vscode"));
class WelcomePanel {
    static currentPanel;
    static viewType = 'dinoDashboard.welcome';
    panel;
    extensionUri;
    scanner;
    sidebarProvider;
    disposables = [];
    isDisposed = false;
    static createOrShow(extensionUri, scanner, sidebarProvider) {
        try {
            const column = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn
                : undefined;
            if (WelcomePanel.currentPanel && !WelcomePanel.currentPanel.isDisposed) {
                WelcomePanel.currentPanel.panel.reveal(column || vscode.ViewColumn.One);
                WelcomePanel.currentPanel.update();
                return WelcomePanel.currentPanel;
            }
            const panel = vscode.window.createWebviewPanel(WelcomePanel.viewType, '🦖 Willkommen - Dino Dashboard', column || vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'resources')
                ]
            });
            try {
                panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.png');
            }
            catch { }
            WelcomePanel.currentPanel = new WelcomePanel(panel, extensionUri, scanner, sidebarProvider);
            return WelcomePanel.currentPanel;
        }
        catch (err) {
            console.warn('[WelcomePanel] Konnte WebviewPanel nicht erstellen:', err);
            throw err;
        }
    }
    constructor(panel, extensionUri, scanner, sidebarProvider) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.scanner = scanner;
        this.sidebarProvider = sidebarProvider;
        this.update();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (this.isDisposed)
                return;
            try {
                switch (message.command) {
                    case 'loadProject': {
                        if (message.uri) {
                            await this.sidebarProvider.loadProjectInAntigravity(message.uri, message.name || 'Projekt', false);
                        }
                        break;
                    }
                    case 'createNewProject': {
                        await this.sidebarProvider.promptCreateNewProject();
                        break;
                    }
                    case 'addFolder': {
                        await this.sidebarProvider.promptAddFolder(false);
                        await this.update();
                        break;
                    }
                    case 'showDashboard': {
                        try {
                            await vscode.commands.executeCommand('projectOverview.sidebarView.focus');
                        }
                        catch {
                            await vscode.commands.executeCommand('projectOverview.explorerView.focus');
                        }
                        await this.sidebarProvider.updateDashboard();
                        break;
                    }
                    case 'openSettings': {
                        await vscode.commands.executeCommand('workbench.action.openSettings', 'projectSummary');
                        break;
                    }
                }
            }
            catch (err) {
                console.warn('[WelcomePanel] Message Handler Fehler:', err);
            }
        }, null, this.disposables);
    }
    async update() {
        if (this.isDisposed)
            return;
        try {
            const settings = this.sidebarProvider.getSettings();
            const projects = await this.scanner.scanAll(settings);
            if (this.isDisposed)
                return;
            this.panel.webview.html = this.getHtml(projects);
        }
        catch (err) {
            console.warn('[WelcomePanel] Fehler beim Aktualisieren:', err);
        }
    }
    dispose() {
        this.isDisposed = true;
        WelcomePanel.currentPanel = undefined;
        try {
            this.panel.dispose();
        }
        catch { }
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                try {
                    x.dispose();
                }
                catch { }
            }
        }
    }
    getHtml(projects) {
        const escapeHtml = (text) => {
            return (text || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };
        const getStatusPill = (statusHint) => {
            const hint = statusHint || 'Bereit';
            let color = '#3fb950';
            let bg = 'rgba(46, 160, 67, 0.15)';
            let border = 'rgba(63, 185, 80, 0.35)';
            if (hint.includes('In Arbeit')) {
                color = '#58a6ff';
                bg = 'rgba(56, 139, 253, 0.15)';
                border = 'rgba(88, 166, 255, 0.35)';
            }
            else if (hint.includes('Pausiert')) {
                color = '#d29922';
                bg = 'rgba(187, 128, 9, 0.15)';
                border = 'rgba(210, 153, 34, 0.35)';
            }
            else if (hint.includes('Bugfix')) {
                color = '#f85149';
                bg = 'rgba(248, 81, 73, 0.15)';
                border = 'rgba(248, 81, 73, 0.35)';
            }
            else if (hint.includes('In Planung')) {
                color = '#bc8cff';
                bg = 'rgba(163, 113, 247, 0.15)';
                border = 'rgba(188, 140, 255, 0.35)';
            }
            return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; color: ${color}; background: ${bg}; border: 1px solid ${border}; white-space: nowrap;">${escapeHtml(hint)}</span>`;
        };
        // 1. TATSÄCHLICH ZULETZT GEÖFFNETES PROJEKT ERMITTELN:
        const lastUri = this.sidebarProvider.getContext().globalState.get('dinoDashboard.lastOpenedProjectUri');
        let lastProject = null;
        if (lastUri) {
            lastProject = projects.find(p => {
                if (p.folderUri.toLowerCase() === lastUri.toLowerCase())
                    return true;
                try {
                    const parsedPath = vscode.Uri.parse(lastUri).fsPath.toLowerCase();
                    if (p.folderPath.toLowerCase() === parsedPath)
                        return true;
                }
                catch { }
                return false;
            }) || null;
        }
        // Falls noch keine lastUri gespeichert ist: Fallback auf ersten Favoriten oder erstes Projekt
        if (!lastProject && projects.length > 0) {
            lastProject = projects.find(p => p.isFavorite) || projects[0];
        }
        // 2. FAVORITEN ERMITTELN (AUF MAXIMAL 3 BESCHRÄNKEN):
        const favProjects = projects.filter(p => p.isFavorite).slice(0, 3);
        const favProjectsHtml = favProjects.map(proj => {
            const statusPill = getStatusPill(proj.statusHint);
            const techStr = (proj.techStack || []).slice(0, 3).join(', ');
            return `
                <div class="summary-item" onclick="loadProject('${escapeHtml(proj.folderUri)}', '${escapeHtml(proj.name)}')">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #e3b341; font-size: 14px; line-height: 1;">⭐</span>
                            <span class="summary-name">${escapeHtml(proj.name)}</span>
                            ${statusPill}
                        </div>
                        <div class="summary-desc">
                            ${techStr ? `<span style="color: var(--accent); font-weight: 600;">${escapeHtml(techStr)}</span> • ` : ''}
                            ${escapeHtml(proj.customNotes || proj.description || proj.folderPath)}
                        </div>
                    </div>
                    <button class="btn btn-sm" onclick="event.stopPropagation(); loadProject('${escapeHtml(proj.folderUri)}', '${escapeHtml(proj.name)}')" title="Projekt öffnen">
                        🚀 Öffnen
                    </button>
                </div>
            `;
        }).join('');
        return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Willkommen - Dino Dashboard</title>
    <style>
        :root {
            --accent: #2ea043;
            --accent-hover: #3fb950;
            --card-bg: rgba(128, 128, 128, 0.05);
            --card-border: var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
            --text-muted: var(--vscode-descriptionForeground, #8b949e);
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 30px 40px;
            margin: 0;
            display: flex;
            justify-content: center;
        }

        .container {
            max-width: 720px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* Hero / Header */
        .hero {
            display: flex;
            align-items: center;
            gap: 18px;
            padding: 18px 22px;
            background: linear-gradient(135deg, rgba(46, 160, 67, 0.1) 0%, rgba(128, 128, 128, 0.04) 100%);
            border: 1px solid rgba(46, 160, 67, 0.3);
            border-radius: 12px;
        }

        .dino-mascot {
            font-size: 48px;
            line-height: 1;
            filter: drop-shadow(0 3px 8px rgba(46, 160, 67, 0.35));
            animation: dinoBounce 3s ease-in-out infinite;
        }

        @keyframes dinoBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }

        .hero-text h1 {
            margin: 0 0 4px 0;
            font-size: 21px;
            font-weight: 700;
            color: var(--vscode-foreground);
            letter-spacing: -0.3px;
        }

        .hero-text p {
            margin: 0;
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.4;
        }

        .speech-bubble {
            margin-top: 8px;
            padding: 7px 12px;
            background: rgba(128, 128, 128, 0.08);
            border-left: 3px solid var(--accent);
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-foreground);
            display: inline-block;
        }

        /* Letztes Projekt Kachel */
        .last-project-card {
            background: var(--card-bg);
            border: 1.5px solid rgba(46, 160, 67, 0.4);
            border-radius: 10px;
            padding: 16px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
        }

        .last-project-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .last-project-path {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 3px;
            word-break: break-all;
        }

        .last-project-note {
            font-size: 11.5px;
            color: #d29922;
            margin-top: 4px;
            background: rgba(210, 153, 34, 0.12);
            padding: 2px 7px;
            border-radius: 4px;
            display: inline-block;
        }

        /* Schnellstart-Buttons */
        .actions-row {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        /* Favoriten Sektion (max. 3) */
        .section-box {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 14px 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .section-header {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .summary-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 9px 12px;
            border-radius: 6px;
            background: rgba(128, 128, 128, 0.04);
            border: 1px solid rgba(128, 128, 128, 0.1);
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .summary-item:hover {
            background: rgba(46, 160, 67, 0.08);
            border-color: rgba(46, 160, 67, 0.3);
        }

        .summary-name {
            font-size: 13.5px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .summary-desc {
            font-size: 11px;
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 2px;
            max-width: 480px;
        }

        /* Buttons */
        .btn {
            background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--card-border);
            padding: 8px 14px;
            border-radius: 5px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
            user-select: none;
        }

        .btn:hover {
            filter: brightness(1.1);
            border-color: var(--accent);
        }

        .btn-primary {
            background: var(--accent);
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            font-size: 12.5px;
        }

        .btn-primary:hover {
            background: var(--accent-hover);
        }

        .btn-sm {
            padding: 4px 10px;
            font-size: 11px;
        }

        .btn-dashboard {
            width: 100%;
            justify-content: center;
            padding: 10px 14px;
            font-size: 13px;
            font-weight: 700;
            background: rgba(46, 160, 67, 0.15);
            color: var(--accent);
            border: 1.5px solid var(--accent);
            border-radius: 6px;
        }

        .btn-dashboard:hover {
            background: var(--accent);
            color: #ffffff;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Willkommen Hero -->
        <div class="hero">
            <div class="dino-mascot">🦖</div>
            <div class="hero-text">
                <h1>Willkommen beim Dino Dashboard!</h1>
                <p>Dein Projekt-Manager für Antigravity & VS Code.</p>
                <div class="speech-bubble">
                    🦖 <b>Dino-Wächter:</b> Hallo! Schön, dass du da bist. Klicke unten auf dein Projekt, um direkt weiterzuarbeiten!
                </div>
            </div>
        </div>

        <!-- Schnellstart Aktionen -->
        <div class="actions-row">
            <button class="btn btn-primary" onclick="createNewProject()" title="Ein ganz neues Projekt anlegen">
                ✨ Neues Projekt anlegen
            </button>
            <button class="btn" onclick="addFolder()" title="Einen bestehenden Ordner auswählen">
                📁 Projektordner öffnen
            </button>
        </div>

        <!-- Zuletzt geöffnetes Projekt (Haupt-Fokus) -->
        ${lastProject ? `
            <div>
                <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; letter-spacing: 0.5px;">
                    ⚡ Zuletzt geöffnetes Projekt
                </div>
                <div class="last-project-card">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="last-project-title">${escapeHtml(lastProject.name)}</span>
                            ${getStatusPill(lastProject.statusHint)}
                        </div>
                        <div class="last-project-path">${escapeHtml(lastProject.folderPath)}</div>
                        ${lastProject.customNotes ? `<div class="last-project-note">📌 ${escapeHtml(lastProject.customNotes)}</div>` : ''}
                    </div>
                    <button class="btn btn-primary" onclick="loadProject('${escapeHtml(lastProject.folderUri)}', '${escapeHtml(lastProject.name)}')" title="Dieses Projekt direkt in Antigravity laden">
                        🚀 Weiterarbeiten ➔
                    </button>
                </div>
            </div>
        ` : ''}

        <!-- Favoriten Sektion (Maximal 3) -->
        <div class="section-box">
            <div class="section-header">
                <span>⭐ Deine Favoriten ${favProjects.length > 0 ? `(${favProjects.length} von max. 3)` : ''}</span>
                <span style="font-size: 11px; text-transform: none; color: var(--text-muted);">${projects.length} Projekte insgesamt</span>
            </div>

            ${favProjects.length > 0 ? favProjectsHtml : `
                <div style="padding: 14px 10px; text-align: center; color: var(--text-muted); font-size: 12px; background: rgba(128,128,128,0.04); border-radius: 6px;">
                    <span>⭐ Noch keine Favoriten markiert.</span>
                    <div style="font-size: 11px; margin-top: 4px;">Klicke im Dino Dashboard auf den Stern neben einem Projekt, um bis zu 3 Favoriten hier auf der Startseite anzuheften.</div>
                </div>
            `}

            <div style="margin-top: 6px;">
                <button class="btn btn-dashboard" onclick="showDashboard()" title="Öffnet das vollständige Dino Dashboard in der Seitenleiste">
                    🦖 Alle ${projects.length} Projekte im Dino Dashboard anzeigen ➔
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function loadProject(uri, name) {
            vscode.postMessage({ command: 'loadProject', uri, name });
        }

        function createNewProject() {
            vscode.postMessage({ command: 'createNewProject' });
        }

        function addFolder() {
            vscode.postMessage({ command: 'addFolder' });
        }

        function showDashboard() {
            vscode.postMessage({ command: 'showDashboard' });
        }
    </script>
</body>
</html>`;
    }
}
exports.WelcomePanel = WelcomePanel;
//# sourceMappingURL=welcomePanel.js.map