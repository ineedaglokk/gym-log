# Template: put the D1 database id in place of __D1_ID__ and save as wrangler.toml (see server/README.md).
name = "forma-api"
main = "worker.js"
compatibility_date = "2025-01-01"
workers_dev = true

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "forma"
database_id = "__D1_ID__"

[vars]
# Check the model list before deploying: https://developers.cloudflare.com/workers-ai/models/
# (qwq-32b and qwen3-30b-a3b-fp8 are retired on 2026-11-20)
MODEL = "@cf/qwen/qwen3.8-27b"
REASONING = "low"
DAILY_LIMIT = "40"
ALLOWED_ORIGINS = "https://ineedaglokk.github.io,http://localhost:8765"
MAX_USERS = "12"
SIGNUP = "on"
