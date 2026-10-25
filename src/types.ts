export interface ProjectStats {
    fileCount: number;
    dirCount: number;
    gitBranch?: string;
    lastCommit?: string;
    lastCommitDate?: string;
}

export interface ProjectHealth {
    status: 'healthy' | 'warning' | 'info';
    badge: string;
    message: string;
    details: string[];
}

export interface SavedProjectEntry {
    folderPath: string;
    folderUri: string;
    customName?: string;
    customDescription?: string;
    notes?: string;
    statusHint?: string;
    tags?: string[];
    isFavorite?: boolean;
    addedAt?: number;
    lastOpened?: number;
}

export interface ProjectMetadata {
    id: string;
    name: string;
    folderName: string;
    customName?: string;
    folderUri: string;
    folderPath: string;
    description: string;
    autoDescription: string;
    customDescription?: string;
    isActiveWorkspace: boolean;
    isFavorite: boolean;
    statusHint?: string;
    techStack: string[];
    stats: ProjectStats;
    hasReadme: boolean;
    readmeUri?: string;
    customNotes: string;
    customTags: string[];
    health: ProjectHealth;
    keyDirectories: string[];
    lastOpened?: number;
}

export interface DashboardSettings {
    autoExpandExplorer: boolean;
    autoFocusAntigravity: boolean;
    ignoredFolders: string[];
    showMascot: boolean;
    mascotTitle: string;
    maxAutoExpandDepth: number;
}

