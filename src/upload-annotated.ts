/**
 * Upload annotated.
 *
 * This standalone module register a `/upload` route for handling form submissions with the
 * `route.options.payload.multipart` setting of `annotated`, which parses the form submission and
 * buffers the uploaded files entirely into memory:
 *
 * > `annotated` - wraps each multipart part in an object with the following keys
 * >   * `headers` - the part headers.
 * >   * `filename` - the part file name.
 * >   * `payload` - the processed part payload.
 *
 * {@link https://hapi.dev/api/?v=18.3.2#route.options.payload.multipart}
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

interface MultipartFormDataHeaders {
    'content-disposition': string;
    'content-type': string;
}

/**
 * The `request.payload` types for an annotated route handler.
 *
 * The `@types/hapi__hapi` package doesn't provide full types for request payloads. This type
 * provides type safety for the upload route handler.
 */
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
            const payload = request.payload as AnnotatedPayload;

            const responses = await Promise.all(
                Object.values(payload)
                    .filter(({ filename }) => !!filename)
                    .map(({ filename, payload }) =>
                        Promise.all([
                            filename,
                            Wreck.request(
                                'POST',
                                `http://localhost:3001/files/${encodeURIComponent(
                                    filename
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
                 * Configure the route to handle input in `annotated` mode, which buffers the user-
                 * uploaded files into memory and calls the route handler. This is similar to setting
                 * `route.options.payload.output` to `data`, but hapi provides some additional
                 * metadata in the request payload.
                 * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.multipart}
                 */
                multipart: {
                    output: 'annotated',
                },
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
                        filename: Joi.string()
                            .regex(/\.(gif|jpe?g|png)$/)
                            .empty()
                            .required(),
                        headers: Joi.object(),
                        payload: Joi.object(),
                    }).required(),
                    profile: Joi.object({
                        filename: Joi.string()
                            .regex(/\.(gif|jpe?g|png)$/)
                            .empty()
                            .required(),
                        headers: Joi.object(),
                        payload: Joi.object(),
                    })
                        .unknown(true)
                        .required(),
                }),
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
 * node src/upload-annotated.js
 * ```
 */
if (require.main === module) {
    (async () => {
        const server = await getServer();

        await server.start();

        console.log(`Server listening at ${server.info.uri}`);
    })();
}
