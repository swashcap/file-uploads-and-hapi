/**
 * Upload stream.
 *
 * This standalone module register a `/upload` route for handling form submissions with the
 * `route.options.payload.output` setting of `stream`, and a `route.options.parse` setting of
 * `false`. hapi passes the request stream as the payload to the route handler:
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

import Boom from '@hapi/boom';
import Content, { ContentDisposition } from '@hapi/content';
import Good from '@hapi/good';
import Hapi from '@hapi/hapi';
import Inert from '@hapi/inert';
import Joi from '@hapi/joi';
import Path from 'path';
import Pez from '@hapi/pez';
import Wreck from '@hapi/wreck';
import { Readable } from 'stream';

const partsSchema = Joi.array()
    .items(
        Joi.object({
            filename: Joi.string()
                .regex(/\.(gif|jpe?g|png)$/)
                .required(),
            name: Joi.any()
                .valid('background', 'profile')
                .required(),
        }).unknown(true)
    )
    .min(2)
    .max(2);

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
            const payload = request.payload as Readable;

            /**
             * Use Pez to parse the payload's multi-part files into streams:
             * {@link https://github.com/hapijs/pez}
             */
            const streams = await new Promise<ContentDisposition[]>(
                (resolve, reject) => {
                    const dispenser = new Pez.Dispenser(
                        Content.type(request.headers['content-type'])
                    );
                    const parts: ContentDisposition[] = [];

                    const onClose = () => {
                        dispenser.removeListener('error', onError);
                        dispenser.removeListener('part', onPart);
                        resolve(parts);
                    };
                    const onError = (error: any) => {
                        dispenser.removeListener('close', onClose);
                        dispenser.removeListener('part', onPart);
                        reject(error);
                    };
                    const onPart = (part: ContentDisposition) => {
                        parts.push(part);
                    };

                    dispenser.once('error', onError);
                    dispenser.on('part', onPart);
                    dispenser.once('close', onClose);

                    payload.pipe(dispenser);
                }
            );

            /**
             * Hapi can't validate the payload when `parse` is `false`. Manually use Joi to ensure
             * the form contains the expected files:
             */
            try {
                Joi.assert(streams, partsSchema);
            } catch (error) {
                throw Boom.boomify(error, { statusCode: 400 });
            }

            const responses = await Promise.all(
                streams.map(payload =>
                    Promise.all([
                        payload.filename,
                        Wreck.request(
                            'POST',
                            `http://localhost:3001/files/${encodeURIComponent(
                                payload.filename
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

                /**
                 * Parse the request manually in the handler to handle the uploaded files as
                 * streams.
                 * {@link https://hapi.dev/api/?v=18.3.2#route.options.payload.parse}
                 */
                parse: false,
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
