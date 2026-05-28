import { json, type ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/db/index.server";
import { notifications } from "~/db/schema.server";
import { eq } from "drizzle-orm";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  db.update(notifications).set({ read: true }).where(eq(notifications.read, false)).run();
  return json({ ok: true });
}
