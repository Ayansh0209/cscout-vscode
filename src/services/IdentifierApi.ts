import { requestJSON, requestHTML, buildQuery } from "./request";
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


/* ---------------- IDENTIFIERS ---------------- */
export async function fetchIdentifiers(filters?: IdentifierFilters): Promise<Identifier[]> {

    let path = "/api/identifiers";

    if (filters) {
        const query = buildQuery({
            readonly: filters.readonly,
            unused: filters.unused,
            macro: filters.macro,
            function: filters.function,
            typedef: filters.typedef,
            struct: filters.struct,
            member: filters.member,
            variable: filters.variable
        });

        if (query) path += `?${query}`;
    }

    try {
        const data = await requestJSON(path);

        console.log("Identifiers loaded:", data?.length, "| Filters:", filters);

        return data || [];
    } catch (err) {
        console.error("Identifier fetch error:", err);
        return [];
    }
}



export async function fetchIdentifierFunctions(id: string): Promise<any[]> {
    console.log("[CScout] Fetching functions for id:", id);

    try {
        const data = await requestJSON(`/api/functions?id=${id}`);
        console.log("[CScout] Parsed functions:", data.length);
        return data;
    } catch (err) {
        console.error("[CScout] Error fetching identifier functions:", err);
        return [];
    }
}
export async function fetchIdentifierFiles(id: string): Promise<any[]> {

    console.log("[CScout] Fetching files for id:", id);

    try {
        const html = await requestHTML(`/xiquery.html?ec=${id}&qf=1`);

        const files: any[] = [];
        const regex = /<a[^>]*>([^<]+\.(c|cpp|h))<\/a>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            const fileName = match[1].trim();
            console.log("[CScout] Found file:", fileName);
            files.push({ file: fileName });
        }

        console.log("[CScout] Total files parsed:", files.length);

        return files;

    } catch (err) {
        console.error("[CScout] File parse error:", err);
        return [];
    }
}

export async function fetchIdentifierLocations(id: string): Promise<any[]> {

    try {
        const data = await requestJSON(`/api/identifier/locations?id=${id}`);
        return data || [];
    } catch {
        return [];
    }
}
