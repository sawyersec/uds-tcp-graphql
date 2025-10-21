import { createClient } from '@clickhouse/client'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config({ quiet: true })
const url = 'http://' + process.env.CH_HOST + ':' + process.env.CH_PORT
const client = createClient({
    url,
    username: process.env.CH_USER,
    password: process.env.CH_PASSWORD,
    database: process.env.CH_DATABASE
})

async function run() {
    const userIdRes = await client.query({ query: 'SELECT generateUUIDv4() AS id', format: 'JSONEachRow' })
    const [{ id: userId }] = await userIdRes.json()
    await client.command({
        query: `INSERT INTO ${process.env.CH_DATABASE}.users (id) VALUES ({id:UUID})`,
        query_params: { id: userId }
    })
    const apiKeyRes = await client.query({ query: 'SELECT generateUUIDv4() AS key', format: 'JSONEachRow' })
    const [{ key: apiKey }] = await apiKeyRes.json()
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const keyIdRes = await client.query({ query: 'SELECT generateUUIDv4() AS id', format: 'JSONEachRow' })
    const [{ id: keyId }] = await keyIdRes.json()
    await client.command({
        query: `INSERT INTO ${process.env.CH_DATABASE}.api_keys (id, user_id, key_hash, role, status) VALUES ({id:UUID}, {user_id:UUID}, {key_hash:String}, 'ADMIN', 'ACTIVE')`,
        query_params: { id: keyId, user_id: userId, key_hash: keyHash }
    })
    process.stdout.write(JSON.stringify({ api_key: apiKey, role: 'ADMIN', status: 'ACTIVE' }) + '\n')
    process.exit(0)
}
run().catch(e => {
    process.stderr.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(1)
})