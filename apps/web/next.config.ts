import type { NextConfig } from "next";
import { API_CONTENT_SECURITY_POLICY, COMMON_HEADERS } from "./src/server/security-headers";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  transpilePackages: ["@sakuforge/core"],
  // The Content-Security-Policy of pages carries a nonce, so it is set in proxy.ts.
  headers: async () => [
    { source: "/:path*", headers: [...COMMON_HEADERS] },
    {
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }],
    },
  ],
};

export default nextConfig;
