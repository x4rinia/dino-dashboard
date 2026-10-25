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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const projectScanner_1 = require("./projectScanner");
const autoExpander_1 = require("./autoExpander");
const sidebarProvider_1 = require("./sidebarProvider");
const welcomePanel_1 = require("./welcomePanel");
function activate(context) {
    const scanner = new projectScanner_1.ProjectScanner(context);
    const autoExpander = new autoExpander_1.AutoExpander();
    const sidebarProvider = new sidebarProvider_1.SidebarProvider(context, scanner, autoExpander);
    // Webview Provider für Activity Bar registrieren
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.viewType, sidebarProvider));
    // Webview Provider direkt im Explorer-Bereich registrieren
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.explorerViewType, sidebarProvider));
    // Statusleisten-Button (immer mit 1 Klick erreichbar)
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🦖 Dino Dashboard';
    statusBarItem.tooltip = 'Klicken, um das Dino Dashboard zu öffnen';
    statusBarItem.command = 'projectOverview.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Befehle registrieren
    context.subscriptions.push(vscode.commands.registerCommand('projectOverview.showDashboard', async () => {
        try {
            await vscode.commands.executeCommand('projectOverview.explorerView.focus');
        }
        catch {
            await vscode.commands.executeCommand('projectOverview.sidebarView.focus');
        }
        await sidebarProvider.updateDashboard();
    }), vscode.commands.registerCommand('projectOverview.createNewProject', async () => {
        await sidebarProvider.promptCreateNewProject();
    }), vscode.commands.registerCommand('projectOverview.addFolder', async () => {
        await sidebarProvider.promptAddFolder(false);
    }), vscode.commands.registerCommand('projectOverview.scanParentFolder', async () => {
        await sidebarProvider.promptScanParentFolder();
    }), vscode.commands.registerCommand('projectOverview.refresh', async () => {
        await sidebarProvider.updateDashboard();
        vscode.window.showInformationMessage('🦖 Dino Dashboard aktualisiert.');
    }), vscode.commands.registerCommand('projectOverview.autoExpand', async () => {
        const settings = sidebarProvider.getSettings();
        await autoExpander.expandWorkspace(settings, true);
        vscode.window.showInformationMessage('Projektordner im Explorer ausgeklappt.');
    }), vscode.commands.registerCommand('projectOverview.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'projectSummary');
    }), vscode.commands.registerCommand('projectOverview.closeFolder', async () => {
        await sidebarProvider.closeCurrentProject();
    }), vscode.commands.registerCommand('projectOverview.showWelcome', () => {
        welcomePanel_1.WelcomePanel.createOrShow(context.extensionUri, scanner, sidebarProvider);
    }));
    // Beim Start: Zuletzt geöffneten Ordner merken & ggf. Willkommensseite / Antigravity vorbereiten
    const initialSettings = sidebarProvider.getSettings();
    setTimeout(async () => {
        try {
            if (vscode.workspace.workspaceFolders?.[0]) {
                await context.globalState.update('dinoDashboard.lastOpenedProjectUri', vscode.workspace.workspaceFolders[0].uri.toString());
            }
            if (initialSettings.autoExpandExplorer) {
                try {
                    await autoExpander.expandWorkspace(initialSettings);
                }
                catch { }
            }
            const justLoadedPath = context.globalState.get('dinoDashboard.justLoadedProject');
            if (justLoadedPath) {
                await context.globalState.update('dinoDashboard.justLoadedProject', undefined);
                if (initialSettings.autoFocusAntigravity) {
                    try {
                        await vscode.commands.executeCommand('antigravity.panel.focus');
                    }
                    catch { }
                }
                const projName = path.basename(justLoadedPath);
                vscode.window.showInformationMessage(`🦖 Projekt „${projName}“ wurde automatisch in Antigravity geladen – du kannst direkt weiterarbeiten!`);
            }
            else {
                // Wenn kein Projekt/Ordner geöffnet ist: Willkommensseite im Editor anzeigen!
                const isNoFolderOpened = !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0;
                if (isNoFolderOpened) {
                    try {
                        welcomePanel_1.WelcomePanel.createOrShow(context.extensionUri, scanner, sidebarProvider);
                    }
                    catch (e) {
                        console.warn('[WelcomePanel] Startfehler abgefangen:', e);
                    }
                }
            }
        }
        catch (err) {
            console.warn('[DinoDashboard] Start-Initialisierung abgefangen:', err);
        }
    }, 800);
    // Workspace-Ordner-Änderungen überwachen
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        try {
            autoExpander.reset();
            const settings = sidebarProvider.getSettings();
            await sidebarProvider.updateDashboard();
            if (vscode.workspace.workspaceFolders?.[0]) {
                await context.globalState.update('dinoDashboard.lastOpenedProjectUri', vscode.workspace.workspaceFolders[0].uri.toString());
            }
            if (settings.autoExpandExplorer) {
                try {
                    await autoExpander.expandWorkspace(settings);
                }
                catch { }
            }
            const isNoFolderOpened = !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0;
            if (isNoFolderOpened) {
                try {
                    welcomePanel_1.WelcomePanel.createOrShow(context.extensionUri, scanner, sidebarProvider);
                }
                catch (e) {
                    console.warn('[WelcomePanel] Wechsel abgefangen:', e);
                }
            }
            else {
                welcomePanel_1.WelcomePanel.currentPanel?.dispose();
            }
        }
        catch (err) {
            console.warn('[DinoDashboard] Workspace-Änderung abgefangen:', err);
        }
    }));
    // Einstellungen überwachen
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('projectSummary')) {
            sidebarProvider.updateDashboard();
        }
    }));
    // Dateiänderungen (README, package.json, etc.) überwachen
    const watcher = vscode.workspace.createFileSystemWatcher('**/{package.json,Cargo.toml,pyproject.toml,README.md,readme.md,index.html,.vscode/project-summary.json}');
    const debounceUpdate = (() => {
        let timer;
        return () => {
            if (timer)
                clearTimeout(timer);
            timer = setTimeout(() => {
                sidebarProvider.updateDashboard();
            }, 300);
        };
    })();
    watcher.onDidChange(debounceUpdate);
    watcher.onDidCreate(debounceUpdate);
    watcher.onDidDelete(debounceUpdate);
    context.subscriptions.push(watcher);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map