export type ErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "DB_ERROR" | "CONFIG_ERROR";

export class TendError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "TendError";
  }

  toJSON() {
    return { error: { code: this.code, message: this.message } };
  }
}
