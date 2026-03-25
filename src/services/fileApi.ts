import * as net from "net";

import { makeRequest } from "./functionApi";
export const FILE_FILTERS = {
    ALL_FILES: {
        ro: 1,
        writable: 1,
        match: "Y",
        n: "All Files",
    },

    READ_ONLY: {
        ro: 1,
        match: "Y",
        n: "Read-only Files",
    },

    WRITABLE: {
        writable: 1,
        match: "Y",
        n: "Writable Files",
    },

 

    NO_STATEMENTS: {
        writable: 1,
        c19: 1,
        n19: 0,
        match: "L",
        fre: "\\.[cC]$",
        n: "Writable .c Files Without Any Statements",
    },

    UNPROCESSED_LINES: {
        writable: 1,
        order: 13,
        c13: 4,
        n13: 0,
        reverse: 0,
        match: "L",
        n: "Writable Files Containing Unprocessed Lines",
    },

    CONTAINS_STRINGS: {
        writable: 1,
        c24: 4,
        n24: 0,
        match: "L",
        n: "Writable Files Containing Strings",
    },

    HEADER_WITH_INCLUDES: {
        writable: 1,
        c56: 4,
        n56: 0,
        match: "L",
        fre: "\\.[hH]$",
        n: "Writable .h Files With #include directives",
    },
} as const;
export interface FileItem {
    id: number;
    path: string;
    lines: number;
    tokens: number;
    cppDirectives: number;
    functions: number;
    fileScopedFunctions: number;
    variables: number;
    fileScopedVariables: number;
    includes: number;
    statements?: number;
    ifCount?: number;
    loopCount?: number;
}


export type FileQueryParams = Record<string, string | number>;



export async function fetchFiles(params: FileQueryParams): Promise<FileItem[]> {
    return new Promise((resolve) => {

        const query = new URLSearchParams();
        for (const key in params) {
            query.append(key, String(params[key]));
        }

        const path = `/api/files?${query.toString()}`;


        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {
                console.log("  Connected to server");

                const request =
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`;



                client.write(request);
            }
        );

        let rawData = "";

        client.on("data", (chunk) => {
            const str = chunk.toString();

            rawData += str;
        });

        client.on("end", () => {
            console.log("🔚 CONNECTION ENDED");

            try {


                //   Extract JSON
                const jsonStart = rawData.indexOf("{");

                if (jsonStart === -1) {
                    console.error("  JSON NOT FOUND IN RESPONSE");
                    return resolve([]);
                }

                const jsonString = rawData.slice(jsonStart);
                const parsed = JSON.parse(jsonString);
                resolve(parsed.files || []);

            } catch (err) {
                console.error("  JSON PARSE ERROR:", err);
                resolve([]);
            }
        });

        client.on("error", (err) => {
            console.error("  SOCKET ERROR:", err);
            resolve([]);
        });
    });
}



export interface FileFunction {
    function: string;
    scope: "project" | "file";
    file: string;
    line: number;
}

export async function fetchFileFunctions(fid: number): Promise<FileFunction[]> {
    console.log("[CScout] Fetching file functions for fid:", fid);

    try {
    const base = `fid=${fid}&match=L&ncallerop=0&ncallers=&defined=1&qi=x&n=Functions`;

const [project, file] = await Promise.all([
    makeRequest(`/api/functions?${base}&pscope=1`),
    makeRequest(`/api/functions?${base}&fscope=1`)


]);

       const results: FileFunction[] = [
    ...project.map((f: any): FileFunction => ({
        function: f.function,
        scope: "project",
        file: f.file,
        line: f.line
    })),
    ...file.map((f: any): FileFunction => ({
        function: f.function,
        scope: "file",
        file: f.file,
        line: f.line
    }))
];

        console.log("[CScout] Total functions:", results.length);

        return results;

    } catch (err) {
        console.error("[CScout] Error fetching file functions:", err);
        return [];
    }
}

export interface FileInclude {
    file: string;
    fileid: number;
    direct: boolean;
    writable: boolean;
    unused: boolean;
    tags: string[];
}

export async function fetchFileIncludes(fid: number): Promise<FileInclude[]> {
    return new Promise((resolve) => {

        console.log("Fetching includes for fid:", fid);

        const path = `/api/file/includes?id=${fid}&includes=1`;

        console.log("Request path:", path);

        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {
                console.log("Connected to server");

                const request =
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`;

                client.write(request);
            }
        );

        let rawData = "";

        client.on("data", (chunk) => {
            const str = chunk.toString();
            rawData += str;
        });

        client.on("end", () => {
            console.log("Connection ended");

            try {
                const jsonStart = rawData.indexOf("[");

                if (jsonStart === -1) {
                    console.error("JSON not found in response");
                    return resolve([]);
                }

                const jsonString = rawData.slice(jsonStart);
                const parsed = JSON.parse(jsonString);

                console.log("Parsed includes:", parsed);

                const mapped: FileInclude[] = parsed.map((inc: any) => {

                    const tags: string[] = [];

                    if (inc.direct) tags.push("direct");
                    else tags.push("indirect");

                    if (inc.writable) tags.push("writable");

                    if (inc.unused) tags.push("unused");

                    return {
                        file: inc.file,
                        fileid: inc.fileid,
                        direct: inc.direct,
                        writable: inc.writable,
                        unused: inc.unused,
                        tags
                    };
                });

                console.log("Final mapped includes:", mapped);

                resolve(mapped);

            } catch (err) {
                console.error("JSON parse error:", err);
                resolve([]);
            }
        });

        client.on("error", (err) => {
            console.error("Socket error:", err);
            resolve([]);
        });
    });
}