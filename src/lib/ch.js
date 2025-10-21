import { createClient } from '@clickhouse/client'
import { EnvConfig } from './config.js'

EnvConfig.validate()
const url = 'http://' + EnvConfig.chHost + ':' + EnvConfig.chPort
export const ch = createClient({
    url,
    username: EnvConfig.chUser,
    password: EnvConfig.chPassword,
    database: EnvConfig.chDatabase
})