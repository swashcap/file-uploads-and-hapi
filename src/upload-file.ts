import 'hard-rejection/register';

import Fs from 'fs';
import Good from '@hapi/good';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Joi from '@hapi/joi';
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

    await Promise.all([
        server.register(Inert),
        process.env.NODE_ENV !== 'test'
            ? server.register({
                  plugin: Good,
                  options: {
                      ops: {
                          interval: 1000,
                      },
                      reporters: {
                          myConsoleReporter: [
                              {
                                  module: '@hapi/good-squeeze',
                                  name: 'Squeeze',
                                  args: [{ log: '*', response: '*' }],
                              },
                              {
                                  module: '@hapi/good-console',
                              },
                              'stdout',
                          ],
                      },
                  },
              })
            : undefined,
    ]);

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

            return h
                .response({ uploaded: responses.map(([filename]) => filename) })
                .code(201);
        },
        method: 'POST',
        options: {
            payload: {
                allow: 'multipart/form-data',
                output: 'file',
            },
            validate: {
                payload: Joi.object({
                    background: Joi.object({
                        bytes: Joi.number().required(),
                        filename: Joi.string()
                            .regex(/\.(gif|jpe?g|png)$/)
                            .empty('')
                            .required(),
                        headers: Joi.object().required(),
                        path: Joi.string().required(),
                    }).required(),
                    profile: Joi.object({
                        bytes: Joi.number().required(),
                        filename: Joi.string()
                            .regex(/\.(gif|jpe?g|png)$/)
                            .empty('')
                            .required(),
                        headers: Joi.object().required(),
                        path: Joi.string().required(),
                    }).required(),
                }).required(),
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
