import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface FileConfig {
    /** Absolute path to the .c or .y source file. */
    path: string;
    /** Per-file #define directives.  null value = define without a value. */
    defines?: Record<string, string | null>;
}

export interface ProjectConfig {
    /** Human-readable project name. */
    name: string;
    /** Absolute directory to pushd into (optional). */
    dir?: string;
    /** Absolute include paths. */
    ipaths?: string[];
    /** Project-level #define directives. */
    defines?: Record<string, string | null>;
    /** Read-only path prefixes (only needed per-project override). */
    roPrefix?: string[];
    /** Source files in this project. */
    files: FileConfig[];
}

export interface WorkspaceConfig {
    /** Workspace name. */
    name: string;
    /** Absolute workspace root directory. */
    dir: string;
    /** Read-only path prefixes (e.g. /usr/include). */
    roPrefix?: string[];
    /** Projects in this workspace. */
    projects: ProjectConfig[];
    /** Absolute path to the directory containing host-defs.h / host-incs.h. */
    cscoutHome: string;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a CScout processing script (.cs) from the given workspace
 * configuration.
 *
 * The output exactly matches the pragma structure produced by cswc.pl
 * (verified against the source at src/cswc.pl).
 *
 * Key rules:
 *   - host-defs.h is loaded via  `#pragma process`  (NOT #include)
 *   - host-incs.h is loaded via  `#include`          (NOT #pragma process)
 *   - Order per file block:
 *       clear_defines → clear_include → pragma process host-defs.h
 *       → ipaths → defines → #include host-incs.h → pragma process file
 *   - ALL paths are absolute
 *   - Every block_enter has a matching block_exit
 *   - Every pushd has a matching popd
 */
export function generateProcessingScript(config: WorkspaceConfig): string {
    const lines: string[] = [];
    const push = (line: string) => lines.push(line);

    const defsFile = path.join(config.cscoutHome, "host-defs.h");
    const incsFile = path.join(config.cscoutHome, "host-incs.h");

    // Validate configuration files exist
    if (!fs.existsSync(defsFile)) {
        throw new Error(`host-defs.h not found at ${defsFile}`);
    }
    if (!fs.existsSync(incsFile)) {
        throw new Error(`host-incs.h not found at ${incsFile}`);
    }

    // -----------------------------------------------------------------------
    // Workspace header
    // -----------------------------------------------------------------------
    push(`// workspace ${config.name}`);
    push(`#pragma echo "Processing workspace ${config.name}\\n"`);
    push(`#pragma echo "Entering directory ${config.dir}\\n"`);
    push(`#pragma pushd "${config.dir}"`);

    // Workspace-level ro_prefix
    for (const prefix of config.roPrefix ?? ["/usr/include"]) {
        push(`#pragma ro_prefix "${prefix}"`);
    }

    // -----------------------------------------------------------------------
    // Projects
    // -----------------------------------------------------------------------
    for (const project of config.projects) {
        push(`// project ${project.name}`);
        push(
            `#pragma echo "Processing project ${project.name}\\n"`
        );
        push(`#pragma project "${project.name}"`);
        push(`#pragma block_enter`);

        if (project.dir) {
            push(
                `#pragma echo "Entering directory ${project.dir}\\n"`
            );
            push(`#pragma pushd "${project.dir}"`);
        }

        // -------------------------------------------------------------------
        // Files
        // -------------------------------------------------------------------
        for (const file of project.files) {
            const fileName = path.basename(file.path);
            push(`// file ${fileName}`);
            push(
                `#pragma echo "Processing file ${fileName}\\n"`
            );
            push(`#pragma block_enter`);
            push(`#pragma clear_defines`);
            push(`#pragma clear_include`);

            // host-defs.h via #pragma process (NOT #include!)
            push(`#pragma process "${defsFile}"`);

            // Project-level include paths
            for (const ipath of project.ipaths ?? []) {
                push(`#pragma includepath "${ipath}"`);
            }

            // Project-level defines
            for (const [key, val] of Object.entries(
                project.defines ?? {}
            )) {
                push(
                    val !== null
                        ? `#define ${key} ${val}`
                        : `#define ${key}`
                );
            }

            // Per-file defines (inherited on top of project defines)
            for (const [key, val] of Object.entries(
                file.defines ?? {}
            )) {
                push(
                    val !== null
                        ? `#define ${key} ${val}`
                        : `#define ${key}`
                );
            }

            // host-incs.h via #include (NOT #pragma process!)
            push(`#include "${incsFile}"`);

            // Process the actual source file
            push(`#pragma process "${file.path}"`);
            push(``);
            push(`#pragma block_exit`);
            push(
                `#pragma echo "Done processing file ${fileName}\\n"`
            );
        }

        // -------------------------------------------------------------------
        // Project footer
        // -------------------------------------------------------------------
        if (project.dir) {
            push(
                `#pragma echo "Exiting directory ${project.dir}\\n"`
            );
            push(`#pragma popd`);
        }
        push(`#pragma block_exit`);
        push(
            `#pragma echo "Done processing project ${project.name}\\n"`
        );
    }

    // -----------------------------------------------------------------------
    // Workspace footer
    // -----------------------------------------------------------------------
    push(
        `#pragma echo "Exiting directory ${config.dir}\\n"`
    );
    push(`#pragma popd`);
    push(
        `#pragma echo "Done processing workspace ${config.name}\\n"`
    );

    return lines.join("\n") + "\n";
}
