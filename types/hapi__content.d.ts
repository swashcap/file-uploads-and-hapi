declare module '@hapi/content' {
    export interface ContentType {
        boundary?: string;
        mime: string;
    }

    export interface ContentDisposition {
        filename: string;
        name: string;
    }

    export function disposition(header: string): ContentDisposition;
    export function type(header: string): ContentType;
}
