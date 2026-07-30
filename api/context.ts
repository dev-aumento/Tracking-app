import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { SafeUser } from "./queries/users";
import { authenticateRequest, getSessionTokenFromHeaders } from "./lib/auth";
import { DEV_USER, isAuthDisabled } from "./lib/dev-mode";
import { ensureSchema } from "./lib/migrate";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: SafeUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  if (isAuthDisabled()) {
    return { req: opts.req, resHeaders: opts.resHeaders, user: DEV_USER };
  }

  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  const token = getSessionTokenFromHeaders(opts.req.headers, opts.req.url);
  if (!token) {
    return ctx;
  }

  try {
    await ensureSchema();
    ctx.user = await authenticateRequest(opts.req.headers, opts.req.url);
  } catch {
    // Invalid or expired session
  }

  return ctx;
}
