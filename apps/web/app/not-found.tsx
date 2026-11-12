import { connection } from "next/server";

export default async function NotFound() {
  // Rendered per request, for the same reason as the page.
  await connection();
  return (
    <main className="main">
      <section className="card empty">
        <h2>ページが見つかりません</h2>
        <p>
          <a href="/">sakuforge を開く</a>
        </p>
      </section>
    </main>
  );
}
