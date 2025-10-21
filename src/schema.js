import { gql } from 'graphql-tag'
import { ch } from './lib/ch.js'
import { z } from 'zod'
import crypto from 'crypto'

export const typeDefs = gql`
    type Me {
        id: ID!
        name: String
        role: String
        status: String
    }

    type ApiKey {
        id: ID!
        userId: ID!
        role: String!
        status: String!
    }

    type CreateApiKeyResult {
        apiKey: String!
        id: ID!
        userId: ID!
        role: String!
        status: String!
    }

    type RevokeApiKeyResult {
        id: ID!
        status: String!
    }

    type Permission {
        keyId: ID!
        action: String!
        field: String!
    }

    type Query {
        hello: String
        me: Me
        adminHealth: String
        adminKeys: [ApiKey!]!
        adminPermissions(keyId: ID!): [Permission!]!
    }

    type Mutation {
        createApiKey(userId: ID, role: String!): CreateApiKeyResult!
        revokeApiKey(id: ID!): RevokeApiKeyResult!
        grantPermission(keyId: ID!, action: String!, field: String!): Boolean!
        removePermission(keyId: ID!, action: String!, field: String!): Boolean!
    }
`

const MeRow = z.object({
    id: z.string(),
    name: z.string().optional()
})

export const resolvers = {
    Query: {
        hello: () => 'world',
        me: async (_, __, ctx) => {
            if (!ctx || !ctx.principal) {
                return null
            }

            const res = await ch.query({
                query: `
                    SELECT id, name
                    FROM users
                    WHERE id = {id:UUID}
                    LIMIT 1
                `,
                format: 'JSONEachRow',
                query_params: { id: ctx.principal.userId }
            })

            const rows = await res.json()
            const parsed = z.array(MeRow).safeParse(rows)
            if (!parsed.success || parsed.data.length === 0) {
                return null
            }

            const user = parsed.data[0]
            return {
                id: user.id,
                name: user.name,
                role: ctx.principal.role,
                status: ctx.principal.status
            }
        },
        adminHealth: async (_, __, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            return 'ok'
        },
        adminKeys: async (_, __, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            const res = await ch.query({
                query: `
                    SELECT id, user_id, role, status
                    FROM api_keys
                    ORDER BY created_at DESC
                    LIMIT 100
                `,
                format: 'JSONEachRow'
            })
            const rows = await res.json()
            return rows.map(r => ({ id: r.id, userId: r.user_id, role: r.role, status: r.status }))
        },
        adminPermissions: async (_, args, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            const res = await ch.query({
                query: `
                    SELECT key_id, action, field
                    FROM permissions
                    WHERE key_id = {key_id:UUID}
                `,
                format: 'JSONEachRow',
                query_params: { key_id: args.keyId }
            })
            const rows = await res.json()
            return rows.map(r => ({ keyId: r.key_id, action: r.action, field: r.field }))
        }
    },
    Mutation: {
        createApiKey: async (_, args, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            const apiKey = crypto.randomUUID()
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
            const keyIdRes = await ch.query({ query: 'SELECT generateUUIDv4() AS id', format: 'JSONEachRow' })
            const [{ id: keyId }] = await keyIdRes.json()
            const userId = args.userId && String(args.userId).length ? args.userId : ctx.principal.userId
            await ch.command({
                query: `
                    INSERT INTO api_keys (id, user_id, key_hash, role, status)
                    VALUES ({id:UUID}, {user_id:UUID}, {key_hash:String}, {role:String}, 'ACTIVE')
                `,
                query_params: { id: keyId, user_id: userId, key_hash: keyHash, role: args.role }
            })
            return { apiKey, id: keyId, userId, role: args.role, status: 'ACTIVE' }
        },
        revokeApiKey: async (_, args, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            await ch.command({
                query: `
                    ALTER TABLE api_keys
                    UPDATE status = 'REVOKED', revoked_at = now()
                    WHERE id = {id:UUID}
                `,
                query_params: { id: args.id }
            })
            return { id: args.id, status: 'REVOKED' }
        },
        grantPermission: async (_, args, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            await ch.command({
                query: `
                    INSERT INTO permissions (key_id, action, field)
                    VALUES ({key_id:UUID}, {action:String}, {field:String})
                `,
                query_params: { key_id: args.keyId, action: args.action, field: args.field }
            })
            return true
        },
        removePermission: async (_, args, ctx) => {
            if (!ctx || !ctx.principal || ctx.principal.role !== 'ADMIN') {
                throw new Error('forbidden')
            }
            await ch.command({
                query: `
                    ALTER TABLE permissions
                    DELETE WHERE key_id = {key_id:UUID} AND action = {action:String} AND field = {field:String}
                `,
                query_params: { key_id: args.keyId, action: args.action, field: args.field }
            })
            return true
        }
    }
}