/**
 * The headers and the robots meta every response must carry (docs/design.md 7.1, #251). These read
 * the real configuration, so removing a line from next.config.ts or app/layout.tsx fails here.
 */
import { PHASE_PRODUCTION_SERVER } from "next/constants";
import { expect, test } from "vitest";
import { metadata } from "../../app/layout";
import configFor from "../../next.config";
import { API_CONTENT_SECURITY_POLICY, COMMON_HEADERS } from "./security-headers";

const nextConfig = configFor(PHASE_PRODUCTION_SERVER);

test("すべての応答に、共通の 4 つのヘッダー（X-Robots-Tag を含む）を付ける", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((rule) => rule.source === "/:path*");
  expect(all?.headers).toEqual([...COMMON_HEADERS]);
  expect(all?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
});

test("X-Powered-By を付けない", () => {
  expect(nextConfig.poweredByHeader).toBe(false);
});

test("ページに robots の meta（noindex, nofollow）を入れる", () => {
  expect(metadata.robots).toEqual({ index: false, follow: false });
});

test("検査 API と /api/ の下のすべての応答に、何も読み込ませない CSP を付ける", async () => {
  const rules = (await nextConfig.headers?.()) ?? [];
  const api = rules.find((rule) => rule.source === "/api/:path*");
  expect(api?.headers).toEqual([
    { key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
  ]);
});
