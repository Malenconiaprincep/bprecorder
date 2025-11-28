# 血压记录仪 - 微信小程序版 (Taro)

这是使用 Taro 4 重构的血压记录仪小程序版本。

## 快速开始

### 1. 安装依赖

在 `miniapp` 目录下运行：

```bash
npm install
```

### 2. 配置环境变量

打开 `miniapp/src/utils/api.ts`，修改 `API_BASE_URL` 为你后端的实际地址：

```typescript
export const API_BASE_URL = 'http://localhost:3000' // 本地调试
// export const API_BASE_URL = 'https://your-production-api.com' // 生产环境
```

打开 `miniapp/src/lib/supabase.ts`，填入你的 Supabase URL 和 Key：

```typescript
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_KEY'
```

### 3. 运行开发环境

**微信小程序：**

```bash
npm run dev:weapp
```

运行后，使用微信开发者工具导入 `miniapp/dist` 目录即可预览。

## 项目结构

- `src/pages`: 页面文件
  - `index`: 主页（列表、图表、上传）
  - `login`: 登录/注册页
- `src/components`: 组件
  - `BPChart`: 基于 ECharts 的图表组件
- `src/lib`: 工具库
  - `supabase.ts`: Supabase 客户端（适配小程序 Storage）

## 注意事项

1. **API 跨域**：本地调试时请在微信开发者工具中勾选 "详情 -> 本地设置 -> 不校验合法域名"。
2. **样式适配**：项目使用了 Tailwind CSS，并通过 `weapp-tailwindcss-webpack-plugin` 自动适配小程序环境。
3. **图表**：使用了 `echarts-taro3-react`，请确保构建无报错。

