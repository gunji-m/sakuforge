import { connection } from "next/server";
import { MESSAGES } from "../src/client/messages";

export default async function NotFound() {
  // Rendered per request, for the same reason as the page.
  await connection();
  return (
    <main className="main">
      <section className="card empty">
        <h2>{MESSAGES.notFound}</h2>
        <p>
          <a href="/">SakuForge を開く</a>
        </p>
      </section>
    </main>
  );
}
