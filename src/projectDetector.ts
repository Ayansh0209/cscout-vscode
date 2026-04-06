import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedProject {
    /** Human-readable project name (e.g. directory basename). */
    name: string;
    /** Absolute path to the project root directory. */
    dir: string;
    /** Absolute paths to all .c / .y source files in this project. */
    files: string[];
    /** Whether this looks like a library (no main.c found). */
    isLibrary: boolean;
}

export type PipelineType = "csmake" | "cswc" | "typescript";

// ---------------------------------------------------------------------------
// Glob patterns to exclude when scanning for C files
// ---------------------------------------------------------------------------

const EXCLUDE_PATTERNS: RegExp[] = [
    /[/\\]node_modules[/\\]/,
    /[/\\]\.git[/\\]/,
    /[/\\]build[/\\]/,
    /[/\\]dist[/\\]/,
    /[/\\]CMakeFiles[/\\]/,
    /[/\\]out[/\\]/,
    /\.pb\.c$/,
    /generated/i,
    /autogen/i,
];

function shouldExclude(filePath: string): boolean {
    return EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

// ---------------------------------------------------------------------------
// Recursive file scanner
// ---------------------------------------------------------------------------

function walkSync(dir: string, ext: string): string[] {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (shouldExclude(fullPath)) {
            continue;
        }
        if (entry.isDirectory()) {
            results.push(...walkSync(fullPath, ext));
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            results.push(path.resolve(fullPath));
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a Makefile exists in the workspace root.
 */
export function hasMakefile(workspaceRoot: string): boolean {
    const names = ["Makefile", "makefile", "GNUmakefile"];
    return names.some((n) => fs.existsSync(path.join(workspaceRoot, n)));
}

/**
 * Check whether a tool is available on PATH.
 */
export async function isToolAvailable(tool: string): Promise<boolean> {
    const { execFile } = await import("child_process");
    return new Promise((resolve) => {
        execFile("which", [tool], (err) => {
            resolve(!err);
        });
    });
}

/**
 * Choose the best pipeline for the given workspace.
 */
export async function choosePipeline(
    workspaceRoot: string
): Promise<PipelineType> {
    if (hasMakefile(workspaceRoot) && (await isToolAvailable("csmake"))) {
        return "csmake";
    }
    if (await isToolAvailable("cswc")) {
        return "cswc";
    }
    return "typescript";
}

/**
 * Scan the workspace for all .c source files.
 */
export function scanCFiles(workspaceRoot: string): string[] {
    return walkSync(workspaceRoot, ".c");
}

/**
 * Scan the workspace for all .h header files.
 */
export function scanHFiles(workspaceRoot: string): string[] {
    return walkSync(workspaceRoot, ".h");
}

/**
 * Detect include paths by collecting directories containing .h files,
 * plus conventional directory names (include, inc, headers).
 */
export function detectIncludePaths(
    workspaceRoot: string,
    hFiles: string[]
): string[] {
    const dirs = new Set<string>();

    // Every directory that contains a .h file is a candidate include path
    for (const h of hFiles) {
        dirs.add(path.dirname(path.resolve(h)));
    }

    // Also add conventional directory names if they exist
    const conventional = ["include", "inc", "headers"];
    for (const name of conventional) {
        const candidate = path.join(workspaceRoot, name);
        if (fs.existsSync(candidate)) {
            dirs.add(path.resolve(candidate));
        }
    }

    return [...dirs];
}

/**
 * Group .c files into logical projects using heuristics:
 *
 * 1. Look for files named main.c — each is likely its own executable.
 * 2. If multiple main.c exist, each one and its directory siblings form a project.
 * 3. If exactly one main.c, all .c files form a single project.
 * 4. If no main.c found, treat it as a library (single project, flagged).
 */
export function detectProjects(
    workspaceRoot: string,
    cFiles: string[]
): DetectedProject[] {
    const mainFiles = cFiles.filter(
        (f) => path.basename(f) === "main.c"
    );

    if (mainFiles.length > 1) {
        // Multiple executables — each main.c and its siblings are one project
        return mainFiles.map((main) => {
            const dir = path.dirname(main);
            const siblings = cFiles.filter(
                (f) => path.dirname(f) === dir
            );
            return {
                name: path.basename(dir),
                dir,
                files: siblings,
                isLibrary: false,
            };
        });
    }

    if (mainFiles.length === 1) {
        // Single executable — all .c files in one project
        return [
            {
                name: path.basename(workspaceRoot),
                dir: workspaceRoot,
                files: cFiles,
                isLibrary: false,
            },
        ];
    }

    // No main.c found — could be a library
    return [
        {
            name: path.basename(workspaceRoot),
            dir: workspaceRoot,
            files: cFiles,
            isLibrary: true,
        },
    ];
}
