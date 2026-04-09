import { ISO } from './adapters.js';

export function reviveDates<T>(input: T): T {
    return visit(input) as T;

    function visit(val: any): any {
        if (val == null) return val;
        if (val instanceof Date) return val;

        if (typeof val === 'string' && ISO.test(val)) {
            const d = new Date(val);
            return Number.isNaN(d.getTime()) ? val : d;
        }

        if (Array.isArray(val)) {
            let changed = false;
            const arr = val.map((x) => {
                const v2 = visit(x);
                if (v2 !== x) changed = true;
                return v2;
            });
            return changed ? arr : val;
        }

        if (typeof val === 'object') {
            const proto = Object.getPrototypeOf(val);
            if (proto !== Object.prototype && proto !== null) return val;

            let changed = false;
            const out: any = {};
            for (const [k, v] of Object.entries(val)) {
                const v2 = visit(v);
                if (v2 !== v) changed = true;
                out[k] = v2;
            }
            return changed ? out : val;
        }

        return val;
    }
}
