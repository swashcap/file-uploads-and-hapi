/**
 * Upload stream.
 *
 * This standalone module register a `/upload` route for handling form submissions with the
 * `route.options.payload.output` setting of `stream`, which parses the form submission and
 * presents the route handler
 *
 * > `'stream'` - the incoming payload is made available via a `Stream.Readable` interface. If the
 * > payload is 'multipart/form-data' and `parse` is `true`, field values are presented as text
 * > while files are provided as streams. File streams from a 'multipart/form-data' upload will also
 * > have a `hapi` property containing the `filename` and `headers` properties. Note that payload
 * > streams for multipart payloads are a synthetic interface created on top of the entire mutlipart
 * > content loaded into memory. To avoid loading large multipart payloads into memory, set `parse`
 * > to `false` and handle the multipart payload in the handler using a streaming parser (e.g. pez).
 *
 * {@link https://hapi.dev/api/?v=18.3.2#route.options.payload.output}
 *
 * This example route passes assets to a theoretical downstream service, which listens for files
 * files on `localhost:3001`, using the HTTP utility library Wreck.
 *
 * {@link https://github.com/hapijs/wreck}
 */
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

/**
 * The `request.payload` types for a stream route handler.
 *
 * The `@types/hapi__hapi` package doesn't provide full types for request payloads. This type
 * provides type safety for the upload route handler.
 */
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
        // Don't log during tests
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

    // Use Inert to serve static files from /public
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
                /**
                 * Only allow form data submission on this route. hapi will return an error in all
                 * other cases.
                 */
                allow: 'multipart/form-data',

                /**
                 * Configure the route to handle input in `stream` mode, which passes the user-
                 * uploaded files as streams to the route handler.
                 * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.output}
                 */
                output: 'stream',
            },
            validate: {
                /**
                 * Payload validation isn't necessary, but this provides an easy way to ensure
                 * the user uploads two files on the expected form fields (`background` and
                 * `profile`) and the uploaded files have a specific extension (images in this case)
                 * without handling it in the handler. hapi applies * the validation on the payload
                 * before passing it to the handler, so the shape matches the type expected for
                 * `request.payload`.
                 */
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

/**
 * Start the server when this module is called directly:
 *
 * ```
 * node src/upload-stream.js
 * ```
 */
if (require.main === module) {
    (async () => {
        const server = await getServer();

        await server.start();

        console.log(`Server listening at ${server.info.uri}`);
    })();
}
