import { expect, test } from "vitest";
import {
  API_CONTENT_SECURITY_POLICY,
  COMMON_HEADERS,
  pageContentSecurityPolicy,
} from "./security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values];
    }),
  );
}

test("the page policy runs scripts and styles only from this origin or with the nonce", () => {
  const policy = directives(pageContentSecurityPolicy("bm9uY2U=", false));
  expect(policy.get("default-src")).toEqual(["'self'"]);
  expect(policy.get("script-src")).toEqual(["'self'", "'nonce-bm9uY2U='", "'strict-dynamic'"]);
  expect(policy.get("style-src")).toEqual(["'self'", "'nonce-bm9uY2U='"]);
  expect(policy.get("connect-src")).toEqual(["'self'"]);
  expect(policy.get("object-src")).toEqual(["'none'"]);
  expect(policy.get("base-uri")).toEqual(["'none'"]);
  expect(policy.get("form-action")).toEqual(["'none'"]);
  expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
});

test("the production page policy allows neither inline code nor eval", () => {
  const policy = pageContentSecurityPolicy("bm9uY2U=", false);
  expect(policy).not.toContain("unsafe-inline");
  expect(policy).not.toContain("unsafe-eval");
});

test("the development page policy relaxes only what React needs while developing", () => {
  const policy = directives(pageContentSecurityPolicy("bm9uY2U=", true));
  expect(policy.get("script-src")).toContain("'unsafe-eval'");
  expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
  expect(policy.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
});

test("a nonce that could break out of the policy is refused", () => {
  for (const nonce of ["", "a b", "a'; script-src *", "a;b", "a\nb"]) {
    expect(() => pageContentSecurityPolicy(nonce, false)).toThrow();
  }
});

test("an API response may load nothing", () => {
  expect(API_CONTENT_SECURITY_POLICY).toBe("default-src 'none'; frame-ancestors 'none'");
});

test("every response is kept out of search engines and out of frames", () => {
  const headers = new Map(COMMON_HEADERS.map((header) => [header.key, header.value]));
  expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  expect(headers.get("X-Frame-Options")).toBe("DENY");
  expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(headers.get("Referrer-Policy")).toBe("no-referrer");
});
