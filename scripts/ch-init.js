import { createClient } from '@clickhouse/client'
import dotenv from 'dotenv'
dotenv.config({ quiet: true })
const url = 'http://' + process.env.CH_HOST + ':' + process.env.CH_PORT
const admin = createClient({
    url,
    username: process.env.CH_USER,
    password: process.env.CH_PASSWORD
})
await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${process.env.CH_DATABASE}` })
const client = createClient({
    url,
    username: process.env.CH_USER,
    password: process.env.CH_PASSWORD,
    database: process.env.CH_DATABASE
})

async function run() {
    await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${process.env.CH_DATABASE}.users (
            id UUID DEFAULT generateUUIDv4(),
            email String,
            name String,
            created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree ORDER BY id
    ` })

    await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${process.env.CH_DATABASE}.api_keys (
            id UUID DEFAULT generateUUIDv4(),
            user_id UUID,
            key_hash FixedString(64),
            role Enum('ADMIN' = 1, 'USER' = 2),
            status Enum('ACTIVE' = 1, 'REVOKED' = 2),
            created_at DateTime DEFAULT now(),
            revoked_at Nullable(DateTime)
        ) ENGINE = MergeTree ORDER BY id
    ` })

    await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${process.env.CH_DATABASE}.permissions (
            key_id UUID,
            action Enum('QUERY' = 1, 'MUTATION' = 2),
            field String,
            created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree ORDER BY (key_id, action, field)
    ` })

    await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${process.env.CH_DATABASE}.access_logs (
            ts DateTime,
            key_id UUID,
            operation String,
            fields Array(String),
            status UInt16
        ) ENGINE = MergeTree ORDER BY ts
    ` })

    process.stdout.write('ok\n')
    process.exit(0)
}
run().catch(e => {
    process.stderr.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(1)
})