import type { NextFunction, Request, Response, RequestHandler } from "express";

/** Error carrying an HTTP status code, thrown from routes and handled centrally. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Wrap an async route handler so rejected promises reach Express' error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Assert a value is present, else throw a 400. Narrows the type for callers. */
export function required<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || value === "") {
    throw new HttpError(400, `Missing required field: ${name}`);
  }
  return value;
}
