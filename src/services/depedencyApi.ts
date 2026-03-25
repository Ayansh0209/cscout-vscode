// src/services/dependencyApi.ts

import * as net from "net";

export type DependencyType = "C" | "F" | "G"; // Compile / Calls / Data
export type DependencyDirection = "D" | "U"; // Depends / Used By
export type DependencyFilter = "writable" | "all";

export interface DependencyResult {
    file: string;
    outgoing: string[];
    incoming: string[];
    bidirectional: string[];
}

export async function fetchDependencies(
    fid: number,
    type: DependencyType,
    dir: DependencyDirection,
    filter: DependencyFilter
): Promise<DependencyResult> {

    return new Promise((resolve) => {

        const path = `/api/file/dependencies?id=${fid}&type=${type}&dir=${dir}&filter=${filter}`;

        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {

                console.log("Connected to dependency API");

                const request =
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`;

                console.log("Request:", path);

                client.write(request);
            }
        );

        let rawData = "";

        client.on("data", (chunk) => {
            rawData += chunk.toString();
        });

        client.on("end", () => {

            console.log("Dependency API response received");

            try {
                const jsonStart = rawData.indexOf("{");

                if (jsonStart === -1) {
                    console.error("JSON not found in response");
                    return resolve({
                        file: "",
                        outgoing: [],
                        incoming: [],
                        bidirectional: []
                    });
                }

                const jsonString = rawData.slice(jsonStart);
                const parsed = JSON.parse(jsonString);

                console.log("Parsed dependency data:", parsed);

                resolve(parsed);

            } catch (err) {
                console.error("Dependency parse error:", err);

                resolve({
                    file: "",
                    outgoing: [],
                    incoming: [],
                    bidirectional: []
                });
            }
        });

        client.on("error", (err) => {
            console.error("Socket error:", err);

            resolve({
                file: "",
                outgoing: [],
                incoming: [],
                bidirectional: []
            });
        });
    });
}