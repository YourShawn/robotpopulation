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
    const { data } = await axios.get(`${API_BASE}/map/cities`);
    setGeojson(data);
  }

  useEffect(() => {
    loadCities();
  }, []);

  async function runCrawl() {
    try {
      setLoading(true);
      setMsg('正在抓取并去重...');
      const { data } = await axios.post(`${API_BASE}/crawl`, { query, limit: Number(crawlLimit) });
      setMsg(`完成：新增 ${data.inserted}，URL重复 ${data.duplicateUrl}，内容重复 ${data.duplicateContent}`);
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

        <button onClick={runCrawl} disabled={loading}>{loading ? '抓取中...' : '开始抓取'}</button>
        <button onClick={loadCities}>刷新地图</button>
        <p className="msg">{msg}</p>
      </aside>

      <main className="mapWrap">
        <Map
          initialViewState={{ longitude: 20, latitude: 20, zoom: 1.5 }}
          mapStyle={TILE_STYLE}
          onClick={(e) => {
            const f = e.features?.[0];
            if (f?.properties) setSelected(f);
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
                <div>条目数：{selected.properties.count}</div>
              </div>
            </Popup>
          )}
        </Map>
      </main>
    </div>
  );
}
