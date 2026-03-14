import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Map, { Layer, Source, Popup } from 'react-map-gl/maplibre';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';
const THEMES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  neon: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
};

const I18N = {
  zh: { title: 'Global Robot City Atlas', subtitle: '全球机器人城市分布', continent: '洲（Continent）', city: '城市关键词', type: '机器人类型', refresh: '刷新数据', all: '全部' },
  en: { title: 'Global Robot City Atlas', subtitle: 'Robot deployment distribution worldwide', continent: 'Continent', city: 'City keyword', type: 'Robot type', refresh: 'Refresh', all: 'All' },
  es: { title: 'Atlas Global de Robots', subtitle: 'Distribución de robots por ciudad', continent: 'Continente', city: 'Palabra clave de ciudad', type: 'Tipo de robot', refresh: 'Actualizar', all: 'Todos' },
  fr: { title: 'Atlas Mondial des Robots', subtitle: 'Répartition des robots par ville', continent: 'Continent', city: 'Mot-clé de ville', type: 'Type de robot', refresh: 'Actualiser', all: 'Tous' },
  ja: { title: 'グローバルロボット都市アトラス', subtitle: '都市別ロボット分布', continent: '大陸', city: '都市キーワード', type: 'ロボット種別', refresh: '更新', all: 'すべて' }
};

export default function App() {
  const [lang, setLang] = useState('zh');
  const [theme, setTheme] = useState('dark');
  const t = I18N[lang] || I18N.zh;
  const themeOrder = ['dark', 'light', 'neon'];
  const nextTheme = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

  const mapRef = useRef(null);

  const [zoom, setZoom] = useState(1.4);
  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selected, setSelected] = useState(null);
  const [robotType, setRobotType] = useState('');
  const [continent, setContinent] = useState('');
  const [cityKeyword, setCityKeyword] = useState('');
  const [cityItems, setCityItems] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [stats, setStats] = useState({ canonicalEvents: 0, totalCities: 0, estimatedRobots: 0 });

  const mapLevel = zoom < 3 ? 'country' : zoom < 6 ? 'province' : 'city';

  const heatLayer = useMemo(() => ({
    id: 'city-heat',
    type: 'heatmap',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['max', ['get', 'deployedRobots'], ['*', ['get', 'eventCount'], 2]], 1, 0.15, 80, 1],
      'heatmap-intensity': 0.9,
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 22, 6, 32, 12, 44],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)', 0.2, '#2ec7ff', 0.4, '#4fffb0', 0.6, '#ffe66d', 0.8, '#ff7b54', 1, '#ff3d71'
      ],
      'heatmap-opacity': 0.7
    }
  }), []);

  const glowLayer = useMemo(() => ({
    id: 'city-glow', type: 'circle',
    paint: {
      'circle-color': '#5fd8ff',
      'circle-radius': ['interpolate', ['linear'], ['max', ['get', 'deployedRobots'], ['*', ['get', 'eventCount'], 3]], 1, 10, 20, 17, 100, 26],
      'circle-opacity': 0.18,
      'circle-blur': 1
    }
  }), []);

  const pointLayer = useMemo(() => ({
    id: 'city-points',
    type: 'circle',
    paint: {
      'circle-color': ['interpolate', ['linear'], ['max', ['get', 'deployedRobots'], ['*', ['get', 'eventCount'], 3]], 1, '#59d8ff', 15, '#35ffb6', 50, '#ffcd4a', 120, '#ff6b6b'],
      'circle-radius': ['interpolate', ['linear'], ['max', ['get', 'deployedRobots'], ['*', ['get', 'eventCount'], 3]], 1, 4, 10, 8, 40, 14, 120, 22],
      'circle-opacity': 0.95,
      'circle-stroke-width': 1.2,
      'circle-stroke-color': '#eaffff'
    }
  }), []);

  const topRegions = useMemo(() => {
    return [...(geojson.features || [])]
      .sort((a, b) => (b.properties?.deployedRobots || b.properties?.eventCount || 0) - (a.properties?.deployedRobots || a.properties?.eventCount || 0))
      .slice(0, 8);
  }, [geojson]);

  async function loadCities(level = mapLevel) {
    const [citiesRes, statsRes] = await Promise.all([
      axios.get(`${API_BASE}/map/regions`, { params: { level } }),
      axios.get(`${API_BASE}/stats`)
    ]);

    let features = citiesRes.data.features || [];
    if (continent) features = features.filter((f) => f.properties.continent === continent);
    if (cityKeyword.trim()) {
      const q = cityKeyword.trim().toLowerCase();
      features = features.filter((f) => String(f.properties.label || '').toLowerCase().includes(q));
    }

    setGeojson({ type: 'FeatureCollection', features });
    setStats(statsRes.data || {});
  }

  async function loadRegionItems(props) {
    const params = { robotType: robotType || undefined, limit: 50 };
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
    loadCities(mapLevel);
  }, [mapLevel, continent, cityKeyword]);

  useEffect(() => {
    const t = setTimeout(() => {
      mapRef.current?.getMap?.().resize?.();
    }, 120);
    return () => clearTimeout(t);
  }, [collapsed]);

  return (
    <div className={`layout theme-${theme}`} style={{ gridTemplateColumns: collapsed ? '46px 1fr' : '360px 1fr' }}>
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
                <button type="button" className="themeToggleBtn" onClick={nextTheme}>
                  Theme: {theme}
                </button>
              </div>
            </div>
            <p>{t.subtitle}</p>

            <div className="stats">
              <div><strong>{Number(stats.estimatedRobots || 0).toLocaleString()}</strong> estimated deployed robots</div>
              <div><strong>{Number(stats.canonicalEvents || 0).toLocaleString()}</strong> canonical deployment events</div>
              <div><strong>{Number(stats.totalCities || 0).toLocaleString()}</strong> mapped cities</div>
            </div>

            <label>{t.continent}</label>
            <select value={continent} onChange={(e) => setContinent(e.target.value)}>
              <option value="">{t.all}</option>
              <option value="Asia">Asia</option>
              <option value="Europe">Europe</option>
              <option value="North America">North America</option>
              <option value="South America">South America</option>
              <option value="Oceania">Oceania</option>
              <option value="Africa">Africa</option>
              <option value="Other">Other</option>
            </select>

            <label>{t.city}</label>
            <input value={cityKeyword} onChange={(e) => setCityKeyword(e.target.value)} placeholder="例如: Shanghai / Toronto" />

            <label>{t.type}</label>
            <select value={robotType} onChange={(e) => setRobotType(e.target.value)}>
              <option value="">{t.all}</option>
              <option value="robotaxi">robotaxi</option>
              <option value="delivery">delivery</option>
              <option value="warehouse">warehouse</option>
              <option value="unknown">unknown</option>
            </select>

            <button onClick={() => loadCities(mapLevel)}>{t.refresh}</button>

            <div className="cityPanel">
              <h3>Top deployment hotspots ({mapLevel})</h3>
              <ul>
                {topRegions.map((region) => (
                  <li key={`${region.properties?.label}-${region.properties?.level}`}>
                    <div><strong>{region.properties?.label}</strong></div>
                    <div>{region.properties?.deployedRobots || 0} robots · {region.properties?.eventCount || 0} events · {region.properties?.companyCount || 0} companies</div>
                  </li>
                ))}
              </ul>
            </div>

            {selected?.properties?.label && (
              <div className="cityPanel">
                <h3>{selected.properties.label}</h3>
                <ul>
                  {cityItems.map((item) => (
                    <li key={item._id}>
                      <div><strong>{item.companyCanonical || item.company}</strong> · {item.robotType} · {item.eventType}</div>
                      <div>robots: {item.countBest || 'n/a'} · sources: {item.sourceCount} · confidence: {Number(item.confidence || 0).toFixed(2)}</div>
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
          ref={mapRef}
          initialViewState={{ longitude: 20, latitude: 20, zoom: 1.4 }}
          minZoom={1}
          maxZoom={8}
          maxPitch={0}
          dragRotate={false}
          touchZoomRotate={false}
          mapStyle={THEMES[theme]}
          onMoveEnd={(e) => {
            const z = Math.max(1, Math.min(8, Number(e.viewState.zoom) || 1.4));
            setZoom(z);
          }}
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
            <Layer {...glowLayer} />
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
                <div>robots: {selected.properties.deployedRobots || 0}</div>
                <div>events: {selected.properties.eventCount}</div>
                <div>companies: {selected.properties.companyCount || 0}</div>
                <div>sources: {selected.properties.sourceCount}</div>
              </div>
            </Popup>
          )}
        </Map>
      </main>
    </div>
  );
}
