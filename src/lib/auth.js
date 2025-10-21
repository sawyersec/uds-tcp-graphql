import { parse } from 'graphql'
import crypto from 'crypto'
import { ch } from './ch.js'

export class Auth {
    static async getPrincipal(apiKey) {
        const hash = crypto.createHash('sha256').update(apiKey).digest('hex')

        const res = await ch.query({
            query: `
                SELECT id, user_id, role, status
                FROM api_keys
                WHERE key_hash = {hash:String} AND status = 'ACTIVE'
                LIMIT 1
            `,
            format: 'JSONEachRow',
            query_params: { hash }
        })

        const rows = await res.json()
        if (!Array.isArray(rows) || rows.length === 0) {
            return null
        }

        const row = rows[0]
        return {
            keyId: row.id,
            userId: row.user_id,
            role: row.role,
            status: row.status
        }
    }

    static async allows(principal, query) {
        if (!principal) {
            return false
        }

        if (String(principal.role).toUpperCase() === 'ADMIN') {
            return true
        }

        const doc = parse(query)
        let action = 'QUERY'
        const names = []

        for (const def of doc.definitions) {
            if (def.kind === 'OperationDefinition') {
                action = def.operation.toUpperCase()
                for (const sel of def.selectionSet.selections) {
                    if (sel.kind === 'Field') {
                        names.push(sel.name.value.toLowerCase())
                    }
                }
            }
        }

        for (const n of names) {
            if (n.startsWith('__')) {
                return false
            }
        }

        const res = await ch.query({
            query: `
                SELECT field
                FROM permissions
                WHERE key_id = {keyId:UUID} AND action = {action:String}
            `,
            format: 'JSONEachRow',
            query_params: { keyId: principal.keyId, action }
        })

        const rows = await res.json()
        const granted = new Set(rows.map(r => String(r.field).toLowerCase()))

        if (granted.has('*')) {
            return true
        }

        for (const n of names) {
            if (!granted.has(n)) {
                return false
            }
        }

        return true
    }
}