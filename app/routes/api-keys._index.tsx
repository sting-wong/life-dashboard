import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "~/db/index.server";
import { apiKeys } from "~/db/schema.server";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { Plus, Copy, Trash2, Key, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useState } from "react";

export async function loader(_: LoaderFunctionArgs) {
  const keys = db.select().from(apiKeys).all();
  return json({ keys });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const name = (formData.get("name") as string)?.trim();
    const service = (formData.get("service") as string)?.trim();
    const key = (formData.get("key") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    if (!name || !service || !key) return json({ error: "名称、服务和密钥不能为空" }, { status: 400 });
    const now = new Date().toISOString();
    db.insert(apiKeys).values({ id: uuid(), name, service, key, description, createdAt: now, updatedAt: now }).run();
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    if (id) db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
  }

  return redirect("/api-keys");
}

function KeyCard({ item }: { item: { id: string; name: string; service: string; key: string; description: string | null; createdAt: string } }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const masked = item.key.slice(0, 6) + "•".repeat(Math.max(0, item.key.length - 10)) + item.key.slice(-4);

  return (
    <div className="bg-white rounded-2xl border border-[#E8ECEA] p-4 hover:shadow-card-hover transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[12px] bg-primary-50 flex items-center justify-center shrink-0">
            <Key size={16} className="text-primary-600" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 truncate">{item.name}</p>
            <span className="inline-block text-[11px] font-medium text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full mt-0.5">
              {item.service}
            </span>
          </div>
        </div>

        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => !confirm(`确定删除「${item.name}」？`) && e.preventDefault()}
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </Form>
      </div>

      {item.description && (
        <p className="text-[12px] text-[#8A8F98] mt-2.5 leading-relaxed">{item.description}</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0 bg-[#F4F6F5] rounded-lg px-3 py-2 flex items-center gap-2">
          <code className="text-[12px] font-mono text-gray-700 truncate flex-1">
            {visible ? item.key : masked}
          </code>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={visible ? "隐藏" : "显示"}
          >
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-[12px] font-medium transition-colors"
        >
          <Copy size={12} />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const { keys } = useLoaderData<typeof loader>();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 tracking-tight">API 密钥</h1>
          <p className="text-[13px] text-[#8A8F98] mt-0.5">管理你的 API 密钥，一键复制使用</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-semibold rounded-xl transition-colors"
        >
          <Plus size={14} />
          添加密钥
        </button>
      </div>

      {showForm && (
        <Form
          method="post"
          className="bg-white rounded-2xl border border-[#E8ECEA] p-5 mb-5 space-y-3"
          onSubmit={() => setShowForm(false)}
        >
          <input type="hidden" name="intent" value="create" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">名称 *</label>
              <input
                type="text"
                name="name"
                required
                placeholder="如：OpenAI 主账号"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">服务 *</label>
              <input
                type="text"
                name="service"
                required
                placeholder="如：OpenAI / Anthropic"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">API 密钥 *</label>
            <input
              type="text"
              name="key"
              required
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-gray-600 mb-1">备注</label>
            <input
              type="text"
              name="description"
              placeholder="用途说明（可选）"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-semibold rounded-lg transition-colors"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-5 py-2 text-gray-500 hover:text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </div>
        </Form>
      )}

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
            <Key size={24} className="text-primary-400" />
          </div>
          <p className="text-[15px] font-semibold text-gray-700 mb-1">还没有 API 密钥</p>
          <p className="text-[13px] text-[#8A8F98]">点击「添加密钥」开始管理你的 API 密钥</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {keys.map((item) => (
            <KeyCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
