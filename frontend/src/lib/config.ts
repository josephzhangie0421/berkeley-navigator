export type DataMode = "mock" | "live";

/**
 * Read at build time (NEXT_PUBLIC_ vars are inlined into the client bundle).
 * Anything other than "live" falls back to mock, so a missing variable can
 * never make the UI silently pretend to use real Berkeley data.
 */
export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === "live" ? "live" : "mock";
