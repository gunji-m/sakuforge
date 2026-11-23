import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { expect, test } from "vitest";
import configFor from "../../next.config";
import { config } from "../../proxy";
import { API_CONTENT_SECURITY_POLICY } from "./security-headers";

const nextConfig = configFor(PHASE_PRODUCTION_SERVER);
const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url, nextConfig });

test("画像の最適化の入口（/_next/image）は閉じ、存在しない path と同じ 404 のページにする", () => {
  expect(nextConfig.images?.unoptimized).toBe(true);
});

test.each([
  "/",
  "/nope",
  "/robots.txt",
  "/favicon.ico",
  "/icon.svg.bak",
  "/third-party-notices.txt.bak",
  "/_next/image",
  "/_next/image?url=x",
  "/_next/image?url=%2F&w=64&q=75",
  "/_next/imagefoo",
  "/_next/image/x",
  "/_next/images",
  "/_next/image.png",
])("ページと、存在しない path の 404（%s）には、nonce 付きの CSP を付ける", (path) => {
  expect(matches(path)).toBe(true);
});

test.each([
  "/icon.svg",
  "/third-party-notices.txt",
  "/api/inspect",
  "/_next/static/chunks/main.js",
])("静的なファイルと API（%s）には、ページ用の CSP を付けない", (path) => {
  expect(matches(path)).toBe(false);
});

test.each(["/icon.svg", "/third-party-notices.txt"])(
  "静的なファイル（%s）には、何も読み込ませない CSP を付ける",
  async (source) => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const rule = rules.find((r) => r.source === source);
    expect(rule?.headers).toEqual([
      { key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
    ]);
  },
);
