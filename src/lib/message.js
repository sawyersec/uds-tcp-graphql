import ndjson from 'ndjson'
import { z } from 'zod'

export const MessageSchema = z.object({
    headers: z.object({ 'api-key': z.string().min(1) }),
    query: z.string().min(1),
    variables: z.record(z.any()).optional(),
    operationName: z.string().optional()
})

export function createDecoder() {
    return ndjson.parse()
}

export function createEncoder() {
    return ndjson.stringify()
}