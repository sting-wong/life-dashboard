import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db/index.server";
import { notes } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function loader({ request }: LoaderFunctionArgs) {
  const today = new Date().toISOString().split("T")[0];
  const displayDate = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  // Find existing daily note
  const existing = db.select().from(notes).where(eq(notes.title, today)).get();

  if (existing) {
    return redirect(`/notes/${existing.id}`);
  }

  // Create a new daily note with review template
  const now = new Date().toISOString();
  const noteId = uuid();

  const template = `
<h2>📅 ${displayDate}</h2>
<p></p>
<h2>✅ 今天完成了什么</h2>
<ul>
  <li><p></p></li>
</ul>
<p></p>
<h2>💡 遇到了什么 / 学到了什么</h2>
<ul>
  <li><p></p></li>
</ul>
<p></p>
<h2>⏳ 明天最重要的一件事</h2>
<p></p>
<h2>🔋 精力评分</h2>
<p>⚡⚡⚡⚡⚡ (1-5)</p>
<p></p>
<h2>💬 随手记</h2>
<p></p>
`;

  db.insert(notes).values({
    id: noteId,
    title: today,
    content: template.trim(),
    categoryId: null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return redirect(`/notes/${noteId}`);
}

export default function DailyNote() {
  return null;
}
