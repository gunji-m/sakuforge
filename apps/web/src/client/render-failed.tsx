"use client";

import { MESSAGES } from "./messages";

/**
 * Shown when the screen itself could not be drawn. Only the fixed text is shown: the
 * exception, its stack and stored values are neither displayed nor sent anywhere.
 */
export function RenderFailed() {
  return (
    <main className="main">
      <section className="card empty" role="alert">
        <h2>{MESSAGES.renderFailed}</h2>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </section>
    </main>
  );
}
