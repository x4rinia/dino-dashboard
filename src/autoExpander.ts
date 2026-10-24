import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardSettings } from './types';

export class AutoExpander {
    private hasAutoExpanded = false;

    /**
     * Klappt automatisch die wichtigsten Projektordner im VS Code / Antigravity Explorer aus.
     */
    public async expandWorkspace(settings: DashboardSettings, force = false): Promise<void> {
        if (!force && this.hasAutoExpanded) {
            return;
        }
        if (!settings.autoExpandExplorer && !force) {
            return;
        }
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }

        this.hasAutoExpanded = true;
        const ignoredSet = new Set(settings.ignoredFolders.map(f => f.toLowerCase()));

        try {
            await vscode.commands.executeCommand('workbench.view.explorer');
        } catch { }

        await new Promise(r => setTimeout(r, 250));

        for (const folder of folders) {
            const rootPath = folder.uri.fsPath;
            try {
                await vscode.commands.executeCommand('revealInExplorer', folder.uri);

                const entries = fs.readdirSync(rootPath, { withFileTypes: true });
                const candidateDirs: string[] = [];
                let fallbackFile: string | null = null;

                for (const entry of entries) {
                    const name = entry.name;
                    if (name.startsWith('.') || ignoredSet.has(name.toLowerCase())) {
                        continue;
                    }
                    if (entry.isDirectory()) {
                        candidateDirs.push(name);
                    } else if (!fallbackFile && (name.startsWith('README') || name === 'package.json' || name === 'index.html' || name === 'main.py')) {
                        fallbackFile = name;
                    }
                }

                const priorityOrder = ['src', 'lib', 'app', 'components', 'pages', 'pkg', 'core', 'server', 'client', 'assets', 'docs', 'test', 'tests'];
                candidateDirs.sort((a, b) => {
                    const aIndex = priorityOrder.indexOf(a.toLowerCase());
                    const bIndex = priorityOrder.indexOf(b.toLowerCase());
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return a.localeCompare(b);
                });

                const toReveal = candidateDirs.slice(0, 3);
                if (toReveal.length > 0) {
                    for (const dirName of toReveal) {
                        const dirUri = vscode.Uri.file(path.join(rootPath, dirName));
                        try {
                            await vscode.commands.executeCommand('revealInExplorer', dirUri);
                            await new Promise(r => setTimeout(r, 60));
                        } catch { }
                    }
                } else if (fallbackFile) {
                    const fileUri = vscode.Uri.file(path.join(rootPath, fallbackFile));
                    await vscode.commands.executeCommand('revealInExplorer', fileUri);
                }
            } catch (err) {
                console.warn(`[AutoExpander] Konnte Ordner ${folder.name} nicht ausklappen:`, err);
            }
        }
    }

    public reset(): void {
        this.hasAutoExpanded = false;
    }
}

