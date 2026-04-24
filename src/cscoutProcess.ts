import * as child_process from "child_process";
import * as fs from "fs";
import * as vscode from "vscode";

/**
 * Manages CScout tool processes: csmake, cswc, and the cscout server.
 *
 * Handles:
 *   - Running csmake (make clean → csmake → make.cs)
 *   - Running cswc   (project.prj → project.cs via stdout pipe)
 *   - Spawning cscout server and detecting readiness
 *   - Process lifecycle (single instance, SIGTERM cleanup)
 */

// The exact readiness string CScout emits (cscout.cpp line 4600)
const READY_SIGNAL = "CScout is now ready to serve";

export class CScoutProcess {
    private proc: child_process.ChildProcess | null = null;
    private stderrBuffer = "";
    private port = 8081;
    private resolved = false;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel("CScout");
    }

    // -----------------------------------------------------------------------
    // Status queries
    // -----------------------------------------------------------------------

    isRunning(): boolean {
        return this.proc !== null && this.proc.exitCode === null;
    }

    getPort(): number {
        return this.port;
    }

    // -----------------------------------------------------------------------
    // Pipeline runners
    // -----------------------------------------------------------------------

    /**
     * Run `make clean` followed by `csmake` in the workspace.
     *
     * csmake spies on the make process and generates `make.cs`.
     * Returns the path to `make.cs` on success.
     * Throws on failure (caller should fall back to cswc).
     */
    async runCsmake(workspaceRoot: string): Promise<string> {
        this.outputChannel.appendLine("[Pipeline] Running csmake pipeline...");

        // Step 1: make clean (best effort — ignore errors)
        try {
            this.outputChannel.appendLine("[Pipeline] Running make clean...");
            child_process.execSync("make clean", {
                cwd: workspaceRoot,
                stdio: "ignore",
                timeout: 30_000,
            });
        } catch {
            this.outputChannel.appendLine(
                "[Pipeline] make clean skipped (no clean target)"
            );
        }

        // Step 2: csmake
        this.outputChannel.appendLine("[Pipeline] Running csmake...");
        return new Promise<string>((resolve, reject) => {
            const proc = child_process.spawn("csmake", [], {
                cwd: workspaceRoot,
            });

            let stderr = "";

            proc.stdout?.on("data", (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            proc.stderr?.on("data", (data: Buffer) => {
                const chunk = data.toString();
                stderr += chunk;
                this.outputChannel.append(chunk);
            });

            proc.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ENOENT") {
                    reject(new Error("csmake not found in PATH."));
                } else {
                    reject(err);
                }
            });

            proc.on("exit", (code) => {
                const csPath = `${workspaceRoot}/make.cs`;
                if (code === 0 && fs.existsSync(csPath)) {
                    this.outputChannel.appendLine(
                        "[Pipeline] csmake succeeded → make.cs"
                    );
                    resolve(csPath);
                } else {
                    reject(
                        new Error(
                            `csmake exited with code ${code}.\n${stderr.slice(-500)}`
                        )
                    );
                }
            });
        });
    }

    /**
     * Run `cswc` on a .prj file to produce a .cs processing script.
     *
     * cswc writes the .cs content to stdout. We pipe it into project.cs.
     * Returns the path to `project.cs` on success.
     */
    async runCswc(
        prjPath: string,
        workspaceRoot: string
    ): Promise<string> {
        this.outputChannel.appendLine(
            `[Pipeline] Running cswc ${prjPath}...`
        );

        return new Promise<string>((resolve, reject) => {
            const proc = child_process.spawn("cswc", [prjPath], {
                cwd: workspaceRoot,
            });

            const csPath = `${workspaceRoot}/project.cs`;
            const outStream = fs.createWriteStream(csPath);
            let stderr = "";

            // cswc writes the .cs content to stdout
            proc.stdout?.pipe(outStream);

            proc.stderr?.on("data", (data: Buffer) => {
                const chunk = data.toString();
                stderr += chunk;
                this.outputChannel.append(chunk);
            });

            proc.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ENOENT") {
                    reject(
                        new Error(
                            "CScout tools not installed. Please run: sudo make install"
                        )
                    );
                } else {
                    reject(err);
                }
            });

            proc.on("exit", (code) => {
                outStream.end(() => {
                    if (code === 0 && fs.existsSync(csPath)) {
                        this.outputChannel.appendLine(
                            "[Pipeline] cswc succeeded → project.cs"
                        );
                        resolve(csPath);
                    } else {
                        reject(
                            new Error(
                                `cswc exited with code ${code}.\n${stderr.slice(-500)}`
                            )
                        );
                    }
                });
            });
        });
    }

    // -----------------------------------------------------------------------
    // CScout server
    // -----------------------------------------------------------------------

    /**
     * Start the CScout analysis server with the given .cs file.
     *
     * Resolves ONLY when CScout prints:
     *   "CScout is now ready to serve you at http://localhost:<port>"
     *
     * Guards: kills any previous process before starting.
     */
    async startServer(
        csPath: string,
        workspaceRoot: string
    ): Promise<void> {
        // Kill previous process if running
        if (this.proc) {
            this.outputChannel.appendLine(
                "[CScout] Killing previous CScout process..."
            );
            this.proc.kill("SIGTERM");
            this.proc = null;
        }

        this.stderrBuffer = "";
        this.resolved = false;
        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
            `[CScout] Starting: cscout ${csPath}`
        );
        this.outputChannel.appendLine(
            `[CScout] Working directory: ${workspaceRoot}`
        );
        this.outputChannel.appendLine("");

        return new Promise<void>((resolve, reject) => {
            this.proc = child_process.spawn("cscout", [csPath], {
                cwd: workspaceRoot,
                env: { ...process.env },
            });

            // ----- stderr: progress + readiness detection -----
            this.proc.stderr?.on("data", (data: Buffer) => {
                const chunk = data.toString();
                this.stderrBuffer += chunk;
                this.outputChannel.append(chunk);

                // Check accumulated buffer for exact readiness signal
                if (
                    !this.resolved &&
                    this.stderrBuffer.includes(READY_SIGNAL)
                ) {
                    this.resolved = true;
                    // Extract port: "localhost:8081"
                    const portMatch = this.stderrBuffer.match(
                        /localhost:(\d{4,5})/
                    );
                    if (portMatch) {
                        this.port = parseInt(portMatch[1], 10);
                    }
                    resolve();
                }
            });

            // ----- stdout -----
            this.proc.stdout?.on("data", (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            // ----- exit -----
            this.proc.on("exit", (code, signal) => {
                const msg = signal
                    ? `killed by signal ${signal}`
                    : `exited with code ${code}`;
                this.outputChannel.appendLine(
                    `\n[CScout] Process ${msg}`
                );

                if (!this.resolved) {
                    const lastLines = this.stderrBuffer
                        .split("\n")
                        .slice(-20)
                        .join("\n");
                    reject(
                        new Error(
                            `CScout ${msg}.\n\nLast output:\n${lastLines}`
                        )
                    );
                }

                this.proc = null;
            });

            // ----- spawn error -----
            this.proc.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ENOENT") {
                    reject(
                        new Error(
                            "cscout not found in PATH. " +
                                "Please run: sudo make install"
                        )
                    );
                } else {
                    reject(err);
                }
                this.proc = null;
            });

            // ----- timeout -----
            setTimeout(() => {
                if (!this.resolved) {
                    reject(
                        new Error(
                            "CScout took too long to start (>5 min). " +
                                "Check the CScout output channel."
                        )
                    );
                }
            }, 5 * 60 * 1000);
        });
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    stop(): void {
        if (this.proc) {
            this.outputChannel.appendLine(
                "\n[CScout] Stopping server..."
            );
            this.proc.kill("SIGTERM");
            this.proc = null;
        }
    }

    showOutput(): void {
        this.outputChannel.show(true);
    }

    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}
