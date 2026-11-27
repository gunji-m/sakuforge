import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { proxy } from "../../proxy";
import { API_CONTENT_SECURITY_POLICY } from "./security-headers";

function request(method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/", { method, headers });
}

test.each(["POST", "PUT", "DELETE", "PATCH", "OPTIONS"])(
  "ページへの %s は 405 にし、Next.js まで通さない",
  (method) => {
    const response = proxy(request(method, { "Next-Action": "SYNTHETIC" }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
    expect(response.headers.get("Content-Security-Policy")).toBe(API_CONTENT_SECURITY_POLICY);
    // Not a pass-through: Next.js would render the page for NextResponse.next().
    expect(response.headers.get("x-middleware-next")).toBeNull();
  },
);

test.each(["GET", "HEAD"])("ページへの %s は、nonce 付きの CSP を付けて通す", (method) => {
  const response = proxy(request(method));
  expect(response.status).toBe(200);
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("Content-Security-Policy")).toMatch(/'nonce-[^']+'/);
});

test("ページの CSP は、応答と描画へ渡す要求の両方に同じ nonce で付き、本番では eval と inline を許さない", () => {
  const response = proxy(request("GET"));
  const policy = response.headers.get("Content-Security-Policy");
  expect(policy).toMatch(/'nonce-[^']+'/);
  // Next.js reads the policy and the nonce from these request headers while rendering.
  expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  const nonce = response.headers.get("x-middleware-request-x-nonce");
  expect(nonce).not.toBeNull();
  expect(policy).toContain(`'nonce-${nonce}'`);
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toContain("'unsafe-inline'");
});

test("nonce は応答ごとに変わる", () => {
  const first = proxy(request("GET")).headers.get("x-middleware-request-x-nonce");
  const second = proxy(request("GET")).headers.get("x-middleware-request-x-nonce");
  expect(first).not.toBeNull();
  expect(first).not.toBe(second);
});
