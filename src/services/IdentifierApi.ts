import * as net from "net";
import {makeRequest} from "./functionApi";
export type Identifier = {
    id: string;
    name: string;
    type?: string;
    unused?: boolean;
    readonly?: boolean;
    writable?: boolean;
    fileSpanning?: boolean;
};

export interface IdentifierFilters {
    readonly?: boolean;
    unused?: boolean;
    macro?: boolean;
    function?: boolean;
    typedef?: boolean;
    struct?: boolean;
    member?: boolean;
    variable?: boolean;
}
/* Extract JSON safely from mixed HTTP response */
function extractJSON(raw: string): any {
    const startArray = raw.indexOf("[");
    const startObject = raw.indexOf("{");

    let start = -1;

    if (startArray !== -1 && startObject !== -1) {
        start = Math.min(startArray, startObject);
    } else {
        start = Math.max(startArray, startObject);
    }

    if (start === -1) {
        throw new Error("No JSON found in response");
    }

    const jsonText = raw.slice(start);

    return JSON.parse(jsonText);
}

/* ---------------- IDENTIFIERS ---------------- */
export async function fetchIdentifiers(filters?: IdentifierFilters): Promise<Identifier[]> {
    return new Promise((resolve) => {

        //   Build query string ONLY if filters exist
        let path = "/api/identifiers";

        if (filters) {
            const queryParams = new URLSearchParams();

            if (filters.readonly) queryParams.append("readonly", "true");
            if (filters.unused) queryParams.append("unused", "true");
            if (filters.macro) queryParams.append("macro", "true");

            if (filters.function) queryParams.append("function", "true");
            if (filters.typedef) queryParams.append("typedef", "true");
            if (filters.struct) queryParams.append("struct", "true");
            if (filters.member) queryParams.append("member", "true");
            if (filters.variable) queryParams.append("variable", "true");

            const queryString = queryParams.toString();
            if (queryString) {
                path += `?${queryString}`;
            }
        }

        const client = net.createConnection(
            { host: "localhost", port: 8081 },
            () => {
                client.write(
                    `GET ${path} HTTP/1.1\r\n` +
                    "Host: localhost\r\n" +
                    "Connection: close\r\n\r\n"
                );
            }
        );

        let data = "";

        client.on("data", chunk => {
            data += chunk.toString();
        });

        client.on("end", () => {
            try {
                const json = extractJSON(data);

                console.log("Identifiers loaded:", json.length, "| Filters:", filters);

                resolve(json);
            } catch (err) {
                console.error("Identifier parse error:", err);
                console.error("RAW RESPONSE:", data);
                resolve([]);
            }
        });

        client.on("error", (err) => {
            console.error("Socket error:", err);
            resolve([]);
        });
    });
}



export async function fetchIdentifierFunctions(id: string): Promise<any[]> {
    console.log("[CScout] Fetching functions for id:", id);

    try {
        const data = await makeRequest(`/api/functions?id=${id}`);
        console.log("[CScout] Parsed functions:", data.length);
        return data;
    } catch (err) {
        console.error("[CScout] Error fetching identifier functions:", err);
        return [];
    }
}
export async function fetchIdentifierFiles(id: string): Promise<any[]> {
    return new Promise((resolve) => {

        console.log("[CScout] Fetching files for id:", id);

        const client = net.createConnection(
            { host: "localhost", port: 8081 },
            () => {
                const request =
                    `GET /xiquery.html?ec=${id}&qf=1 HTTP/1.1\r\n` +
                    "Host: localhost\r\n" +
                    "Connection: close\r\n\r\n";

                console.log("[CScout] File request sent:\n", request);

                client.write(request);
            }
        );

        let data = "";

        client.on("data", chunk => {
            data += chunk.toString();
        });

        client.on("end", () => {
            try {
                console.log("[CScout] Raw file response length:", data.length);

                const parts = data.split("\r\n\r\n");
                const body = parts.length > 1 ? parts[1] : data;

                console.log("[CScout] File body preview:\n", body.slice(0, 500));

                const files: any[] = [];

                // Extract file names from HTML table
                const regex = /<a[^>]*>([^<]+\.(c|cpp|h))<\/a>/g;

                let match;
                while ((match = regex.exec(body)) !== null) {
                    const fileName = match[1].trim();

                    console.log("[CScout] Found file:", fileName);

                    files.push({ file: fileName });
                }

                console.log("[CScout] Total files parsed:", files.length);

                resolve(files);

            } catch (err) {
                console.error("[CScout] File parse error:", err);
                console.error("[CScout] Full raw response:\n", data);
                resolve([]);
            }
        });

        client.on("error", (err) => {
            console.error("[CScout] Socket error:", err);
            resolve([]);
        });
    });
}

export async function fetchIdentifierLocations(id: string): Promise<any[]> {
    return new Promise((resolve) => {

        const client = net.createConnection(
            { host: "localhost", port: 8081 },
            () => {
                client.write(
                    `GET /api/identifier/locations?id=${id} HTTP/1.1\r\n` +
                    "Host: localhost\r\n" +
                    "Connection: close\r\n\r\n"
                );
            }
        );

        let data = "";

        client.on("data", chunk => data += chunk.toString());

        client.on("end", () => {
            try {
                const body = data.split("\r\n\r\n")[1];
                const json = JSON.parse(body);

                resolve(json);
            } catch {
                resolve([]);
            }
        });

        client.on("error", () => resolve([]));
    });
}
