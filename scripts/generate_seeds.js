const fs = require('node:fs');
const path = require('node:path');

const outDir = path.resolve(process.cwd(), 'seeds');

const ROBOT_TYPES = [
  'robotaxi',
  'delivery_robot',
  'warehouse_robot',
  'humanoid',
  'service_robot',
  'industrial_robot'
];

const EVENT_TYPES = [
  'testing',
  'pilot',
  'commercial',
  'campus',
  'fleet_expansion',
  'permit',
  'manufacturing',
  'deployment'
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
function cityKey(country, state, city) { return `${country}|${state}|${city}`.toLowerCase(); }
function fingerprint(companySlug, city_key, robot_type, event_type, event_month) {
  const month = String(event_month).slice(0, 7);
  return `${companySlug}|${city_key}|${robot_type}|${event_type}|${month}`;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260314);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const realCompanies = [
  ['Waymo', 'US', 'robotaxi', 'https://waymo.com'], ['Cruise', 'US', 'robotaxi', 'https://getcruise.com'],
  ['Zoox', 'US', 'robotaxi', 'https://zoox.com'], ['Motional', 'US', 'robotaxi', 'https://motional.com'],
  ['Aurora', 'US', 'robotaxi', 'https://aurora.tech'], ['Pony.ai', 'CN', 'robotaxi', 'https://pony.ai'],
  ['WeRide', 'CN', 'robotaxi', 'https://weride.ai'], ['AutoX', 'CN', 'robotaxi', 'https://autox.ai'],
  ['Baidu Apollo', 'CN', 'robotaxi', 'https://apollo.auto'], ['Mobileye', 'IL', 'robotaxi', 'https://mobileye.com'],
  ['May Mobility', 'US', 'robotaxi', 'https://maymobility.com'], ['Yandex AV', 'RU', 'robotaxi', 'https://yandex.com'],
  ['Starship Technologies', 'EE', 'delivery_robot', 'https://starship.xyz'], ['Serve Robotics', 'US', 'delivery_robot', 'https://serverobotics.com'],
  ['Kiwibot', 'US', 'delivery_robot', 'https://kiwibot.com'], ['Coco Robotics', 'US', 'delivery_robot', 'https://cocodelivery.com'],
  ['Nuro', 'US', 'delivery_robot', 'https://nuro.ai'], ['JD Logistics Robotics', 'CN', 'delivery_robot', 'https://jd.com'],
  ['Meituan Robotics', 'CN', 'delivery_robot', 'https://meituan.com'], ['Pudu Robotics', 'CN', 'service_robot', 'https://pudurobotics.com'],
  ['Keenon Robotics', 'CN', 'service_robot', 'https://keenon.com'], ['Geek+', 'CN', 'warehouse_robot', 'https://geekplus.com'],
  ['Locus Robotics', 'US', 'warehouse_robot', 'https://locusrobotics.com'], ['GreyOrange', 'US', 'warehouse_robot', 'https://greyorange.com'],
  ['AutoStore', 'NO', 'warehouse_robot', 'https://autostore.com'], ['Fetch Robotics', 'US', 'warehouse_robot', 'https://fetchrobotics.com'],
  ['Exotec', 'FR', 'warehouse_robot', 'https://exotec.com'], ['Hikrobot', 'CN', 'warehouse_robot', 'https://hikrobotics.com'],
  ['6 River Systems', 'US', 'warehouse_robot', 'https://6river.com'], ['Boston Dynamics', 'US', 'humanoid', 'https://bostondynamics.com'],
  ['Figure AI', 'US', 'humanoid', 'https://figure.ai'], ['Agility Robotics', 'US', 'humanoid', 'https://agilityrobotics.com'],
  ['Apptronik', 'US', 'humanoid', 'https://apptronik.com'], ['Unitree', 'CN', 'humanoid', 'https://unitree.com'],
  ['Fourier Intelligence', 'CN', 'humanoid', 'https://fourierintelligence.com'], ['Sanctuary AI', 'CA', 'humanoid', 'https://sanctuary.ai'],
  ['Tesla Optimus', 'US', 'humanoid', 'https://tesla.com'], ['SoftBank Robotics', 'JP', 'service_robot', 'https://softbankrobotics.com'],
  ['UBTech', 'CN', 'service_robot', 'https://ubtrobot.com'], ['Temi', 'IL', 'service_robot', 'https://temi.com'],
  ['OrionStar', 'CN', 'service_robot', 'https://orionstar.com'], ['PAL Robotics', 'ES', 'service_robot', 'https://pal-robotics.com'],
  ['ABB Robotics', 'CH', 'industrial_robot', 'https://abb.com/robotics'], ['FANUC', 'JP', 'industrial_robot', 'https://fanuc.com'],
  ['KUKA', 'DE', 'industrial_robot', 'https://kuka.com'], ['Yaskawa', 'JP', 'industrial_robot', 'https://yaskawa.com'],
  ['Comau', 'IT', 'industrial_robot', 'https://comau.com'], ['Nachi', 'JP', 'industrial_robot', 'https://nachi-fujikoshi.co.jp']
];

const companies = realCompanies.map(([name, country, robot_type, website]) => ({ name, slug: slugify(name), country, robot_type, website, status: 'active' }));
const namePrefix = ['Atlas', 'Nova', 'Sky', 'Urban', 'Global', 'Prime', 'Apex', 'Vector', 'Fusion', 'Quantum'];
const nameSuffix = ['Robotics', 'Automation', 'Dynamics', 'Machines', 'Systems', 'Labs', 'Motion', 'Intelligence'];
while (companies.length < 125) {
  const name = `${pick(namePrefix)} ${pick(nameSuffix)} ${companies.length}`;
  const slug = slugify(name);
  if (companies.find((c) => c.slug === slug)) continue;
  companies.push({ name, slug, country: pick(['US', 'CN', 'JP', 'DE', 'FR', 'GB', 'CA', 'KR', 'SG', 'AE', 'IN']), robot_type: pick(ROBOT_TYPES), website: `https://${slug}.example.com`, status: 'active' });
}

const baseCities = [
  ['Phoenix','Arizona','USA',33.4484,-112.074],['San Francisco','California','USA',37.7749,-122.4194],['Los Angeles','California','USA',34.0522,-118.2437],
  ['Austin','Texas','USA',30.2672,-97.7431],['Miami','Florida','USA',25.7617,-80.1918],['Houston','Texas','USA',29.7604,-95.3698],
  ['Mountain View','California','USA',37.3861,-122.0839],['Chicago','Illinois','USA',41.8781,-87.6298],['Las Vegas','Nevada','USA',36.1699,-115.1398],
  ['Foster City','California','USA',37.5585,-122.2711],['Washington','District of Columbia','USA',38.9072,-77.0369],['Pittsburgh','Pennsylvania','USA',40.4406,-79.9959],
  ['Berkeley','California','USA',37.8715,-122.273],['Dallas','Texas','USA',32.7767,-96.797],['Tempe','Arizona','USA',33.4255,-111.94],
  ['Fairfax','Virginia','USA',38.8462,-77.3064],['Guangzhou','Guangdong','China',23.1291,113.2644],['Shenzhen','Guangdong','China',22.5431,114.0579],
  ['Beijing','Beijing','China',39.9042,116.4074],['Wuhan','Hubei','China',30.5928,114.3055],['Chongqing','Chongqing','China',29.4316,106.9123],
  ['Shanghai','Shanghai','China',31.2304,121.4737],['Milton Keynes','England','UK',52.0406,-0.7594],['Hamburg','Hamburg','Germany',53.5511,9.9937],
  ['Oslo','Oslo','Norway',59.9139,10.7522],['Paris','Ile-de-France','France',48.8566,2.3522],['Toronto','Ontario','Canada',43.6532,-79.3832],
  ['Vancouver','British Columbia','Canada',49.2827,-123.1207],['Calgary','Alberta','Canada',51.0447,-114.0719],['Edmonton','Alberta','Canada',53.5461,-113.4938],
  ['Delhi','Delhi','India',28.6139,77.209],['Bengaluru','Karnataka','India',12.9716,77.5946],['Mumbai','Maharashtra','India',19.076,72.8777],
  ['Tokyo','Tokyo','Japan',35.6762,139.6503],['Osaka','Osaka','Japan',34.6937,135.5023]
];

const countries = [
  ['USA',['California','Texas','Arizona','Florida','New York','Illinois','Washington','Massachusetts']],['China',['Guangdong','Shanghai','Beijing','Jiangsu','Zhejiang','Hubei','Sichuan']],
  ['Canada',['Ontario','Quebec','Alberta','British Columbia','Manitoba']],['UK',['England','Scotland']],['Germany',['Bavaria','Berlin','Hamburg','Hesse']],
  ['France',['Ile-de-France','Auvergne-Rhone-Alpes']],['Japan',['Tokyo','Osaka','Aichi']],['India',['Karnataka','Maharashtra','Delhi','Tamil Nadu']],
  ['Australia',['New South Wales','Victoria','Queensland']],['Singapore',['Singapore']],['UAE',['Dubai','Abu Dhabi']],['Brazil',['Sao Paulo','Rio de Janeiro']],['South Korea',['Seoul','Busan']]
];

const cities = baseCities.map(([city,state,country,lat,lng]) => ({ city,state,country,lat,lng,city_key: cityKey(country,state,city) }));
let idx = 1;
while (cities.length < 320) {
  const [country, states] = pick(countries);
  const state = pick(states);
  const city = `City-${country.replace(/\s+/g, '')}-${idx++}`;
  const lat = Number((rand() * 140 - 70).toFixed(4));
  const lng = Number((rand() * 340 - 170).toFixed(4));
  const key = cityKey(country, state, city);
  if (cities.find((c) => c.city_key === key)) continue;
  cities.push({ city, state, country, lat, lng, city_key: key });
}

const companyByType = Object.fromEntries(ROBOT_TYPES.map((t) => [t, companies.filter((c) => c.robot_type === t)]));
const events = [];
const startMonth = new Date('2024-01-01T00:00:00Z');
while (events.length < 760) {
  const robot_type = pick(ROBOT_TYPES);
  const company = pick(companyByType[robot_type].length ? companyByType[robot_type] : companies);
  const city = pick(cities);
  const event_type = pick(EVENT_TYPES);
  const mo = int(0, 29);
  const d = new Date(startMonth);
  d.setUTCMonth(startMonth.getUTCMonth() + mo);
  const event_month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const fp = fingerprint(company.slug, city.city_key, robot_type, event_type, event_month);
  if (events.find((e) => e.fingerprint === fp)) continue;
  const first_seen_at = new Date(d);
  first_seen_at.setUTCDate(int(1, 20));
  const last_seen_at = new Date(first_seen_at);
  last_seen_at.setUTCDate(Math.min(28, first_seen_at.getUTCDate() + int(0, 8)));
  events.push({
    company_slug: company.slug,
    city_key: city.city_key,
    robot_type,
    event_type,
    event_month,
    robot_count: int(5, 250),
    source_count: int(1, 8),
    confidence: Number((0.45 + rand() * 0.5).toFixed(2)),
    fingerprint: fp,
    first_seen_at: first_seen_at.toISOString(),
    last_seen_at: last_seen_at.toISOString()
  });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'seed_companies.json'), JSON.stringify(companies, null, 2));
fs.writeFileSync(path.join(outDir, 'seed_cities.json'), JSON.stringify(cities, null, 2));
fs.writeFileSync(path.join(outDir, 'seed_canonical_events.json'), JSON.stringify(events, null, 2));
console.log({ companies: companies.length, cities: cities.length, canonical_events: events.length });
