export class I18n {
    static locale = 'en-us'

    static setLocale(l) {
        this.locale = l
    }

    static t(key) {
        const map = {
            bad_request: 'Bad Request',
            unauthorized: 'Unauthorized',
            forbidden: 'Access Denied',
            internal_server_error: 'Internal Server Error'
        }

        return map[key] || 'internal server error'
    }
}