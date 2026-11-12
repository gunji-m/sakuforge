import { type NextRequest, NextResponse } from "next/server";
import { pageContentSecurityPolicy } from "./src/server/security-headers";

/**
 * Gives each page response its own nonce. Next.js reads the policy from the request
 * headers while rendering and puts the nonce on the scripts and styles it emits.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = pageContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Pages only. The API and static files get their headers from next.config.ts.
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)" }],
};
