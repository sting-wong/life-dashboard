import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link } from "@remix-run/react";
import { db } from "~/db/index.server";
import { habits } from "~/db/schema.server";
import { v4 as uuid } from "uuid";
import { ArrowLeft } from "lucide-react";

const HABIT_COLORS = [
  "#1A7A4A", "#2563EB", "#D97706", "#DC2626", "#7C3AED",
  "#0891B2", "#BE185D", "#4F46E5", "#65A30D", "#EA580C",
];

const HABIT_ICONS = ["check-square", "dumbbell", "book-open", "glass-water", "music", "pencil", "code", "heart"];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const title = formData.get("title") as string;
  if (!title?.trim()) return json({ error: "标题不能为空" }, { status: 400 });

  const now = new Date().toISOString();
  db.insert(habits).values({
    id: uuid(),
    title: title.trim(),
    description: (formData.get("description") as string) || "",
    frequency: ((formData.get("frequency") as string) || "daily") as "daily" | "weekly" | "monthly",
    color: (formData.get("color") as string) || HABIT_COLORS[0],
    icon: (formData.get("icon") as string) || null,
    createdAt: now,
    updatedAt: now,
  }).run();

  return redirect("/habits");
}

export default function NewHabit() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/habits" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={16} />
        返回习惯列表
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">新建习惯</h1>

      <Form method="post" className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
          <input
            type="text"
            name="title"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="例如：早起、运动、阅读"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            name="description"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="描述你的习惯目标（可选）"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">频率</label>
          <select
            name="frequency"
            defaultValue="daily"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">颜色</label>
          <div className="flex gap-2 flex-wrap">
            {HABIT_COLORS.map((color) => (
              <label key={color} className="relative">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={color === HABIT_COLORS[0]}
                  className="sr-only peer"
                />
                <span
                  className="block w-8 h-8 rounded-full cursor-pointer ring-2 ring-transparent peer-checked:ring-primary-500 peer-checked:ring-offset-2 transition-all"
                  style={{ backgroundColor: color }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            创建习惯
          </button>
          <a
            href="/habits"
            className="px-6 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </a>
        </div>
      </Form>
    </div>
  );
}
