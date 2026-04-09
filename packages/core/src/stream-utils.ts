/**
 * Reads a `ReadableStream<Uint8Array>` line-by-line and yields each
 * newline-delimited JSON value as a parsed object.
 *
 * @example
 * const stream = await client.streamUsers();
 * for await (const user of readNdjsonStream<User>(stream)) {
 *   console.log(user);
 * }
 */
export async function* readNdjsonStream<T>(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<T> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.trim()) yield JSON.parse(line) as T;
            }
        }
        // flush any bytes left after the final chunk
        if (buffer.trim()) yield JSON.parse(buffer) as T;
    } finally {
        reader.releaseLock();
    }
}

/**
 * Reads a `ReadableStream<Uint8Array>` and yields each decoded string chunk
 * as it arrives — ideal for server-sent text such as LLM token streams.
 *
 * @example
 * const stream = await client.streamText({ prompt: 'Hello' });
 * for await (const chunk of readTextStream(stream)) {
 *   process.stdout.write(chunk);
 * }
 */
export async function* readTextStream(
    stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            if (text) yield text;
        }
    } finally {
        reader.releaseLock();
    }
}
