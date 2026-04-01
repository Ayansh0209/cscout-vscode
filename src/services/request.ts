import net from "net";


export function rawRequest(path: string): Promise<string> {
    return new Promise((resolve) => {
        const client = net.createConnection(
            { host: "127.0.0.1", port: 8081 },
            () => {
                client.write(
                    `GET ${path} HTTP/1.1\r\n` +
                    `Host: localhost\r\n` +
                    `Connection: close\r\n\r\n`
                );
            }
        );

        let data = "";

        client.on("data", chunk => data += chunk.toString());
        client.on("end", () => resolve(data));
        client.on("error", () => resolve(""));
    });
}


export function extractBody(raw: string): string {
    const parts = raw.split("\r\n\r\n");
    return parts.length > 1 ? parts.slice(1).join("\r\n\r\n") : raw;
}


export async function requestJSON(path: string): Promise<any> {
    try {
        const raw = await rawRequest(path);
        const body = extractBody(raw);

        const start = Math.min(
            ...["{", "["]
                .map(c => body.indexOf(c))
                .filter(i => i !== -1)
        );

        if (start === Infinity) return null;

        return JSON.parse(body.slice(start));
    } catch {
        return null;
    }
}

/* HTML request */
export async function requestHTML(path: string): Promise<string> {
    const raw = await rawRequest(path);
    return extractBody(raw);
}

/*  Query builder */
export function buildQuery(params: Record<string, any>): string {
    const query = new URLSearchParams();

    for (const key in params) {
        if (params[key] !== undefined) {
            query.append(key, String(params[key]));
        }
    }

    return query.toString();
}