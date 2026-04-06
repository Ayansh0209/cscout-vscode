import * as child_process from "child_process";
import * as vscode from "vscode";

/**
 * Manages a CScout child process: spawn, readiness detection, and shutdown.
 *
 * CScout prints progress to stderr while processing files, then prints
 * "CScout is now ready to serve you at http://localhost:<port>"
 * once the HTTP server is up. (See cscout.cpp line 4600)
 */

// The exact readiness string CScout emits (from cscout.cpp:4600)
const READY_SIGNAL = "CScout is now ready to serve";

export class CScoutProcess {
    private proc: child_process.ChildProcess | null = null;
    private stderrBuffer = "";
    private port = 8081;
    private outputChannel: vscode.OutputChannel;
    private resolved = false;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel("CScout");
    }

    /**
     * Returns true if a CScout process is currently running.
     */
    isRunning(): boolean {
        return this.proc !== null && this.proc.exitCode === null;
    }

    /**
     * Returns the port CScout is listening on.
     */
    getPort(): number {
        return this.port;
    }

    /**
     * Returns the accumulated stderr output (useful for error diagnostics).
     */
    getStderrOutput(): string {
        return this.stderrBuffer;
    }

    /**
     * Start CScout with the given processing script.
     * Resolves ONLY when CScout prints the exact readiness message:
     *   "CScout is now ready to serve you at http://localhost:<port>"
     * Rejects on timeout, premature exit, or spawn error.
     *
     * Guards: calling start() when already running throws immediately.
     */
    async start(csPath: string, workspaceRoot: string): Promise<void> {
        // Guard: prevent double-start and double-listener attachment
        if (this.isRunning()) {
            throw new Error(
                "CScout is already running. Stop it first with 'CScout: Stop Analysis Server'."
            );
        }

        this.stderrBuffer = "";
        this.resolved = false;
        this.outputChannel.clear();
        this.outputChannel.show(true);
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
            // CScout writes ALL output to stderr. We buffer the
            // entire stream and only resolve when we see the EXACT
            // readiness string. Never resolve on a partial chunk.
            this.proc.stderr?.on("data", (data: Buffer) => {
                const chunk = data.toString();
                this.stderrBuffer += chunk;
                this.outputChannel.append(chunk);

                // Check the accumulated buffer — NOT just the current chunk
                if (
                    !this.resolved &&
                    this.stderrBuffer.includes(READY_SIGNAL)
                ) {
                    this.resolved = true;
                    // Extract port from the full message:
                    // "CScout is now ready to serve you at http://localhost:8081"
                    const portMatch = this.stderrBuffer.match(
                        /localhost:(\d{4,5})/
                    );
                    if (portMatch) {
                        this.port = parseInt(portMatch[1], 10);
                    }
                    resolve();
                }
            });

            // ----- stdout: separate handler, no readiness logic -----
            this.proc.stdout?.on("data", (data: Buffer) => {
                this.outputChannel.append(data.toString());
            });

            // ----- process exit -----
            this.proc.on("exit", (code, signal) => {
                const exitMsg = signal
                    ? `killed by signal ${signal}`
                    : `exited with code ${code}`;
                this.outputChannel.appendLine(
                    `\n[CScout] Process ${exitMsg}`
                );

                // If we haven't resolved yet, this is an error
                if (!this.resolved) {
                    const lastLines = this.stderrBuffer
                        .split("\n")
                        .slice(-20)
                        .join("\n");
                    reject(
                        new Error(
                            `CScout ${exitMsg}.\n\nLast output:\n${lastLines}`
                        )
                    );
                }

                this.proc = null;
            });

            // ----- spawn error (e.g. cscout not found) -----
            this.proc.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ENOENT") {
                    reject(
                        new Error(
                            "cscout not found in PATH. " +
                                "Please install CScout: run 'sudo make install' from the CScout repo."
                        )
                    );
                } else {
                    reject(err);
                }
                this.proc = null;
            });

            // ----- timeout for very large projects -----
            setTimeout(() => {
                if (!this.resolved) {
                    reject(
                        new Error(
                            "CScout took too long to start (>5 min). " +
                                "Check the CScout output channel for errors."
                        )
                    );
                }
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Stop the running CScout process.
     */
    stop(): void {
        if (this.proc) {
            this.outputChannel.appendLine(
                "\n[CScout] Stopping server..."
            );
            this.proc.kill("SIGTERM");
            this.proc = null;
        }
    }

    /**
     * Dispose of the output channel.
     */
    dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}
