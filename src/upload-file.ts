import 'hard-rejection/register';

import Fs from 'fs';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Path from 'path';
import Wreck from '@hapi/wreck';

interface MultipartFormDataHeaders {
    'content-disposition': string;
    'content-type': string;
}

type FilePayload = Record<
    string,
    | {
          bytes: 0;
          filename: '';
          headers: MultipartFormDataHeaders;
          path: string;
      }
    | {
          bytes: number;
          filename: string;
          headers: MultipartFormDataHeaders;
          path: string;
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
     * `file` output
     * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.output}
     */
    server.route({
        handler: async (request, h) => {
            const payload = request.payload as FilePayload;

            const responses = await Promise.all(
                Object.values(payload)
                    .filter(({ filename }) => !!filename)
                    .map(({ filename, path }) =>
                        Promise.all([
                            filename,
                            Wreck.request(
                                'POST',
                                `http://localhost:3001/files/${encodeURIComponent(
                                    filename
                                )}`,
                                { payload: Fs.createReadStream(path) }
                            ),
                        ])
                    )
            );

            const removeTemporaryFiles = () =>
                Promise.all(
                    Object.values(payload).map(({ path }) =>
                        Fs.promises.unlink(path)
                    )
                );

            return { uploaded: responses.map(([filename]) => filename) };
        },
        method: 'POST',
        options: {
            payload: {
                allow: 'multipart/form-data',
                output: 'file',
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
