import { TendError } from "../services/errors";

export function output(data: any, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function handleError(err: unknown, json: boolean): void {
  if (err instanceof TendError) {
    if (json) {
      console.error(JSON.stringify(err.toJSON(), null, 2));
    } else {
      console.error(`Error [${err.code}]: ${err.message}`);
    }
  } else {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.error(JSON.stringify({ error: { code: "DB_ERROR", message } }, null, 2));
    } else {
      console.error(`Error: ${message}`);
    }
  }
  process.exit(1);
}
