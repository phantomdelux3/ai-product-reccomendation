/**
 * TOONS (Token Optimized Object Notation Serialization)
 * A compact format to reduce token usage for LLM context.
 * Format: {key:value|key2:value2}
 */

export const toons = {
    stringify: (data: any): string => {
        if (Array.isArray(data)) {
            return `[${data.map(item => toons.stringify(item)).join(';')}]`;
        } else if (typeof data === 'object' && data !== null) {
            return `{${Object.entries(data)
                .map(([key, value]) => {
                    // Skip null/undefined/empty
                    if (value === null || value === undefined || value === '') return '';

                    // Truncate long strings (e.g. descriptions) to save tokens
                    let valStr = String(value);
                    if (typeof value === 'string' && valStr.length > 100) {
                        valStr = valStr.substring(0, 97) + '...';
                    }

                    // Recursive for nested objects if needed, or just simple string conversion
                    if (typeof value === 'object') {
                        return `${key}:${toons.stringify(value)}`;
                    }

                    return `${key}:${valStr}`;
                })
                .filter(Boolean)
                .join('|')}}`;
        }
        return String(data);
    },

    // Parse is not strictly needed for sending to LLM, but good for completeness/testing
    parse: (str: string): any => {
        // Basic implementation, might not cover all edge cases
        // This is primarily for the AI to READ, not for us to read back perfectly
        return str;
    }
};

export default toons;
