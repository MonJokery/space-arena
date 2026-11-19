import pino from 'pino';
export const appLog = pino({ level: process.env.LOG_LEVEL || 'info', redact: { paths: ['password', 'token', 'authorization', 'secret', 'headers.authorization'], remove: true } });
