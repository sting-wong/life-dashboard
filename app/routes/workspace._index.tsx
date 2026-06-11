import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { workspaceSections } from "~/db/schema.server";
import { asc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { Plus, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import BlockEditor from "~/components/BlockEditor";

const TEMPLATES: Record<string, { title: string; content: string }> = {
  "weekly-plan": {
    title: "本周计划",
    content: `<h2>本周计划</h2>
<h3>本周最重要的 3 件事</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>本周学习 / 工作安排</h3><p></p>
<h3>需要专注完成的任务</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>本周复盘</h3><p></p>`,
  },
  "content-ideas": {
    title: "内容创意整理",
    content: `<h2>内容创意整理</h2>
<h3>待选题</h3><ul><li><p></p></li></ul>
<h3>灵感来源</h3><p></p>
<h3>内容方向</h3><p></p>
<h3>进行中</h3>
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false"><div><p></p></div></li>
</ul>
<h3>复盘数据</h3><p></p>`,
  },
  blank: {
    title: "空白",
    content: "",
  },
};

export async function loader(_: LoaderFunctionArgs) {
  const sections = db
    .select()
    .from(workspaceSections)
    .orderBy(asc(workspaceSections.createdAt))
    .all();
  return json({ sections });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create-section") {
    const template = (form.get("template") as string) || "blank";
    const tpl = TEMPLATES[template] ?? TEMPLATES.blank;
    const now = new Date().toISOString();
    db.insert(workspaceSections)
      .values({
        id: uuid(),
        title: tpl.title,
        content: tpl.content,
        template,
        sortOrder: 0,
        collapsed: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return redirect("/workspace");
  }

  if (intent === "rename-section") {
    const id = form.get("id") as string;
    const title = (form.get("title") as string).trim();
    if (title) {
      db.update(workspaceSections)
        .set({ title, updatedAt: new Date().toISOString() })
        .where(eq(workspaceSections.id, id))
        .run();
    }
    return json({ ok: true });
  }

  if (intent === "toggle-collapse") {
    const id = form.get("id") as string;
    const collapsed = form.get("collapsed") === "1" ? 0 : 1;
    db.update(workspaceSections)
      .set({ collapsed, updatedAt: new Date().toISOString() })
      .where(eq(workspaceSections.id, id))
      .run();
    return json({ ok: true });
  }

  if (intent === "update-content") {
    const id = form.get("id") as string;
    const content = form.get("content") as string;
    db.update(workspaceSections)
      .set({ content, updatedAt: new Date().toISOString() })
      .where(eq(workspaceSections.id, id))
      .run();
    return json({ ok: true });
  }

  if (intent === "delete-section") {
    const id = form.get("id") as string;
    db.delete(workspaceSections).where(eq(workspaceSections.id, id)).run();
    return redirect("/workspace");
  }

  return json({ ok: false, error: "Unsupported intent" }, { status: 400 });
}

type Section = {
  id: string;
  title: string;
  content: string;
  template: string;
  collapsed: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function SectionCard({ section }: { section: Section }) {
  const [title, setTitle] = useState(section.title);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedSaveRef = useRef(false);

  const renameFetcher = useFetcher();
  const contentFetcher = useFetcher();
  const collapseFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const collapsed = section.collapsed === 1;

  // Only show "saved" after a real submit has completed
  useEffect(() => {
    if (contentFetcher.state === "idle" && submittedSaveRef.current) {
      submittedSaveRef.current = false;
      setSaveStatus("saved");
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
    }
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [contentFetcher.state]);

  const handleContentChange = (html: string) => {
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      submittedSaveRef.current = true;
      contentFetcher.submit(
        { intent: "update-content", id: section.id, content: html },
        { method: "post", action: "/workspace" }
      );
    }, 1000);
  };

  const handleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== section.title) {
      renameFetcher.submit(
        { intent: "rename-section", id: section.id, title: trimmed },
        { method: "post", action: "/workspace" }
      );
    }
  };

  const handleToggle = () => {
    collapseFetcher.submit(
      { intent: "toggle-collapse", id: section.id, collapsed: String(section.collapsed) },
      { method: "post", action: "/workspace" }
    );
  };

  const handleDelete = () => {
    if (window.confirm(`删除「${section.title}」？`)) {
      deleteFetcher.submit(
        { intent: "delete-section", id: section.id },
        { method: "post", action: "/workspace" }
      );
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={handleToggle}
          className="text-gray-400 hover:text-gray-600 shrink-0"
          aria-label={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleBlur}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-800 focus:outline-none"
        />
        {saveStatus === "saving" && (
          <span className="text-xs text-gray-400 shrink-0">保存中…</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-xs text-green-500 shrink-0">已保存</span>
        )}
        <button
          onClick={handleDelete}
          className="text-gray-300 hover:text-red-400 shrink-0"
          aria-label="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Editor area */}
      {!collapsed && (
        <div className="p-4">
          <BlockEditor
            content={section.content}
            onChange={handleContentChange}
            editable
          />
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const { sections } = useLoaderData<typeof loader>();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 overflow-x-hidden">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">自由工作台</h1>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus size={16} />
            新建区块
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
              {(["weekly-plan", "content-ideas", "blank"] as const).map((key) => (
                <Form key={key} method="post" onSubmit={() => setMenuOpen(false)}>
                  <input type="hidden" name="intent" value="create-section" />
                  <input type="hidden" name="template" value={key} />
                  <button
                    type="submit"
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {TEMPLATES[key].title}
                  </button>
                </Form>
              ))}
            </div>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-gray-400 py-20">还没有区块，点击新建开始</p>
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <SectionCard key={s.id} section={s} />
          ))}
        </div>
      )}
    </div>
  );
}
