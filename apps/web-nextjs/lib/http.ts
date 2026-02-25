export class HttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  parser: (value: unknown) => T,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new HttpError(`Request failed (${response.status})`, response.status);
  }

  const json = (await response.json()) as unknown;
  return parser(json);
}
