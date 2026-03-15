import { randomUUIDv7 } from "bun";

export function genId(prefix: string): string {
  const uuid = randomUUIDv7().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}
