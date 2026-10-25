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
    static createOrShow(extensionUri, scanner, sidebarProvider) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (WelcomePanel.currentPanel) {
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
    constructor(panel, extensionUri, scanner, sidebarProvider) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.scanner = scanner;
        this.sidebarProvider = sidebarProvider;
        this.update();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (message) => {
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
                case 'scanParentFolder': {
                    await this.sidebarProvider.promptScanParentFolder();
                    await this.update();
                    break;
                }
                case 'showDashboard': {
                    await vscode.commands.executeCommand('projectOverview.showDashboard');
                    break;
                }
                case 'openSettings': {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'projectSummary');
                    break;
                }
                case 'toggleFavorite': {
                    if (message.uri) {
                        const fsPath = vscode.Uri.parse(message.uri).fsPath;
                        const current = await this.scanner.loadPersistedDataByPath(fsPath);
                        await this.scanner.savePersistedData(message.uri, { isFavorite: !current.isFavorite });
                        await this.update();
                        await this.sidebarProvider.updateDashboard();
                    }
                    break;
                }
            }
        }, null, this.disposables);
    }
    async update() {
        const settings = this.sidebarProvider.getSettings();
        const projects = await this.scanner.scanAll(settings);
        this.panel.webview.html = this.getHtml(projects);
    }
    dispose() {
        WelcomePanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    getHtml(projects) {
        const sorted = [...projects].sort((a, b) => {
            if (a.isFavorite && !b.isFavorite)
                return -1;
            if (!a.isFavorite && b.isFavorite)
                return 1;
            return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
        });
        const favCount = projects.filter(p => p.isFavorite).length;
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
            return `<span style="display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600; color: ${color}; background: ${bg}; border: 1px solid ${border};">${escapeHtml(hint)}</span>`;
        };
        const projectCardsHtml = sorted.map(proj => {
            const statusPill = getStatusPill(proj.statusHint);
            return `
                <div class="project-row" data-name="${escapeHtml(proj.name.toLowerCase())}" data-path="${escapeHtml(proj.folderPath.toLowerCase())}">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                        <button class="fav-star ${proj.isFavorite ? 'is-fav' : ''}" onclick="toggleFavorite('${escapeHtml(proj.folderUri)}')" title="${proj.isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}">
                            ${proj.isFavorite ? '⭐' : '☆'}
                        </button>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="project-title" onclick="loadProject('${escapeHtml(proj.folderUri)}', '${escapeHtml(proj.name)}')" title="Projekt öffnen">${escapeHtml(proj.name)}</span>
                                ${statusPill}
                            </div>
                            <div class="project-path" title="${escapeHtml(proj.folderPath)}">${escapeHtml(proj.folderPath)}</div>
                            ${proj.customNotes ? `<div class="project-note">📌 ${escapeHtml(proj.customNotes)}</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-primary" onclick="loadProject('${escapeHtml(proj.folderUri)}', '${escapeHtml(proj.name)}')" title="Dieses Projekt direkt in Antigravity laden">
                            🚀 Öffnen
                        </button>
                    </div>
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
            max-width: 820px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        /* Hero / Header */
        .hero {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 20px 24px;
            background: linear-gradient(135deg, rgba(46, 160, 67, 0.1) 0%, rgba(128, 128, 128, 0.04) 100%);
            border: 1px solid rgba(46, 160, 67, 0.3);
            border-radius: 12px;
            position: relative;
            overflow: hidden;
        }

        .dino-mascot {
            font-size: 52px;
            line-height: 1;
            filter: drop-shadow(0 4px 10px rgba(46, 160, 67, 0.35));
            animation: dinoBounce 3s ease-in-out infinite;
        }

        @keyframes dinoBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }

        .hero-text h1 {
            margin: 0 0 6px 0;
            font-size: 22px;
            font-weight: 700;
            color: var(--vscode-foreground);
            letter-spacing: -0.3px;
        }

        .hero-text p {
            margin: 0;
            font-size: 13px;
            color: var(--text-muted);
            line-height: 1.45;
        }

        .speech-bubble {
            margin-top: 10px;
            padding: 8px 12px;
            background: rgba(128, 128, 128, 0.08);
            border-left: 3px solid var(--accent);
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-foreground);
            display: inline-block;
        }

        /* Schnellstart-Kacheln */
        .quick-actions-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
        }

        .action-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            text-align: left;
            user-select: none;
        }

        .action-card:hover {
            border-color: var(--accent);
            background: rgba(46, 160, 67, 0.08);
            transform: translateY(-2px);
        }

        .action-card-icon {
            font-size: 26px;
            line-height: 1;
        }

        .action-card-title {
            font-weight: 700;
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-bottom: 2px;
        }

        .action-card-sub {
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.35;
        }

        /* Projekte-Sektion */
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
        }

        .section-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .search-input {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--card-border));
            border-radius: 5px;
            padding: 5px 10px;
            font-size: 12px;
            outline: none;
            width: 200px;
        }
        .search-input:focus {
            border-color: var(--accent);
        }

        .project-list {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .project-row {
            padding: 10px 14px;
            border-bottom: 1px solid var(--card-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            transition: background 0.12s ease;
        }

        .project-row:last-child {
            border-bottom: none;
        }

        .project-row:hover {
            background: rgba(128, 128, 128, 0.08);
        }

        .project-title {
            font-size: 13.5px;
            font-weight: 700;
            color: var(--vscode-foreground);
            cursor: pointer;
            transition: color 0.12s ease;
        }

        .project-title:hover {
            color: var(--accent);
            text-decoration: underline;
        }

        .project-path {
            font-size: 11px;
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 2px;
        }

        .project-note {
            font-size: 11px;
            color: #d29922;
            margin-top: 3px;
            background: rgba(210, 153, 34, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
            display: inline-block;
        }

        .fav-star {
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 2px;
            color: var(--text-muted);
            transition: transform 0.15s ease;
        }
        .fav-star:hover {
            transform: scale(1.25);
        }
        .fav-star.is-fav {
            color: #e3b341;
        }

        .btn {
            background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.2));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--card-border);
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.15s ease;
        }

        .btn:hover {
            filter: brightness(1.1);
        }

        .btn-primary {
            background: var(--accent);
            color: #ffffff;
            border: none;
        }
        .btn-primary:hover {
            background: var(--accent-hover);
        }

        .empty-placeholder {
            text-align: center;
            padding: 30px 15px;
            color: var(--text-muted);
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Hero Header -->
        <div class="hero">
            <div class="dino-mascot">🦖</div>
            <div class="hero-text">
                <h1>Willkommen beim Dino Dashboard!</h1>
                <p>Dein Projekt-Manager für Antigravity & VS Code – schnell starten, Favoriten verwalten und weiterarbeiten.</p>
                <div class="speech-bubble">
                    🦖 <b>Dino-Wächter:</b> Hallo! Wähle unten ein Projekt aus, um sofort loszulegen, oder lege ein neues an.
                </div>
            </div>
        </div>

        <!-- Schnellstart Aktionen -->
        <div class="quick-actions-grid">
            <div class="action-card" onclick="createNewProject()">
                <div class="action-card-icon">✨</div>
                <div>
                    <div class="action-card-title">Neues Projekt anlegen</div>
                    <div class="action-card-sub">Ordnername & Pfad wählen, wechselt automatisch hinein</div>
                </div>
            </div>
            <div class="action-card" onclick="addFolder()">
                <div class="action-card-icon">📁</div>
                <div>
                    <div class="action-card-title">Projektordner öffnen</div>
                    <div class="action-card-sub">Bestehenden Ordner auswählen & dauerhaft sichern</div>
                </div>
            </div>
            <div class="action-card" onclick="scanParentFolder()">
                <div class="action-card-icon">🔍</div>
                <div>
                    <div class="action-card-title">Überordner scannen</div>
                    <div class="action-card-sub">Ein Verzeichnis nach allen Projekten durchsuchen</div>
                </div>
            </div>
        </div>

        <!-- Projekte Übersicht -->
        <div>
            <div class="section-header">
                <div class="section-title">
                    <span>Deine Projekte (${projects.length})</span>
                    ${favCount > 0 ? `<span style="font-size: 11px; color: #e3b341; font-weight: 600;">⭐ ${favCount} Favoriten</span>` : ''}
                </div>
                <input type="text" class="search-input" id="searchBox" placeholder="🔎 Projekt suchen..." oninput="filterProjects(event)">
            </div>

            <div class="project-list" id="projectList">
                ${projects.length === 0 ? `
                    <div class="empty-placeholder">
                        <div style="font-size: 32px; margin-bottom: 6px;">🦖</div>
                        <div>Noch keine Projekte gespeichert.</div>
                        <div style="font-size: 11.5px; margin-top: 4px;">Klicke oben auf „✨ Neues Projekt“ oder „📁 Projektordner öffnen“, um anzufangen!</div>
                    </div>
                ` : projectCardsHtml}
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

        function scanParentFolder() {
            vscode.postMessage({ command: 'scanParentFolder' });
        }

        function toggleFavorite(uri) {
            vscode.postMessage({ command: 'toggleFavorite', uri });
        }

        function filterProjects(e) {
            const query = (e.target.value || '').toLowerCase().trim();
            const rows = document.querySelectorAll('.project-row');
            rows.forEach(row => {
                const name = row.getAttribute('data-name') || '';
                const path = row.getAttribute('data-path') || '';
                if (!query || name.includes(query) || path.includes(query)) {
                    row.style.display = 'flex';
                } else {
                    row.style.display = 'none';
                }
            });
        }
    </script>
</body>
</html>`;
    }
}
exports.WelcomePanel = WelcomePanel;
//# sourceMappingURL=welcomePanel.js.map