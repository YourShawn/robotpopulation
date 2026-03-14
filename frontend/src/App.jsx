import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Map, { Layer, Source, Popup } from 'react-map-gl/maplibre';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';

const THEMES = {
  dark: {
    mapStyle: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    appClass: 'theme-dark'
  },
  light: {
    mapStyle: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    appClass: 'theme-light'
  },
  neon: {
    mapStyle: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    appClass: 'theme-neon'
  }
};

const I18N = {
  zh: {
    title: 'Robot City Atlas',
    subtitle: '全球机器人部署可视化',
    refresh: '刷新地图',
    robotFilter: '机器人类型',
    sourceFilter: '来源类型',
    all: '全部',
    cityCoverage: '覆盖城市',
    events: '标准事件',
    facts: '抽取事实',
    raws: '原始来源',
    eventCount: '事件数',
    sourceCount: '来源数',
    dataOps: '数据维护（后台）',
    keyword: '关键词',
    limit: '抓取条数',
    crawl: '关键词抓取',
    crawlCompany: '公司池抓取',
    crawlFeed: '来源抓取',
    running: '执行中...'
  },
  en: {
    title: 'Robot City Atlas',
    subtitle: 'Global robot deployment map',
    refresh: 'Refresh',
    robotFilter: 'Robot Type',
    sourceFilter: 'Source Type',
    all: 'All',
    cityCoverage: 'Cities',
    events: 'Canonical Events',
    facts: 'Extracted Facts',
    raws: 'Raw Articles',
    eventCount: 'Events',
    sourceCount: 'Sources',
    dataOps: 'Data Operations',
    keyword: 'Keyword',
    limit: 'Fetch limit',
    crawl: 'Keyword crawl',
    crawlCompany: 'Company crawl',
    crawlFeed: 'Feed crawl',
    running: 'Running...'
  },
  es: {
    title: 'Atlas de Ciudades Robot', subtitle: 'Mapa global de despliegue robótico', refresh: 'Actualizar', robotFilter: 'Tipo de robot', sourceFilter: 'Tipo de fuente', all: 'Todos', cityCoverage: 'Ciudades', events: 'Eventos', facts: 'Hechos', raws: 'Fuentes', eventCount: 'Eventos', sourceCount: 'Fuentes', dataOps: 'Operaciones de datos', keyword: 'Palabra clave', limit: 'Límite', crawl: 'Rastreo por palabra', crawlCompany: 'Rastreo por empresa', crawlFeed: 'Rastreo RSS', running: 'Ejecutando...'
  },
  fr: {
    title: 'Atlas Robot des Villes', subtitle: 'Carte mondiale des déploiements', refresh: 'Actualiser', robotFilter: 'Type de robot', sourceFilter: 'Type de source', all: 'Tous', cityCoverage: 'Villes', events: 'Événements', facts: 'Faits', raws: 'Sources', eventCount: 'Événements', sourceCount: 'Sources', dataOps: 'Opérations de données', keyword: 'Mot-clé', limit: 'Limite', crawl: 'Collecte par mot-clé', crawlCompany: 'Collecte entreprises', crawlFeed: 'Collecte RSS', running: 'En cours...'
  },
  ja: {
    title: 'ロボット都市アトラス', subtitle: '世界ロボット展開マップ', refresh: '更新', robotFilter: 'ロボット種類', sourceFilter: 'ソース種類', all: 'すべて', cityCoverage: '都市数', events: 'イベント', facts: '抽出ファクト', raws: '生ソース', eventCount: 'イベント数', sourceCount: 'ソース数', dataOps: 'データ運用', keyword: 'キーワード', limit: '件数', crawl: 'キーワード収集', crawlCompany: '企業収集', crawlFeed: 'RSS収集', running: '実行中...'
  }
};

export default function App() {
  const [lang, setLang] = useState('zh');
  const [theme, setTheme] = useState('dark');
  const t = I18N[lang] || I18N.zh;

  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('robotaxi launch city');
  const [crawlLimit, setCrawlLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [robotType, setRobotType] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [cityItems, setCityItems] = useState([]);
  const [showOps, setShowOps] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [viewLevel, setViewLevel] = useState('city');
  const [stats, setStats] = useState({ rawArticles: 0, extractedFacts: 0, canonicalEvents: 0, totalCities: 0, byRobotType: [] });

  const heatLayer = useMemo(() => ({
    id: 'city-heat',
    type: 'heatmap',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'eventCount'], 1, 0.2, 30, 1],
      'heatmap-intensity': 0.8,
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 6, 28, 12, 36],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)',
        0.2, '#2ec7ff',
        0.4, '#4fffb0',
        0.6, '#ffe66d',
        0.8, '#ff7b54',
        1, '#ff3d71'
      ],
      'heatmap-opacity': 0.55
    }
  }), []);

  const pointLayer = useMemo(() => ({
    id: 'city-points',
    type: 'circle',
    paint: {
      'circle-color': ['interpolate', ['linear'], ['get', 'eventCount'], 1, '#59d8ff', 10, '#35ffb6', 25, '#ffcd4a', 50, '#ff6b6b'],
      'circle-radius': ['interpolate', ['linear'], ['get', 'eventCount'], 1, 4, 5, 7, 20, 12, 50, 20],
      'circle-opacity': 0.95,
      'circle-stroke-width': 1.2,
      'circle-stroke-color': '#eaffff'
    }
  }), []);

  async function loadCities(level = viewLevel) {
    const [citiesRes, statsRes] = await Promise.all([
      axios.get(`${API_BASE}/map/regions`, { params: { level } }),
      axios.get(`${API_BASE}/stats`)
    ]);
    setGeojson(citiesRes.data);
    setStats(statsRes.data);
  }

  async function loadRegionItems(props) {
    const params = {
      robotType: robotType || undefined,
      sourceType: sourceType || undefined,
      limit: 30
    };

    if (props.level === 'country') params.country = props.country;
    else if (props.level === 'province') {
      params.country = props.country;
      params.province = props.province;
    } else {
      params.city = props.city;
      params.province = props.province;
      params.country = props.country;
    }

    const { data } = await axios.get(`${API_BASE}/events`, { params });
    setCityItems(data.data || []);
  }

  useEffect(() => {
    loadCities(viewLevel);
  }, [viewLevel]);

  async function runCrawl() {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/crawl`, { query, limit: Number(crawlLimit) });
      setMsg(`OK: ${data.eventsMerged || 0} events merged`);
      await loadCities();
    } catch (e) {
      setMsg(`Error: ${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runCompanyCrawl() {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/crawl/companies`, { perSourceLimit: 6 });
      const total = data.details?.reduce((n, x) => n + (x.eventsMerged || 0), 0) || 0;
      setMsg(`OK: ${total} events merged`);
      await loadCities();
    } catch (e) {
      setMsg(`Error: ${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runFeedCrawl() {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/crawl/feeds`, { perFeedLimit: 10 });
      const total = data.details?.reduce((n, x) => n + (x.eventsMerged || 0), 0) || 0;
      setMsg(`OK: ${total} events merged`);
      await loadCities();
    } catch (e) {
      setMsg(`Error: ${e.response?.data?.error || e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`layout ${THEMES[theme].appClass}`} style={{ gridTemplateColumns: collapsed ? '46px 1fr' : '360px 1fr' }}>
      <aside className={`panel ${collapsed ? 'collapsed' : ''}`}>
        <button className="collapseBtn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '⟩' : '⟨'}</button>

        {!collapsed && (
          <>
            <div className="topRow">
              <h2>{t.title}</h2>
              <div className="miniControls">
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="ja">日本語</option>
                </select>
                <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="neon">Neon</option>
                </select>
              </div>
            </div>
            <p>{t.subtitle}</p>

            <label>{t.robotFilter}</label>
            <select value={robotType} onChange={(e) => setRobotType(e.target.value)}>
              <option value="">{t.all}</option>
              <option value="robotaxi">robotaxi</option>
              <option value="delivery">delivery</option>
              <option value="warehouse">warehouse</option>
              <option value="unknown">unknown</option>
            </select>

            <label>{t.sourceFilter}</label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              <option value="">{t.all}</option>
              <option value="source-feed">source-feed</option>
              <option value="search-news">search-news</option>
            </select>

            <label>Map Level</label>
            <select value={viewLevel} onChange={(e) => setViewLevel(e.target.value)}>
              <option value="country">Country</option>
              <option value="province">Province/State</option>
              <option value="city">City</option>
            </select>

            <button onClick={() => loadCities(viewLevel)}>{t.refresh}</button>

            <div className="stats">
              <div>{t.cityCoverage}: {stats.totalCities}</div>
              <div>{t.events}: {stats.canonicalEvents}</div>
            </div>

            {selected?.properties?.label && (
              <div className="cityPanel">
                <h3>{selected.properties.label}</h3>
                <ul>
                  {cityItems.map((item) => (
                    <li key={item._id}>
                      <div><strong>{item.companyCanonical || item.company}</strong> · {item.robotType} · {item.eventType}</div>
                      <div>{t.sourceCount}: {item.sourceCount} · confidence: {Number(item.confidence || 0).toFixed(2)}</div>
                      {item.sourceUrls?.[0] && <a href={item.sourceUrls[0]} target="_blank" rel="noreferrer">source</a>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </aside>

      <main className="mapWrap">
        <Map
          initialViewState={{ longitude: 20, latitude: 20, zoom: 1.4 }}
          mapStyle={THEMES[theme].mapStyle}
          onClick={(e) => {
            const f = e.features?.[0];
            if (f?.properties) {
              setSelected(f);
              loadRegionItems(f.properties);
            }
          }}
          interactiveLayerIds={['city-points']}
        >
          <Source id="cities" type="geojson" data={geojson}>
            <Layer {...heatLayer} />
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
                <strong>{selected.properties.label}</strong>
                <div>{t.eventCount}: {selected.properties.eventCount}</div>
                <div>{t.sourceCount}: {selected.properties.sourceCount}</div>
              </div>
            </Popup>
          )}
        </Map>
      </main>
    </div>
  );
}
