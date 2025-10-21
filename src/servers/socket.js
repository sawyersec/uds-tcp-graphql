import net from 'net'
import fs from 'fs'
import { ApolloWrapper } from '../lib/apollo.js'
import { EnvConfig } from '../lib/config.js'
import { MessageSchema, createDecoder, createEncoder } from '../lib/message.js'
import { Auth } from '../lib/auth.js'
import { Log } from '../lib/logger.js'
import { Errors, ErrorCodes } from '../lib/errors.js'
import { I18n } from '../lib/i18n.js'
import crypto from 'crypto'
import { ch } from '../lib/ch.js'

async function main() {
    const isWindows = process.platform === 'win32'
    const listenTarget = EnvConfig.useTcp ? { host: EnvConfig.host, port: EnvConfig.port } : EnvConfig.socketPath

    if (!EnvConfig.useTcp && !isWindows && fs.existsSync(EnvConfig.socketPath)) {
        fs.unlinkSync(EnvConfig.socketPath)
    }

    const tcpServer = net.createServer(socket => {
        socket.setEncoding('utf8')

        const decoder = createDecoder()
        const encoder = createEncoder()

        decoder.on('error', err => {
            Log.error('decoder error', { error: err })
            encoder.write(Errors.wrap(I18n.t('bad_request'), ErrorCodes.BAD_REQUEST, 400))
        })

        decoder.on('data', async (payload) => {
            const parsed = MessageSchema.safeParse(payload)
            if (!parsed.success) {
                Log.warn('invalid payload', { error: new Error('invalid payload') })
                encoder.write(Errors.wrap(I18n.t('bad_request'), ErrorCodes.BAD_REQUEST, 400))
                return
            }

            const { query, variables, operationName, headers } = parsed.data
            const apiKey = headers['api-key']
            if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
                Log.warn('unauthorized', { error: new Error('unauthorized') })
                encoder.write(Errors.wrap(I18n.t('unauthorized'), ErrorCodes.UNAUTHORIZED, 401))
                return
            }

            const hash = crypto.createHash('sha256').update(apiKey).digest('hex')

            let principal
            try {
                const res = await ch.query({
                    query: `
                        SELECT id, user_id, role, status
                        FROM api_keys
                        WHERE key_hash = {hash:String} AND status = 'ACTIVE'
                        LIMIT 1
                    `,
                    format: 'JSONEachRow',
                    query_params: { hash: crypto.createHash('sha256').update(apiKey).digest('hex') }
                })

                const rows = await res.json()
                if (!Array.isArray(rows) || rows.length === 0) {
                    Log.warn('unauthorized', { error: new Error('unauthorized') })
                    encoder.write(Errors.wrap(I18n.t('unauthorized'), ErrorCodes.UNAUTHORIZED, 401))
                    return
                }

                const r = rows[0]
                principal = { keyId: r.id, userId: r.user_id, role: r.role, status: r.status }
            } catch (e) {
                Log.error('auth lookup failed', { error: e })
                encoder.write(Errors.wrap(I18n.t('internal_server_error'), ErrorCodes.INTERNAL_SERVER_ERROR, 500))
                return
            }

            let allowed
            try {
                allowed = await Auth.allows(principal, query)
            } catch (e) {
                Log.error('auth check failed', { error: e })
                encoder.write(Errors.wrap(I18n.t('internal_server_error'), ErrorCodes.INTERNAL_SERVER_ERROR, 500))
                return
            }
            if (!allowed) {
                Log.warn('forbidden', { error: new Error('forbidden') })
                encoder.write(Errors.wrap(I18n.t('forbidden'), ErrorCodes.FORBIDDEN, 403))
                return
            }

            let result
            try {
                result = await ApolloWrapper.server.executeOperation({ query, variables, operationName }, { contextValue: { principal } })
            } catch (e) {
                Log.error('execute error', { error: e })
                encoder.write(Errors.wrap(I18n.t('internal_server_error'), ErrorCodes.INTERNAL_SERVER_ERROR, 500))
                return
            }

            const body = result && result.body
            if (body && body.kind === 'single' && body.singleResult) {
                encoder.write(JSON.stringify(body.singleResult))
                return
            }

            encoder.write(Errors.wrap(I18n.t('internal_server_error'), ErrorCodes.INTERNAL_SERVER_ERROR, 500))
        })

        encoder.on('data', chunk => socket.write(chunk))
        socket.pipe(decoder)
    })

    tcpServer.on('error', err => {
        Log.error('tcp server error', { error: err })
    })

    tcpServer.listen(listenTarget, () => {
        if (typeof listenTarget === 'string') {
            if (!isWindows) {
                fs.chmodSync(listenTarget, 0o777)
            }

            Log.info('listening:' + listenTarget)
        } else {
            const addr = tcpServer.address()
            Log.info('listening:' + addr.address + ':' + addr.port)
        }
    })

    const close = () => {
        tcpServer.close(() => {
            if (!EnvConfig.useTcp && !isWindows && fs.existsSync(EnvConfig.socketPath)) {
                fs.unlinkSync(EnvConfig.socketPath)
            }

            process.exit(0)
        })
    }

    process.on('SIGINT', close)
    process.on('SIGTERM', close)

    EnvConfig.validate()
    await ApolloWrapper.init()
    Log.use('server')
    Log.info('starting server')
}

main()