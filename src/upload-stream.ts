import 'hard-rejection/register';

import Good from '@hapi/good';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Joi from '@hapi/joi';
import Path from 'path';
import Wreck from '@hapi/wreck';
import { Readable } from 'stream';

interface MultipartFormDataHeaders {
    'content-disposition': string;
    'content-type': string;
}

type StreamPayload = Record<
    string,
    Readable & {
        hapi:
            | {
                  /** Signifies an empty form field */
                  filename: '';
                  headers: MultipartFormDataHeaders;
              }
            | {
                  filename: string;
                  headers: MultipartFormDataHeaders;
              };
    }
>;

export const getServer = async () => {
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
     * `stream` output
     * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.output}
     */
    server.route({
        handler: async (request, h) => {
            const payload = request.payload as StreamPayload;

            const responses = await Promise.all(
                Object.values(payload)
                    .filter(({ hapi: { filename } }) => !!filename)
                    .map(payload =>
                        Promise.all([
                            payload.hapi.filename,
                            Wreck.request(
                                'POST',
                                `http://localhost:3001/files/${encodeURIComponent(
                                    payload.hapi.filename
                                )}`,
                                { payload }
                            ),
                        ])
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
                output: 'stream',
            },
            validate: {
                payload: Joi.object({
                    background: Joi.object({
                        hapi: Joi.object()
                            .keys({
                                filename: Joi.string()
                                    .regex(/\.(gif|jpe?g|png)$/)
                                    .empty(''),
                                headers: Joi.object(),
                            })
                            .unknown(true)
                            .required(),
                    })
                        .unknown(true)
                        .required(),
                    profile: Joi.object({
                        hapi: Joi.object()
                            .keys({
                                filename: Joi.string()
                                    .regex(/\.(gif|jpe?g|png)$/)
                                    .empty(''),
                                headers: Joi.object(),
                            })
                            .unknown(true)
                            .required(),
                    })
                        .unknown(true)
                        .required(),
                })
                    .unknown(true)
                    .required(),
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
