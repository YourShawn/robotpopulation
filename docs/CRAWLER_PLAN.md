# Crawler Plan (Focused Company Pool)

Phase-1 target companies:
- Waymo, Starship Technologies, Serve Robotics, Nuro, Kiwibot, Coco Robotics, Zoox, Pony.ai, WeRide, AutoX

## Source model
Use `company_sources` seed (`seeds/company_sources.seed.json`) with:
- `company_slug`
- `source_type`
- `url`
- `crawl_strategy`
- `active`

## Supported crawl_strategy
- `rss`
- `list_page`
- `structured_list`
- `structured_table`
- `static_html`

## Pipeline
`company_sources -> crawler jobs -> raw_articles -> extracted_facts -> canonical_events`

## Rules
- `robot_count = null` when no explicit quantity
- fallback `event_type = deployment` when evidence is weak
- keep `source_url` and `source_name` in facts/events evidence chain
