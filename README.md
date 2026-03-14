# Map Intel Platform (MVP)

一个可先跑起来的版本：
- 深色科技风世界地图（OSM + MapLibre）
- 后端抓取公开搜索结果（DuckDuckGo HTML）
- MongoDB 存储
- URL + 内容哈希去重
- 按城市聚合展示点位

## 1) 快速启动（本地）

### Backend
```bash
cd backend
cp .env.example .env
# 修改 MONGO_URI
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

## 2) API

- `POST /api/crawl`
```json
{
  "query": "fintech singapore",
  "limit": 20
}
```

- `GET /api/items?q=fintech&city=Singapore`
- `GET /api/map/cities`

## 3) 部署（测试服务器）

```bash
# 在服务器上
git clone <your-repo>
cd map-intel-platform
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入服务器的 Mongo URI

docker compose build
docker compose up -d
```

如果前端和后端分域名，构建前端时传：
```bash
docker build -t map-intel-frontend ./frontend --build-arg VITE_API_BASE=https://api.your-domain.com/api
```

## 4) 去重策略

1. URL 标准化去重：去掉 utm_*、fbclid、gclid、hash
2. 内容哈希去重：`sha256(lower(title + snippet))`
3. 城市展示聚合：按 `city` 聚合并计算平均经纬度

## 5) 下一步建议（我可以继续做）

- 接入多站点爬虫（你指定站点清单）
- 城市识别升级（NER + GeoNames）
- 任务队列（BullMQ）+ 定时爬取
- 权限与审计日志
- 地图点位详情抽屉（按城市查看全部条目）
