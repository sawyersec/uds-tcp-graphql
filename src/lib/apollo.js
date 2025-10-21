import { ApolloServer } from '@apollo/server'
import { typeDefs, resolvers } from '../schema.js'
import { Log } from './logger.js'

export class ApolloWrapper {
    static server

    static async init() {
        const StripStackPlugin = {
            async requestDidStart() {
                return {
                    didEncounterErrors(ctx) {
                        for (const err of ctx.errors || []) {
                            const st = Array.isArray(err.extensions?.stacktrace) ? err.extensions.stacktrace.join('\n') : err.stack
                            Log.error('graphql error', { error: { stack: st, code: err.extensions?.code } })
                        }
                    },
                    willSendResponse(ctx) {
                        const body = ctx.response.body
                        if (body && body.kind === 'single' && Array.isArray(body.singleResult?.errors)) {
                            const errs = body.singleResult.errors.map(e => {
                                const ext = e.extensions ? { ...e.extensions } : {}
                                
                                if (ext.stacktrace) {
                                    delete ext.stacktrace
                                }
                                
                                return { ...e, extensions: ext }
                            })

                            body.singleResult.errors = errs
                            
                            const hasParseFail = errs.some(e => e.extensions?.code === 'GRAPHQL_PARSE_FAILED')
                            if (hasParseFail) {
                                body.singleResult.status = 501
                            }
                        }
                    }
                }
            }
        }

        this.server = new ApolloServer({
            typeDefs,
            resolvers,
            introspection: false,
            plugins: [StripStackPlugin]
        })

        await this.server.start()
    }
}