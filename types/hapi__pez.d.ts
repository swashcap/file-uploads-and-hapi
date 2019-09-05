declare module '@hapi/pez' {
    import stream from 'stream';

    export interface DispenserOptions {
        boundary?: string;
        maxBytes?: number;
    }

    export interface DispenserPart extends stream.Readable {
        name: string;
    }

    export class Dispenser extends stream.Writable {
        constructor(options: DispenserOptions);
    }
}
