export interface Logger {
    debug?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

export const consoleLogger: Logger = {
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

export const silentLogger: Logger = {
    debug: () => { },
    warn: () => { },
    error: () => { },
};
