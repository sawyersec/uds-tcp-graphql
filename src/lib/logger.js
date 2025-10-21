export class Log {
    static prefix = 'app'

    static use(p) {
        this.prefix = p
    }

    static now() {
        return new Date().toISOString()
    }

    static write(level, message, meta) {
        const base = {
            time: this.now(),
            prefix: this.prefix,
            level,
            message: String(message).toLowerCase()
        }

        const out = meta && meta.error ? { ...base, stack: meta.error.stack, code: meta.error.code } : base
        const line = JSON.stringify(out) + '\n'
        if (level === 'error') {
            process.stderr.write(line)
        } else {
            process.stdout.write(line)
        }
    }

    static error(message, meta) {
        this.write('error', message, meta)
    }

    static warn(message, meta) {
        this.write('warn', message, meta)
    }

    static info(message, meta) {
        this.write('info', message, meta)
    }

    static debug(message, meta) {
        this.write('debug', message, meta)
    }
}