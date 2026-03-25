// import { makeRequest } from "./functionApi"; 

export interface CScoutFunction {
    function: string;
    fileid: number;
}

export const FUNCTION_FILTERS = {

    ALL_FUNCTIONS: {
        match: "L",
        qi: "x",
        ncallerop: 0,
        ncallers: "",
        n: "All Functions",
    },

    PROJECT_WRITABLE: {
        writable: 1,
        pscope: 1,
        match: "L",
        ncallerop: 0,
        ncallers: "",
        qi: "x",
        n: "Project-scoped Writable Functions",
    },

    FILE_WRITABLE: {
        writable: 1,
        fscope: 1,
        match: "L",
        ncallerop: 0,
        ncallers: "",
        qi: "x",
        n: "File-scoped Writable Functions",
    },

    WRITABLE_NOT_CALLED: {
        writable: 1,
        match: "Y",
        ncallerop: 1,
        ncallers: 0,
        qi: "x",
        n: "Writable Functions Not Called",
    },

    WRITABLE_CALLED_ONCE: {
        writable: 1,
        match: "Y",
        ncallerop: 1,
        ncallers: 1,
        qi: "x",
        n: "Writable Functions Called Once",
    },

} as const;


export type FunctionQueryParams = Record<string, string | number>;


export async function fetchFunctions(
    params: FunctionQueryParams
): Promise<CScoutFunction[]> {

    console.log("[CScout] Fetching functions with params:", params);

    try {
        const query = new URLSearchParams();

        for (const key in params) {
            query.append(key, String(params[key]));
        }

        const path = `/api/functions?${query.toString()}`;

        return await makeRequest(path);

    } catch (err) {
        console.error("[CScout] Error fetching functions:", err);
        return [];
    }
}
import net from "net";


export function makeRequest(path: string): Promise<any> {
    return new Promise((resolve) => {

        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {
                const request =
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`;

                client.write(request);
            }
        );

        let data = "";

        client.on("data", chunk => {
            data += chunk.toString();
        });

        client.on("end", () => {
            try {
                // Strip HTTP headers — take everything after the first blank line
                const body = data.split("\r\n\r\n").slice(1).join("\r\n\r\n").trim();
                const parsed = JSON.parse(body);
                resolve(parsed);
            } catch (err) {
                console.error("[Network] JSON parse error:", err);
                console.error("[Network] Raw response:", data.substring(0, 500));
                resolve(null);   // null so callers can distinguish "failed" from "empty array"
            }
        });

        client.on("error", (err) => {
            console.error("[Network] Socket error:", err);
            resolve(null);
        });
    });
}

export interface CallTreeNode {
    id: string;
    name: string;
    is_macro: boolean;
    is_file_scoped: boolean;
    children: CallTreeNode[];
}

export interface FunListResponse {
    id: string;
    name: string;
    direction: "callees" | "callers";
    children: CallTreeNode[];
}

export async function fetchFunctionRelations(params: {
    f: string;
    n: "d" | "u" | "D" | "U";
    depth?: number;
}): Promise<FunListResponse> {
    const query = new URLSearchParams({ f: params.f, n: params.n });
    if (params.depth !== undefined) {
        query.append("depth", String(params.depth));
    }

    return makeRequest(`/api/funlist?${query.toString()}`) as unknown as Promise<FunListResponse>;
}