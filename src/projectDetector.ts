import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------



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
    /[/\\]\.cscout[/\\]/,
    /[/\\]\.cscout-vscode[/\\]/,
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
 * Detect which pipeline to use.
 *
 *   1. Makefile exists         → "csmake"
 *   2. .prj file exists        → "cswc-existing"
 *   3. Neither                 → "cswc-generate"
 */
export type PipelineType = "csmake" | "cswc-existing" | "cswc-generate";

export function detectPipeline(workspaceRoot: string): PipelineType {
    // Check for Makefile
    const makefileNames = ["Makefile", "makefile", "GNUmakefile"];
    const hasMakefile = makefileNames.some((n) =>
        fs.existsSync(path.join(workspaceRoot, n))
    );
    if (hasMakefile) {
        return "csmake";
    }

    // Check for existing .prj file
    const prjPath = findExistingPrj(workspaceRoot);
    if (prjPath) {
        return "cswc-existing";
    }

    // Fallback: we'll generate a .prj
    return "cswc-generate";
}

/**
 * Find an existing .prj workspace definition file in the workspace.
 * Returns the absolute path, or null if none found.
 */
export function findExistingPrj(workspaceRoot: string): string | null {
    // Check common names
    const candidates = ["project.prj", "workspace.prj"];
    for (const name of candidates) {
        const p = path.join(workspaceRoot, name);
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // Check for any .prj file in the root
    try {
        const entries = fs.readdirSync(workspaceRoot);
        for (const entry of entries) {
            if (entry.endsWith(".prj")) {
                return path.join(workspaceRoot, entry);
            }
        }
    } catch {
        // ignore
    }

    return null;
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
 * Detect include paths from .h file locations and conventional dirs.
 */
export function detectIncludePaths(
    workspaceRoot: string,
    hFiles: string[],
    cFiles: string[] = []
): string[] {
    const dirs = new Set<string>();

    // Always include workspace root
    dirs.add(path.resolve(workspaceRoot));

    // Every directory containing a .h file
    for (const h of hFiles) {
        dirs.add(path.dirname(path.resolve(h)));
    }

    // Every directory containing a .c file
    for (const c of cFiles) {
        dirs.add(path.dirname(path.resolve(c)));
    }

    // Conventional directory names
    const conventional = ["include", "inc", "headers", "src"];
    for (const name of conventional) {
        const candidate = path.join(workspaceRoot, name);
        if (fs.existsSync(candidate)) {
            dirs.add(path.resolve(candidate));
        }
    }

    return [...dirs];
}

/**
 * Generate a CScout .prj workspace definition file.
 *
 * The .prj format is the human-readable input to `cswc` (the CScout
 * workspace compiler). cswc compiles it into a .cs processing script.
 *
 * @param workspaceRoot  Absolute path to the workspace root
 * @param cFiles         Absolute paths to all .c source files
 * @param ipaths         Absolute include paths
 * @returns              The path to the written .prj file
 */
export function generatePrj(
    workspaceRoot: string,
    cFiles: string[],
    ipaths: string[]
): string {
    const lines: string[] = [];

    lines.push(`workspace auto {`);
    lines.push(`    cd "${workspaceRoot}"`);
    lines.push(``);
    lines.push(`    project app {`);

    // Include paths
    for (const ipath of ipaths) {
        lines.push(`        ipath "${ipath}"`);
    }

    // File list — use paths relative to workspaceRoot
    const relFiles = cFiles.map((f) =>
        path.relative(workspaceRoot, f)
    );

    // Emit files in groups of 5 per line for readability
    for (let i = 0; i < relFiles.length; i += 5) {
        const batch = relFiles.slice(i, i + 5).join(" ");
        lines.push(`        file ${batch}`);
    }

    lines.push(`    }`);
    lines.push(`}`);
    lines.push(``);

    const prjContent = lines.join("\n");
    const prjPath = path.join(workspaceRoot, "project.prj");
    fs.writeFileSync(prjPath, prjContent, "utf-8");

    return prjPath;
}
