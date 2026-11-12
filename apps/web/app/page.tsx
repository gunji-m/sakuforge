import { connection } from "next/server";
import { Dashboard } from "../src/client/dashboard";

export default async function Page() {
  // Rendered per request, so that the nonce of the Content-Security-Policy reaches the scripts.
  await connection();
  return <Dashboard />;
}
