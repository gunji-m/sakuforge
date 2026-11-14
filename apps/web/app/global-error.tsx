"use client";

import { RenderFailed } from "../src/client/render-failed";
import "./globals.css";

/** Replaces the root layout when the layout itself fails, so it carries its own document. */
export default function GlobalError() {
  return (
    <html lang="ja">
      <body>
        <title>SakuForge</title>
        <RenderFailed />
      </body>
    </html>
  );
}
