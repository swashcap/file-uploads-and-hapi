/**
 * Typings for Hapi's HTTP parser, subtext.
 */
declare module '@hapi/subtext' {
    import http from 'http';
    import stream from 'stream';

    export interface HapiSubtextParseOptions {
        parse: boolean;
        output: 'data' | 'stream' | 'file';
        maxBytes?: number;
        override?: string;
        defaultContentType?: string;
        /** Only allow a certain media type */
        allow?: string;
        /** Limit time spent buffering request */
        timeout?: number;
        /** Directory for file uploads */
        uploads?: string;
        /** An object mapping content-encoding names to their corresponding decoder functions */
        decoders?: Record<string, (options: any) => stream.Stream>;
        /**
         * An object mapping content-encoding names to their corresponding options passed to the
         * `decoders` functions
         */
        compression?: Record<string, any>;
    }

    export interface HapiSubtextParseResponse {
        mime: string;
        payload: any;
    }

    /**
     * Parses the request body and returns it in a promise.
     * {@link https://github.com/hapijs/subtext/blob/master/API.md}
     */
    export function parse(
        request: http.ClientRequest,
        tap: stream.Transform | null,
        options: HapiSubtextParseOptions
    ): Promise<HapiSubtextParseResponse>;
}
