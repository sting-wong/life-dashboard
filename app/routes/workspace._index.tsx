import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useFetcher } from "@remix-run/react";
import { db } from "~/db/index.server";
import { workspaceSections, workspacePages } from "~/db/schema.server";
import { asc, desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { Plus, ChevronDown, ChevronRight, Trash2, X } from "lucide-react";
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
  const pages = db
    .select({
      id: workspacePages.id,
      title: workspacePages.title,
      emoji: workspacePages.emoji,
      content: workspacePages.content,
      updatedAt: workspacePages.updatedAt,
    })
    .from(workspacePages)
    .orderBy(desc(workspacePages.updatedAt))
    .all();
  return json({ sections, pages });
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

  // ── workspace_pages CRUD ──────────────────────────────

  if (intent === "create-page") {
    const template = (form.get("template") as string) || "blank";
    const now = new Date().toISOString();
    const id = uuid();
    const templateContent: Record<string, { title: string; emoji: string; content: string }> = {
      "weekly-plan": { title: "本周计划", emoji: "📅", content: TEMPLATES["weekly-plan"].content },
      "content-ideas": { title: "内容创意整理", emoji: "💡", content: TEMPLATES["content-ideas"].content },
      blank: { title: "无标题", emoji: "📝", content: "" },
    };
    const tpl = templateContent[template] ?? templateContent.blank;
    db.insert(workspacePages)
      .values({ id, title: tpl.title, emoji: tpl.emoji, content: tpl.content, createdAt: now, updatedAt: now })
      .run();
    return json({ ok: true, newPageId: id });
  }

  if (intent === "rename-page") {
    const id = form.get("id") as string;
    const title = ((form.get("title") as string) ?? "").trim() || "无标题";
    db.update(workspacePages)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(workspacePages.id, id))
      .run();
    return json({ ok: true });
  }

  if (intent === "update-page-content") {
    const id = form.get("id") as string;
    const content = (form.get("content") as string) ?? "";
    db.update(workspacePages)
      .set({ content, updatedAt: new Date().toISOString() })
      .where(eq(workspacePages.id, id))
      .run();
    return json({ ok: true });
  }

  if (intent === "delete-page") {
    const id = form.get("id") as string;
    db.delete(workspacePages).where(eq(workspacePages.id, id)).run();
    return json({ ok: true });
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
        { method: "post" }
      );
    }, 1000);
  };

  const handleBlur = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== section.title) {
      renameFetcher.submit(
        { intent: "rename-section", id: section.id, title: trimmed },
        { method: "post" }
      );
    }
  };

  const handleToggle = () => {
    collapseFetcher.submit(
      { intent: "toggle-collapse", id: section.id, collapsed: String(section.collapsed) },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    if (window.confirm(`删除「${section.title}」？`)) {
      deleteFetcher.submit(
        { intent: "delete-section", id: section.id },
        { method: "post" }
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

type Page = {
  id: string;
  title: string;
  emoji: string;
  content: string;
  updatedAt: string;
};

function PageEditor({ page }: { page: Page }) {
  const [title, setTitle] = useState(page.title);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);
  // Track whether content has changed from initial value to guard against
  // BlockEditor firing onChange on initial mount with an equivalent value
  const initialContentRef = useRef(page.content);
  const contentChangedRef = useRef(false);

  const contentFetcher = useFetcher<{ ok: boolean }>();
  const renameFetcher = useFetcher<{ ok: boolean }>();

  // Reset ONLY when switching to a different page (id changes), not on title revalidation
  useEffect(() => {
    setTitle(page.title);
    setSaveStatus("idle");
    initialContentRef.current = page.content;
    contentChangedRef.current = false;
  }, [page.id]); // intentionally omit page.title to avoid resetting while user is typing

  // Show "saved" after content auto-save completes
  useEffect(() => {
    if (contentFetcher.state === "idle" && submittedRef.current) {
      submittedRef.current = false;
      setSaveStatus("saved");
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    }
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); };
  }, [contentFetcher.state]);

  const handleContentChange = (html: string) => {
    // Guard: skip if content hasn't actually changed from the initial value
    if (!contentChangedRef.current && html === initialContentRef.current) return;
    contentChangedRef.current = true;
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      submittedRef.current = true;
      contentFetcher.submit(
        { intent: "update-page-content", id: page.id, content: html },
        { method: "post" }
      );
    }, 1000);
  };

  const handleTitleBlur = () => {
    const trimmed = title.trim() || "无标题";
    if (trimmed !== page.title) {
      renameFetcher.submit(
        { intent: "rename-page", id: page.id, title: trimmed },
        { method: "post" }
      );
    }
  };

  return (
    <div className="max-w-[680px] mx-auto px-8 md:px-12 py-10 md:py-14">
      {/* Page title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        placeholder="无标题"
        className="w-full text-[28px] font-bold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-200 mb-2 leading-tight"
      />

      {/* Meta row: last updated + save status */}
      <div className="flex items-center gap-3 mb-8 text-xs text-gray-400">
        <span>
          上次编辑 {new Date(page.updatedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        {saveStatus === "saving" && <span className="text-gray-400">保存中…</span>}
        {saveStatus === "saved" && <span className="text-primary-500">已保存 ✓</span>}
      </div>

      {/* Block editor */}
      <div className="prose-workspace">
        <BlockEditor
          content={page.content}
          onChange={handleContentChange}
          placeholder="开始写作，或输入 / 插入内容块…"
          editable
          borderless
        />
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const { pages } = useLoaderData<typeof loader>();
  const [activePageId, setActivePageId] = useState<string | null>(
    pages.length > 0 ? pages[0].id : null
  );
  const [showPageList, setShowPageList] = useState(false);

  const createFetcher = useFetcher<{ ok: boolean; newPageId?: string }>();
  const deleteFetcher = useFetcher<{ ok: boolean }>();

  // Auto-select newly created page
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.newPageId) {
      setActivePageId(createFetcher.data.newPageId);
    }
  }, [createFetcher.state, createFetcher.data]);

  const handleCreatePage = () => {
    createFetcher.submit(
      { intent: "create-page", template: "blank" },
      { method: "post" }
    );
    setShowPageList(false);
  };

  const handleDeletePage = (id: string) => {
    if (!window.confirm("删除这个页面？")) return;
    deleteFetcher.submit(
      { intent: "delete-page", id },
      { method: "post" }
    );
    if (activePageId === id) {
      const remaining = pages.filter((p) => p.id !== id);
      setActivePageId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  return (
    <div className="flex h-full min-h-screen bg-[#F7F5F0]">

      {/* ── Mobile: page list overlay ── */}
      {showPageList && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setShowPageList(false)}
        />
      )}

      {/* ── Page list column (220px, desktop) ── */}
      <aside
        className={[
          "bg-white border-r border-[#E8ECEA] flex flex-col shrink-0",
          "w-[220px]",
          "fixed md:static inset-y-0 left-0 z-50 md:z-auto",
          "transition-transform duration-200",
          showPageList ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        {/* Panel header */}
        <div className="px-4 pt-5 pb-3 border-b border-[#E8ECEA]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-800 text-sm">工作台</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreatePage}
                disabled={createFetcher.state !== "idle"}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-50"
                title="新建页面"
                aria-label="新建页面"
              >
                <Plus size={15} strokeWidth={2.2} />
              </button>
              {/* Close button — mobile only */}
              <button
                onClick={() => setShowPageList(false)}
                className="md:hidden w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                aria-label="关闭页面列表"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          {pages.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 px-2">
              还没有页面，点击 + 新建
            </p>
          ) : (
            <ul className="space-y-0.5">
              {pages.map((p) => (
                <li key={p.id} className="group relative">
                  <button
                    onClick={() => { setActivePageId(p.id); setShowPageList(false); }}
                    className={[
                      "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[13px] transition-all pr-8",
                      activePageId === p.id
                        ? "bg-primary-50 text-primary-700 font-semibold"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-800",
                    ].join(" ")}
                  >
                    <span className="text-base leading-none shrink-0">{p.emoji}</span>
                    <span className="truncate">{p.title}</span>
                  </button>
                  {/* Delete button — visible on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeletePage(p.id); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="删除页面"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Editor column (flex-1) ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[#E8ECEA]">
          <button
            onClick={() => setShowPageList(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 shrink-0"
            aria-label="打开页面列表"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700 truncate">
            {pages.find(p => p.id === activePageId)?.title ?? "工作台"}
          </span>
        </div>

        {/* Editor content area — populated in Task 3-6 */}
        <div className="flex-1 overflow-y-auto">
          {activePageId == null ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8">
              <div className="text-4xl mb-4">📄</div>
              <p className="text-gray-500 text-sm mb-1">
                {pages.length === 0 ? "还没有页面" : "选择左侧页面开始编辑"}
              </p>
              {pages.length === 0 && (
                <button
                  onClick={handleCreatePage}
                  disabled={createFetcher.state !== "idle"}
                  className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
                >
                  + 新建第一个页面
                </button>
              )}
            </div>
          ) : (
            (() => {
              const activePage = pages.find((p) => p.id === activePageId);
              if (!activePage) return null;
              return <PageEditor key={activePage.id} page={activePage} />;
            })()
          )}
        </div>
      </div>

    </div>
  );
}
