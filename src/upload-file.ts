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

const cleanupQueue: Record<string, string[]> = {};

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
     * `file` output
     * {@link https://hapi.dev/api/?v=18.3.1#route.options.payload.output}
     */
    server.route({
        handler: async (request, h) => {
            const payload = request.payload as FilePayload;

            /**
             * Using the `output: 'file'` approach requires some manual cleanup:
             *
             * > Note that it is the sole responsibility of the application to clean up the files
             * > generated by the framework. This can be done by keeping track of which files are
             * > used (e.g. using the `request.app` object), and listening to the server
             * > `'response'` event to perform cleanup.
             *
             * File clean should not be a route concern: it should be a system-related application
             * concern. Considering the runtime, cleanup completed outside of route handling to
             * prevent blocking the response. Hapi's `request.app` doesn't conform to API
             * documentation, so files are pushed onto a queue for cleanup by the `'response'`
             * event on the `server`.
             *
             * Ideally, a cron job (application on VM) or volume cleaning (application on
             * containers) catches stale upload files.
             *
             * {@link https://hapi.dev/api/?v=18.3.2#route.options.payload.output}
             */
            cleanupQueue[request.info.id] = Object.values(payload).map(
                ({ path }) => path
            );

            const responses = await Promise.all(
                Object.values(payload)
                    .filter(({ filename }) => filename)
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

            return h
                .response({ uploaded: responses.map(([filename]) => filename) })
                .code(201);
        },
        method: 'POST',
        options: {
            app: {
                uploads: [],
            },
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

    /**
     * Remove temporary files pushed onto the cleanup queue by the upload route handler.
     *
     * {@link https://hapi.dev/api/?v=18.3.2#server.events.response}
     */
    server.events.on('response', async ({ info: { id: requestId } }) => {
        const files = cleanupQueue[requestId];

        server.log('upload-cleanup', {
            files,
            requestId,
            message: 'Starting cleanup',
        });

        try {
            await Promise.all(cleanupQueue[requestId].map(Fs.promises.unlink));

            server.log('upload-cleanup', {
                files,
                message: 'Upload cleanup complete',
                requestId,
            });
        } catch (error) {
            server.log(['error', 'upload-cleanup'], {
                error,
                files,
                message: 'Upload cleanup failed',
                requestId,
            });
        } finally {
            /** @todo Implement FS or volume cleanup */
            delete cleanupQueue[requestId];
        }
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
