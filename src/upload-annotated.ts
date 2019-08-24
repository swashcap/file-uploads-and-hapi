import 'hard-rejection/register';

import Fs from 'fs';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Path from 'path';
import Os from 'os';

interface MultipartFormDataHeaders {
    'content-disposition': string;
    'content-type': string;
}

type AnnotatedPayload = Record<
    string,
    | {
          filename: '';
          headers: MultipartFormDataHeaders;
          payload: {};
      }
    | {
          filename: string;
          headers: MultipartFormDataHeaders;
          payload: Buffer;
      }
>;

const getServer = async () => {
    const server = new Hapi.Server({
        port: process.env.PORT || 3000,
        routes: {
            files: {
                relativeTo: Path.resolve(__dirname, '../public'),
            },
        },
    });

    await server.register(Inert);

    server.route({
        handler: {
            directory: {
                path: '.',
                redirectToSlash: true,
                index: true,
            },
        },
        method: 'GET',
        path: '/{param*}',
    });

    /**
     * `annotated` output
     * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.multipart}
     */
    server.route({
        handler: async (request, h) => {
            const payload = request.payload as AnnotatedPayload;

            // Write uploaded files to `Os.tmpdir()`
            const responses = await Promise.all(
                Object.values(payload)
                    .filter(({ filename }) => !!filename)
                    .map(({ filename: basename, payload }) => {
                        const filename = Path.join(Os.tmpdir(), basename);

                        return Promise.all([
                            filename,
                            Fs.promises.writeFile(filename, payload),
                        ]);
                    })
            );

            return { written: responses.map(([filename]) => filename) };
        },
        method: 'POST',
        options: {
            payload: {
                allow: 'multipart/form-data',
                multipart: {
                    output: 'annotated',
                },
            },
        },
        path: '/upload',
    });

    return server;
};

if (require.main === module) {
    (async () => {
        const server = await getServer();

        await server.start();

        console.log(`Server listening at ${server.info.uri}`);
    })();
}
