import type { DatabaseSync } from "node:sqlite";
export function demoEnabled(): boolean;
export function database(): DatabaseSync;
export function transaction<T>(db: DatabaseSync, work: () => T): T;
