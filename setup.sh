#!/bin/bash
echo "🚀 正在安装依赖..."
cd "$(dirname "$0")"
npm install

echo "🗄️  初始化数据库..."
npm run db:seed

echo ""
echo "✅ 完成！运行以下命令启动："
echo "   npm run dev"
echo ""
echo "   然后打开 http://localhost:5173"
