import { requestJSON, buildQuery } from "./request";

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
        const query = buildQuery(params);
        const path = `/api/functions?${query}`;

        const data = await requestJSON(path);
        return data || [];

    } catch (err) {
        console.error("[CScout] Error fetching functions:", err);
        return [];
    }
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

   const data = await requestJSON(`/api/funlist?${query.toString()}`);
return data as FunListResponse;
}