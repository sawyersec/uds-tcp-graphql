import fastify from 'fastify'
import net from 'net'
import ndjson from 'ndjson'
import dotenv from 'dotenv'
import { z } from 'zod'
import { EnvConfig } from '../lib/config.js'
import { Log } from '../lib/logger.js'
import { Errors, ErrorCodes } from '../lib/errors.js'
import { I18n } from '../lib/i18n.js'

dotenv.config({ quiet: true })

EnvConfig.validate()
Log.use('http')

const app = fastify({ logger: false })

const BodySchema = z.object({
    query: z.string().min(1),
    variables: z.record(z.any()).optional(),
    operationName: z.string().optional()
})

function send(payload) {
    return new Promise((resolve, reject) => {
        const socket = EnvConfig.useTcp ? net.createConnection({ host: EnvConfig.host, port: EnvConfig.port }) : net.createConnection(EnvConfig.socketPath)

        const encoder = ndjson.stringify()
        const decoder = ndjson.parse()

        let settled = false

        decoder.on('data', line => {
            if (settled) return
            settled = true
            socket.end()
            resolve(line)
        })

        encoder.on('data', chunk => socket.write(chunk))

        socket.on('error', err => {
            if (settled) return
            settled = true
            reject(err)
        })

        socket.pipe(decoder)
        encoder.write(payload)
    })
}

app.post(EnvConfig.httpPath, async (req, reply) => {
    const apiKey = req.headers['api-key']
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
        return reply.code(401).send(Errors.wrap(I18n.t('unauthorized'), ErrorCodes.UNAUTHORIZED, 401))
    }

    const parsed = BodySchema.safeParse(req.body)
    if (!parsed.success) {
        return reply.code(400).send(Errors.wrap(I18n.t('bad_request'), ErrorCodes.BAD_REQUEST, 400))
    }

    const payload = { headers: { 'api-key': apiKey }, ...parsed.data }

    try {
        const res = await send(payload)

        let status = Number.isFinite(Number(res?.status)) ? Number(res.status) : 200

        if (status === 200 && Array.isArray(res?.errors)) {
            const hasParseFail = res.errors.some(e => e?.extensions?.code === 'GRAPHQL_PARSE_FAILED')
            if (hasParseFail) {
                status = 501
            }
        }

        return reply.code(status).send(res)
    } catch (e) {
        Log.error('gateway error', { error: e })
        return reply.code(500).send(Errors.wrap(I18n.t('internal_server_error'), ErrorCodes.INTERNAL_SERVER_ERROR, 500))
    }
})

app.listen({ host: EnvConfig.httpHost, port: EnvConfig.httpPort }, (err, address) => {
    if (err) {
        Log.error('http server error', { error: err })
        process.exit(1)
    }
    
    Log.info(`graphql communicator now available @ ${address}`)
})
