import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Map, { Layer, Source, Popup } from 'react-map-gl/maplibre';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';
const TILE_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export default function App() {
  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('AI startup Toronto');
  const [crawlLimit, setCrawlLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [robotType, setRobotType] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [cityItems, setCityItems] = useState([]);
  const [stats, setStats] = useState({ rawArticles: 0, extractedFacts: 0, canonicalEvents: 0, totalCities: 0, byRobotType: [] });

  const pointLayer = useMemo(
    () => ({
      id: 'city-points',
      type: 'circle',
      paint: {
        'circle-color': '#00e5ff',
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 5, 50, 20],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#b2ffff'
      }
    }),
    []
  );

  async function loadCities() {
    const [citiesRes, statsRes] = await Promise.all([
      axios.get(`${API_BASE}/map/cities`),
      axios.get(`${API_BASE}/stats`)
    ]);
    setGeojson(citiesRes.data);
    setStats(statsRes.data);
  }

  async function loadCityItems(city) {
    const { data } = await axios.get(`${API_BASE}/events`, {
      params: {
        city,
        robotType: robotType || undefined,
        limit: 20
      }
    });
    setCityItems(data.data || []);
  }

  async function runFeedCrawl() {
    try {
      setLoading(true);
      setMsg('正在跑核心来源 RSS 抓取...');
      const { data } = await axios.post(`${API_BASE}/crawl/feeds`, { perFeedLimit: 8 });
      const total = data.details?.reduce((n, x) => n + (x.eventsMerged || 0), 0) || 0;
      setMsg(`来源抓取完成：事件合并 ${total}`);
      await loadCities();
    } catch (e) {
      setMsg(`失败：${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runCompanyCrawl() {
    try {
      setLoading(true);
      setMsg('正在跑公司来源池抓取...');
      const { data } = await axios.post(`${API_BASE}/crawl/companies`, { perSourceLimit: 6 });
      const total = data.details?.reduce((n, x) => n + (x.eventsMerged || 0), 0) || 0;
      setMsg(`公司池抓取完成：事件合并 ${total}`);
      await loadCities();
    } catch (e) {
      setMsg(`失败：${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCities();
  }, []);

  async function runCrawl() {
    try {
      setLoading(true);
      setMsg('正在抓取并去重...');
      const { data } = await axios.post(`${API_BASE}/crawl`, { query, limit: Number(crawlLimit) });
      setMsg(`完成：原始 ${data.rawSaved}，事实 ${data.factsSaved}，事件合并 ${data.eventsMerged}`);
      await loadCities();
    } catch (e) {
      setMsg(`失败：${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="layout">
      <aside className="panel">
        <h2>Map Intel</h2>
        <p>OSM 数据底图 · 深色科技风 · 城市聚合</p>
        <label>搜索关键词</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例如：fintech Singapore" />

        <label>抓取条数</label>
        <input type="number" min={5} max={50} value={crawlLimit} onChange={(e) => setCrawlLimit(e.target.value)} />

        <label>机器人类型筛选</label>
        <select value={robotType} onChange={(e) => setRobotType(e.target.value)}>
          <option value="">全部</option>
          <option value="robotaxi">robotaxi</option>
          <option value="delivery">delivery</option>
          <option value="warehouse">warehouse</option>
          <option value="unknown">unknown</option>
        </select>

        <label>来源类型筛选</label>
        <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          <option value="">全部</option>
          <option value="source-feed">source-feed</option>
          <option value="search-news">search-news</option>
        </select>

        <button onClick={runCrawl} disabled={loading}>{loading ? '抓取中...' : '关键词抓取'}</button>
        <button onClick={runCompanyCrawl} disabled={loading}>{loading ? '抓取中...' : '公司池抓取(P0)'}</button>
        <button onClick={runFeedCrawl} disabled={loading}>{loading ? '抓取中...' : '核心来源抓取(RSS)'}</button>
        <button onClick={loadCities}>刷新地图</button>
        <p className="msg">{msg}</p>

        <div className="stats">
          <div>原始来源：{stats.rawArticles}</div>
          <div>抽取事实：{stats.extractedFacts}</div>
          <div>标准事件：{stats.canonicalEvents}</div>
          <div>覆盖城市：{stats.totalCities}</div>
        </div>

        {selected?.properties?.city && (
          <div className="cityPanel">
            <h3>{selected.properties.city}</h3>
            <ul>
              {cityItems.map((item) => (
                <li key={item._id}>
                  <div><strong>{item.companyCanonical || item.company}</strong> · {item.robotType} · {item.eventType}</div>
                  <div>sources: {item.sourceCount} · confidence: {Number(item.confidence || 0).toFixed(2)}</div>
                  {item.sourceUrls?.[0] && <a href={item.sourceUrls[0]} target="_blank" rel="noreferrer">查看主来源</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      <main className="mapWrap">
        <Map
          initialViewState={{ longitude: 20, latitude: 20, zoom: 1.5 }}
          mapStyle={TILE_STYLE}
          onClick={(e) => {
            const f = e.features?.[0];
            if (f?.properties) {
              setSelected(f);
              loadCityItems(f.properties.city);
            }
          }}
          interactiveLayerIds={['city-points']}
        >
          <Source id="cities" type="geojson" data={geojson}>
            <Layer {...pointLayer} />
          </Source>

          {selected && (
            <Popup
              longitude={selected.geometry.coordinates[0]}
              latitude={selected.geometry.coordinates[1]}
              onClose={() => setSelected(null)}
              closeButton
            >
              <div>
                <strong>{selected.properties.city}</strong>
                <div>事件数：{selected.properties.eventCount}</div>
                <div>来源数：{selected.properties.sourceCount}</div>
                <div>{selected.properties.province}, {selected.properties.country}</div>
              </div>
            </Popup>
          )}
        </Map>
      </main>
    </div>
  );
}
