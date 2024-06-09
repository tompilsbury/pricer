const winston = require('winston');

const colors = {
    debug: 'blue',
    verbose: 'cyan',
    info: 'green',
    warn: 'yellow',
    trade: 'magenta',
    error: 'red'
};
winston.addColors(colors);

const transports = [];

if (process.env.NODE_ENV !== 'production') {
    transports.push(new winston.transports.Console({
        format: winston.format.simple()
    }));
} else {
    transports.push(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
                return `${timestamp} [${level.toUpperCase()}]: ${message}`;
            })
        )
    }));
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: transports
});

module.exports = logger;
