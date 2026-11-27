import { type NextRequest, NextResponse } from "next/server";
import {
  API_CONTENT_SECURITY_POLICY,
  pageContentSecurityPolicy,
} from "./src/server/security-headers";

/**
 * Gives each page response its own nonce. Next.js reads the policy from the request
 * headers while rendering and puts the nonce on the scripts and styles it emits.
 */
export function proxy(request: NextRequest) {
  // Pages only answer GET and HEAD. Other methods never reach Next.js, so a Server Action-shaped
  // POST cannot make it write the request's header text and a stack trace to the logs (#257).
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Security-Policy": API_CONTENT_SECURITY_POLICY },
    });
  }
  // Paths under /api/ other than the inspect API are not-found pages that keep the API's policy from
  // next.config.ts (#176). Only the method check above applies to them (#260).
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
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
  // Pages, including not-found pages for any other path (under /api/ too, for the method check). The
  // inspect API, Next.js's static files, the static icon and the third-party notices get their
  // headers from next.config.ts.
  matcher: [
    { source: "/((?!api/inspect$|_next/static/|icon\\.svg$|third-party-notices\\.txt$).*)" },
  ],
};
