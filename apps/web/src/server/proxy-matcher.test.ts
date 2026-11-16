import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { expect, test } from "vitest";
import configFor from "../../next.config";
import { config } from "../../proxy";
import { API_CONTENT_SECURITY_POLICY } from "./security-headers";

const nextConfig = configFor(PHASE_PRODUCTION_SERVER);
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url, nextConfig });

test.each(["/", "/nope", "/robots.txt", "/favicon.ico", "/icon.svg.bak"])(
  "ページと、存在しない path の 404（%s）には、nonce 付きの CSP を付ける",
  (path) => {
    expect(matches(path)).toBe(true);
  },
);

test.each(["/icon.svg", "/api/inspect", "/_next/static/chunks/main.js", "/_next/image?url=x"])(
  "静的なファイルと API（%s）には、ページ用の CSP を付けない",
  (path) => {
    expect(matches(path)).toBe(false);
  },
);

test("静的なアイコンには、何も読み込ませない CSP を付ける", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const icon = rules.find((rule) => rule.source === "/icon.svg");
  expect(icon?.headers).toEqual([
    { key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
  ]);
});
