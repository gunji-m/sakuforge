import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import {
  loadRealStockMaster,
  REAL_STOCK_MASTER_FILE,
  readRealStockMasterJson,
  usesRealStockMaster,
} from "./src/server/current-stock-master";
import { API_CONTENT_SECURITY_POLICY, COMMON_HEADERS } from "./src/server/security-headers";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  transpilePackages: ["@sakuforge/core"],
  // The Production build writes the real stock master here; ship it with the server function only.
  outputFileTracingIncludes: { "/api/inspect": [`./${REAL_STOCK_MASTER_FILE}`] },
  // The Content-Security-Policy of pages carries a nonce, so it is set in proxy.ts.
  headers: async () => [
    { source: "/:path*", headers: [...COMMON_HEADERS] },
    {
      source: "/api/:path*",
      headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }],
    },
    // The icon and the notices are static files with nothing to load, so they get the same
    // policy as the API.
    {
      source: "/icon.svg",
      headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }],
    },
    {
      source: "/third-party-notices.txt",
      headers: [{ key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY }],
    },
  ],
};

/**
 * The Production build is the gate of the real stock master (docs/design.md 4.3, 4.4): when it is
 * missing or fails validation, the build fails and the previous deployment stays. It never falls
 * back to the synthetic master. The message carries the fixed reason only.
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && usesRealStockMaster(process.env)) {
    const loaded = loadRealStockMaster(new Date(), readRealStockMasterJson);
    if (loaded.kind !== "loaded") {
      throw new Error(`stock master rejected: ${loaded.reason}`);
    }
    console.log(`stock master validated: ${loaded.stockMaster.size} stocks as of ${loaded.asOf}`);
  }
  return nextConfig;
}
