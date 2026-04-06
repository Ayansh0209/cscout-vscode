import * as fs from "fs";
import * as path from "path";

/**
 * Finds the CScout configuration directory containing host-defs.h and host-incs.h.
 *
 * Search order (matches cswc.pl lines 80-94):
 *   1. .cscout/ in workspace root
 *   2. $CSCOUT_HOME environment variable
 *   3. $HOME/.cscout/
 *   4. /usr/local/include/cscout/ (default install location)
 *   5. /usr/include/cscout/
 */
export function findCscoutHome(workspaceRoot: string): string | null {
    const candidates: (string | undefined)[] = [
        path.join(workspaceRoot, ".cscout"),
        process.env.CSCOUT_HOME,
        process.env.HOME
            ? path.join(process.env.HOME, ".cscout")
            : undefined,
        "/usr/local/include/cscout",
        "/usr/include/cscout",
    ];

    for (const dir of candidates) {
        if (!dir) {
            continue;
        }
        if (
            fs.existsSync(dir) &&
            fs.existsSync(path.join(dir, "host-defs.h")) &&
            fs.existsSync(path.join(dir, "host-incs.h"))
        ) {
            return path.resolve(dir);
        }
    }

    return null;
}

/**
 * Returns the absolute path to host-defs.h inside the given CScout home directory.
 */
export function getHostDefsPath(cscoutHome: string): string {
    return path.join(cscoutHome, "host-defs.h");
}

/**
 * Returns the absolute path to host-incs.h inside the given CScout home directory.
 */
export function getHostIncsPath(cscoutHome: string): string {
    return path.join(cscoutHome, "host-incs.h");
}
