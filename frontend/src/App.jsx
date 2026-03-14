import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Map, { Layer, Source, Popup } from 'react-map-gl/maplibre';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api';
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

export default function App() {
  const [geojson, setGeojson] = useState({ type: 'FeatureCollection', features: [] });
  const [selected, setSelected] = useState(null);
  const [robotType, setRobotType] = useState('');
  const [continent, setContinent] = useState('');
  const [cityKeyword, setCityKeyword] = useState('');
  const [cityItems, setCityItems] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1.4);
  const [stats, setStats] = useState({ canonicalEvents: 0, totalCities: 0 });

  const mapLevel = zoom < 3 ? 'country' : zoom < 6 ? 'province' : 'city';

  const heatLayer = useMemo(() => ({
    id: 'city-heat',
    type: 'heatmap',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'eventCount'], 1, 0.2, 30, 1],
      'heatmap-intensity': 0.85,
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 22, 6, 30, 12, 40],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(33,102,172,0)', 0.2, '#2ec7ff', 0.4, '#4fffb0', 0.6, '#ffe66d', 0.8, '#ff7b54', 1, '#ff3d71'
      ],
      'heatmap-opacity': 0.65
    }
  }), []);

  const glowLayer = useMemo(() => ({
    id: 'city-glow', type: 'circle',
    paint: {
      'circle-color': '#5fd8ff',
      'circle-radius': ['interpolate', ['linear'], ['get', 'eventCount'], 1, 10, 10, 16, 30, 24],
      'circle-opacity': 0.18,
      'circle-blur': 1
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

  return (
    <div className="layout" style={{ gridTemplateColumns: collapsed ? '46px 1fr' : '360px 1fr' }}>
      <aside className={`panel ${collapsed ? 'collapsed' : ''}`}>
        <button className="collapseBtn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '⟩' : '⟨'}</button>

        {!collapsed && (
          <>
            <h2>Global Robot City Atlas</h2>
            <p>全球每个城市机器人数量可视化</p>

            <div className="stats">
              <div>全球机器人事件：{stats.canonicalEvents || 0}</div>
              <div>覆盖城市：{stats.totalCities || 0}</div>
              <div>当前地图级别：{mapLevel}</div>
            </div>

            <label>洲（Continent）</label>
            <select value={continent} onChange={(e) => setContinent(e.target.value)}>
              <option value="">全部</option>
              <option value="Asia">Asia</option>
              <option value="Europe">Europe</option>
              <option value="North America">North America</option>
              <option value="South America">South America</option>
              <option value="Oceania">Oceania</option>
              <option value="Africa">Africa</option>
              <option value="Other">Other</option>
            </select>

            <label>城市关键词</label>
            <input value={cityKeyword} onChange={(e) => setCityKeyword(e.target.value)} placeholder="例如: Shanghai / Toronto" />

            <label>机器人类型</label>
            <select value={robotType} onChange={(e) => setRobotType(e.target.value)}>
              <option value="">全部</option>
              <option value="robotaxi">robotaxi</option>
              <option value="delivery">delivery</option>
              <option value="warehouse">warehouse</option>
              <option value="unknown">unknown</option>
            </select>

            <button onClick={() => loadCities(mapLevel)}>刷新数据</button>

            {selected?.properties?.label && (
              <div className="cityPanel">
                <h3>{selected.properties.label}</h3>
                <ul>
                  {cityItems.map((item) => (
                    <li key={item._id}>
                      <div><strong>{item.companyCanonical || item.company}</strong> · {item.robotType} · {item.eventType}</div>
                      <div>sources: {item.sourceCount} · confidence: {Number(item.confidence || 0).toFixed(2)}</div>
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
          mapStyle={MAP_STYLE}
          onMoveEnd={(e) => setZoom(e.viewState.zoom)}
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
                <div>robots/events: {selected.properties.eventCount}</div>
                <div>sources: {selected.properties.sourceCount}</div>
              </div>
            </Popup>
          )}
        </Map>
      </main>
    </div>
  );
}
