import net from 'net'
import ndjson from 'ndjson'
import dotenv from 'dotenv'
import { z } from 'zod'
import { Log } from '../src/lib/logger.js'

dotenv.config({ quiet: true })

const EnvSchema = z.object({
    USE_TCP: z.enum(['true', 'false']),
    HOST: z.string().min(1),
    PORT: z.string().regex(/^\d+$/),
    SOCKET_PATH: z.string().min(1),
    CLIENT_API_KEY: z.string().min(1)
})

const validate = EnvSchema.safeParse(process.env)
if (!validate.success) {
    const required = ['USE_TCP', 'HOST', 'PORT', 'SOCKET_PATH', 'CLIENT_API_KEY']
    const missing = required.filter(k => !process.env[k] || process.env[k].length === 0)
    const invalid = validate.error.issues.map(i => i.path.join('.'))
    const unique = Array.from(new Set([...missing, ...invalid]))
    
    process.stderr.write(JSON.stringify({ missing: unique }) + '\n')
    process.exit(1)
}

Log.use('client')

const env = validate.data
const useTcp = env.USE_TCP === 'true'
const host = env.HOST
const port = parseInt(env.PORT, 10)
const target = env.SOCKET_PATH

const socket = useTcp ? net.createConnection({ host, port }) : net.createConnection(target)

const encoder = ndjson.stringify()
const decoder = ndjson.parse()

decoder.on('data', line => {
    process.stdout.write(JSON.stringify(line) + '\n')
    socket.end()
})

encoder.on('data', chunk => socket.write(chunk))

socket.on('connect', () => {
    encoder.write({
        headers: { 'api-key': env.CLIENT_API_KEY },
        query: '{ hello }'
    })
})

socket.pipe(decoder)