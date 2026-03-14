# Robot Population Atlas

多语言文档 / Multilingual Docs:
- 中文（本页）
- English: [README.en.md](./README.en.md)

开发规范 / Dev Rules:
- [CODE_QUALITY_GUARDRAILS.md](./CODE_QUALITY_GUARDRAILS.md)

## 项目简介

这是一个**全球城市机器人数量展示平台**。
核心目标是展示数据，不暴露抓取流程。

### 数据流程（内部）
1. 定时任务每日抓取 feed/来源
2. 清洗并抽取事实
3. 去重合并为标准事件（canonical events）
4. 地图只读取标准事件数据

> 默认不开放公开爬虫 API，数据更新由服务内部定时器完成。

## 功能

- 地图自动级别（随缩放切换）
  - 远景：国家
  - 中景：省/州
  - 近景：城市
- 机器人城市点亮（热力 + 发光 + 点位）
- 左侧只保留展示相关筛选
  - 洲（Continent）
  - 城市关键词
  - 机器人类型
- 点击国家/省/城市可查看该区域机器人详情

## 快速启动

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:8080/api/health

## 定时任务配置

后端环境变量：

```env
CRAWL_CRON=0 3 * * *
CRAWL_RUN_ON_STARTUP=true
REQUEST_DELAY_MS=800
```

## 部署（Docker）

```bash
docker compose build
docker compose up -d
```

## 目录结构

- `frontend/`：地图展示 UI
- `backend/`：API + 定时抓取 + 数据清洗/去重
- `docker-compose.yml`：部署编排
