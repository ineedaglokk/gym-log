# Template: the deploy workflow fills in the KV namespace id and writes wrangler.toml
name = "shlepa-bot"
main = "worker.js"
compatibility_date = "2024-09-23"
workers_dev = true

[triggers]
crons = ["*/15 * * * *"]

[[kv_namespaces]]
binding = "KV"
id = "__KV_ID__"
