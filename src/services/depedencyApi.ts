import { requestJSON } from "./request";

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

    const path = `/api/file/dependencies?id=${fid}&type=${type}&dir=${dir}&filter=${filter}`;

    try {
        const data = await requestJSON(path);

        console.log("Parsed dependency data:", data);

        return data || {
            file: "",
            outgoing: [],
            incoming: [],
            bidirectional: []
        };

    } catch (err) {
        console.error("Dependency fetch error:", err);

        return {
            file: "",
            outgoing: [],
            incoming: [],
            bidirectional: []
        };
    }
}