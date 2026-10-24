import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectScanner } from './projectScanner';
import { AutoExpander } from './autoExpander';
import { SidebarProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
    const scanner = new ProjectScanner(context);
    const autoExpander = new AutoExpander();
    const sidebarProvider = new SidebarProvider(context, scanner, autoExpander);

    // Webview Provider für Activity Bar registrieren
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    // Webview Provider direkt im Explorer-Bereich registrieren
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidebarProvider.explorerViewType, sidebarProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    // Statusleisten-Button (immer mit 1 Klick erreichbar)
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '🦖 Dino Dashboard';
    statusBarItem.tooltip = 'Klicken, um das Dino Dashboard zu öffnen';
    statusBarItem.command = 'projectOverview.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Befehle registrieren
    context.subscriptions.push(
        vscode.commands.registerCommand('projectOverview.showDashboard', async () => {
            try {
                await vscode.commands.executeCommand('projectOverview.explorerView.focus');
            } catch {
                await vscode.commands.executeCommand('projectOverview.sidebarView.focus');
            }
            await sidebarProvider.updateDashboard();
        }),
        vscode.commands.registerCommand('projectOverview.addFolder', async () => {
            await sidebarProvider.promptAddFolder(false);
        }),
        vscode.commands.registerCommand('projectOverview.scanParentFolder', async () => {
            await sidebarProvider.promptScanParentFolder();
        }),
        vscode.commands.registerCommand('projectOverview.refresh', async () => {
            await sidebarProvider.updateDashboard();
            vscode.window.showInformationMessage('🦖 Dino Dashboard aktualisiert.');
        }),
        vscode.commands.registerCommand('projectOverview.autoExpand', async () => {
            const settings = sidebarProvider.getSettings();
            await autoExpander.expandWorkspace(settings, true);
            vscode.window.showInformationMessage('Projektordner im Explorer ausgeklappt.');
        }),
        vscode.commands.registerCommand('projectOverview.openSettings', async () => {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'projectSummary');
        })
    );

    // Beim Start: Dashboard anzeigen, Ordner ausklappen & ggf. Antigravity fokussieren
    const initialSettings = sidebarProvider.getSettings();
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('projectOverview.explorerView.focus');
        } catch { }

        if (initialSettings.autoExpandExplorer) {
            await autoExpander.expandWorkspace(initialSettings);
        }

        const justLoadedPath = context.globalState.get<string>('dinoDashboard.justLoadedProject');
        if (justLoadedPath) {
            await context.globalState.update('dinoDashboard.justLoadedProject', undefined);
            if (initialSettings.autoFocusAntigravity) {
                try {
                    await vscode.commands.executeCommand('antigravity.panel.focus');
                } catch { }
            }
            const projName = path.basename(justLoadedPath);
            vscode.window.showInformationMessage(
                `🦖 Projekt „${projName}“ wurde automatisch in Antigravity geladen – du kannst direkt weiterarbeiten!`
            );
        }
    }, 600);

    // Workspace-Ordner-Änderungen überwachen
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            autoExpander.reset();
            const settings = sidebarProvider.getSettings();
            await sidebarProvider.updateDashboard();
            if (settings.autoExpandExplorer) {
                await autoExpander.expandWorkspace(settings);
            }
        })
    );

    // Einstellungen überwachen
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('projectSummary')) {
                sidebarProvider.updateDashboard();
            }
        })
    );

    // Dateiänderungen (README, package.json, etc.) überwachen
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/{package.json,Cargo.toml,pyproject.toml,README.md,readme.md,index.html,.vscode/project-summary.json}'
    );
    const debounceUpdate = (() => {
        let timer: NodeJS.Timeout | undefined;
        return () => {
            if (timer) clearTimeout(timer);
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

export function deactivate(): void { }

