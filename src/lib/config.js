import dotenv from 'dotenv'
import { z } from 'zod'
import { Log } from './logger.js'

dotenv.config({ quiet: true })
Log.use('config')

const EnvSchema = z.object({
    USE_TCP: z.enum(['true', 'false']),
    HOST: z.string().min(1),
    PORT: z.string().regex(/^\d+$/),
    SOCKET_PATH: z.string().min(1),
    API_RULES: z.string().min(1),
    HTTP_HOST: z.string().min(1),
    HTTP_PORT: z.string().regex(/^\d+$/),
    HTTP_PATH: z.string().min(1),
    CH_HOST: z.string().min(1),
    CH_PORT: z.string().regex(/^\d+$/),
    CH_USER: z.string().min(1),
    CH_PASSWORD: z.string().min(1),
    CH_DATABASE: z.string().min(1)
})

export class EnvConfig {
    static env
    static rules

    static validate() {
        const parsed = EnvSchema.safeParse(process.env)
        if (!parsed.success) {
            const required = Object.keys(EnvSchema.shape)
            const missing = required.filter(k => !process.env[k] || process.env[k].length === 0)
            const invalid = parsed.error.issues.map(i => i.path.join('.'))
            const unique = Array.from(new Set([...missing, ...invalid]))
            if (unique.length) {
                Log.error('missing env', { error: new Error(JSON.stringify({ missing: unique })) })
                process.exit(1)
            }
        }

        this.env = parsed.data

        let raw
        try {
            raw = JSON.parse(this.env.API_RULES)
        } catch (e) {
            Log.error('api_rules invalid json', { error: e })
            process.exit(1)
        }

        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            Log.error('api_rules invalid root', { error: new Error('api_rules must be an object') })
            process.exit(1)
        }

        const coerced = {}
        const invalidKeys = []

        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === 'string') {
                coerced[key] = { allow: [value] }
                continue
            }

            if (Array.isArray(value)) {
                const ok = value.every(v => typeof v === 'string')
                if (!ok) {
                    invalidKeys.push(key)
                    continue
                }
                
                coerced[key] = { allow: value }
                continue
            }

            if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'allow')) {
                const a = value.allow
                const list = Array.isArray(a) ? a : [a]
                const ok = list.every(v => typeof v === 'string')
                
                if (!ok) {
                    invalidKeys.push(key)
                    continue
                }

                coerced[key] = { allow: list }
                continue
            }

            invalidKeys.push(key)
        }

        if (invalidKeys.length) {
            Log.error('api_rules invalid shape', { error: new Error(JSON.stringify({ invalid: invalidKeys })) })
            process.exit(1)
        }

        const normalized = {}
        for (const [key, entry] of Object.entries(coerced)) {
            normalized[key] = { allow: entry.allow.map(s => String(s).toLowerCase().trim()) }
        }

        this.rules = normalized
    }

    static get useTcp() {
        return this.env.USE_TCP === 'true'
    }

    static get host() {
        return this.env.HOST
    }

    static get port() {
        return parseInt(this.env.PORT, 10)
    }

    static get socketPath() {
        return this.env.SOCKET_PATH
    }

    static get httpHost() {
        return this.env.HTTP_HOST
    }

    static get httpPort() {
        return parseInt(this.env.HTTP_PORT, 10)
    }

    static get httpPath() {
        return this.env.HTTP_PATH
    }

    static get chHost() {
        return this.env.CH_HOST
    }

    static get chPort() {
        return parseInt(this.env.CH_PORT, 10)
    }

    static get chUser() {
        return this.env.CH_USER
    }

    static get chPassword() {
        return this.env.CH_PASSWORD
    }
    static get chDatabase() {
        return this.env.CH_DATABASE
    }
}