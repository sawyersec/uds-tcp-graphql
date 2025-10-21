# GraphQL Apollo + ClickHouse (NDJSON Socket Gateway)

A minimal, production minded GraphQL service that features:
- Apollo Server with strict error hygiene (stack traces stripped from responses)
- Fastify HTTP gateway proxying GraphQL to a local NDJSON socket server
- ClickHouse for identity, API keys, and permissions
- API‑key authentication with admin‑only operations
- Clean, predictable error envelopes and parse errors surfaced as HTTP 501

## Overview

- Transport: HTTP gateway (`/graphql`) forwards requests to a local TCP/Unix socket using NDJSON
- Execution: Apollo Server handles parsing/validation/execution and returns a single GraphQL result
- Storage: ClickHouse tables for `users`, `api_keys`, and `permissions`
- AuthZ: API keys resolve to a principal; ADMIN bypasses checks. Non admin permissions are per key and operation (`QUERY`/`MUTATION`) for specific field names. Introspection is blocked for non‑admin keys.

High‑level flow:
Client -> Fastify (HTTP) -> NDJSON Socket -> Apollo -> ClickHouse


## Requirements

- Node.js 18+ (tested on Windows; Linux/macOS work with Unix sockets)
- ClickHouse reachable over HTTP (`CH_PORT` defaults to `8123`)
- A `.env` file with the required variables (see below)

## Quick Start

1) Install dependencies
```bash
npm ci
```

2) Create `.env` in the project root
```plaintext
USE_TCP=true
HOST=127.0.0.1
PORT=7070
SOCKET_PATH=\\\\.\\pipe\\graphql-apollo

HTTP_HOST=127.0.0.1
HTTP_PORT=8080
HTTP_PATH=/graphql

CH_HOST=127.0.0.1
CH_PORT=8123
CH_USER=default
CH_PASSWORD=your_password
CH_DATABASE=gql_v1
```

# Must be valid JSON. For local dev, this permissive shape is fine.
API_RULES={"default":{"allow":["*"]}}

3) Initialize ClickHouse schema (creates database tables)
```bash
node .\scripts\ch-init.js
```

4) Seed an admin API key (prints the API key to stdout)
```bash
node .\scripts\ch-seed-key.js
```

5) Start the socket server (GraphQL executor)
```bash
node .\src\servers\socket.js
```

6) Start the HTTP gateway
```bash
node .\src\servers\http.js
```

7) Test a simple query (`me`)
- Send a POST to `http://127.0.0.1:8080/graphql` with header `api-key: <your-admin-key>`
- Body:
```plaintext
{
  "query": "{ me { id name role status } }"
}
```

### Postman Setup

- Method: `POST`
- URL: `http://127.0.0.1:8080/graphql`
- Headers: `api-key: <your-admin-key>`
- Body: raw JSON with `query`, optional `variables`, optional `operationName`

## GraphQL Schema (Simple highlights of what's included)

- Query
  - `hello`: string
  - `me`: returns current user (`id`, `name`, `role`, `status`)
  - `adminHealth`: admin‑only health check
  - `adminKeys`: list API keys (admin‑only)
  - `adminPermissions(keyId: ID!)`: permissions for a key (admin‑only)

- Mutation (admin‑only)
  - `createApiKey(userId?: ID, role: String!)`: returns `apiKey`, `id`, `userId`, `role`, `status`
  - `revokeApiKey(id: ID!)`: sets status to `REVOKED`
  - `grantPermission(keyId: ID!, action: String!, field: String!)`
  - `removePermission(keyId: ID!, action: String!, field: String!)`

### Examples

Create a new API key (ADMIN only)
```plaintext
{
  "query": "mutation($role: String!) { createApiKey(role: $role) { apiKey id userId role status } }",
  "variables": { "role": "USER" }
}
```

Grant permission for a key to call `me` (USER)
```plaintext
{
  "query": "mutation($keyId: ID!, $action: String!, $field: String!) { grantPermission(keyId: $keyId, action: $action, field: $field) }",
  "variables": { "keyId": "<uuid-of-api-key>", "action": "QUERY", "field": "me" }
}
```

List permissions (ADMIN)
```plaintext
{
  "query": "query($keyId: ID!) { adminPermissions(keyId: $keyId) { keyId action field } }",
  "variables": { "keyId": "<uuid-of-api-key>" }
}
```

## Error Handling

- Errors are always wrapped as:
```json
{ "errors": [{ "message": "...", "extensions": { "code": "..." } }], "status": <httpStatus> }
```

- Stack traces are logged to the console and removed from GraphQL responses
- Parse failures (e.g., invalid syntax) return HTTP `501` and use GraphQL error code `GRAPHQL_PARSE_FAILED`

If you ever see `200` with a body containing `"status": 501`, ensure the HTTP gateway is up to date?: it maps the body `status` to the HTTP status and infers `501` for parse failures.

## ClickHouse Notes

- `CH_HOST`/`CH_PORT` are used via HTTP client; ensure network access
- Tables are fully qualified to `CH_DATABASE`
- `api_keys` include `id (UUID)`, `user_id (UUID)`, `key_hash (sha256)`, `role`, `status`
- `permissions` enforce per‑key, per‑action, per‑field access for non‑admin keys

## Project Scripts

- `scripts/ch-init.js`: creates `users`, `api_keys`, `permissions` tables
- `scripts/ch-seed-key.js`: creates a user + admin API key and prints the new key

## Deployment Tips

- Run the socket server and HTTP gateway under a process manager (didn't feel like implementing my own)
- Provide a secure `.env` in production and restrict ClickHouse access to the app only
- Consider rate limiting and body size limits at the HTTP gateway (business preference, doesn't really matter)


There will be no licensing for this project, It's public to all. You may modify and "steal" as you wish <3