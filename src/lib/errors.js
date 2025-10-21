export class ErrorCodes {
    static BAD_REQUEST = 'BAD_REQUEST'
    static UNAUTHORIZED = 'UNAUTHORIZED'
    static FORBIDDEN = 'FORBIDDEN'
    static INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

export class Errors {
    static wrap(message, code, status) {
        return { errors: [{ message, extensions: { code } }], status }
    }
}