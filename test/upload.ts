import { assert } from 'chai';
import { Server } from '@hapi/hapi';
import FormData from 'form-data';
import Fs from 'fs';
import Http from 'http';
import Path from 'path';
import Sinon from 'sinon';
import StreamToPromise from 'stream-to-promise';
import Wreck from '@hapi/wreck';

import { getServer as getServerAnnotated } from '../src/upload-annotated';
import { getServer as getServerFile } from '../src/upload-file';
import { getServer as getServerStream } from '../src/upload-stream';

const servers: [string, () => Promise<Server>][] = [
    ['Upload annotated', getServerAnnotated],
    ['Upload file', getServerFile],
    ['Upload stream', getServerStream],
];

let stub:
    | Sinon.SinonStub<
          Parameters<typeof Wreck.request>,
          ReturnType<typeof Wreck.request>
      >
    | undefined;

before(() => {
    stub = Sinon.stub(Wreck, 'request').resolves({} as Http.IncomingMessage);
});

beforeEach(() => {
    stub!.resetHistory();
});

after(() => {
    stub!.reset();
});

servers.forEach(([name, getServer]) => {
    const withServer = (
        fn: (server: Server, done?: Mocha.Done) => ReturnType<Mocha.Func>
    ): Mocha.Func =>
        fn.length <= 1
            ? () => getServer().then(fn)
            : (done: Mocha.Done) =>
                  getServer().then(server => fn(server, done));

    describe(name, () => {
        describe('errors', () => {
            it(
                'rejects with JSON payload',
                withServer(async server => {
                    const response = await server.inject({
                        method: 'POST',
                        payload: {
                            background: 1,
                            profile: 2,
                        },
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 415);
                })
            );

            it(
                'rejects with empty form payload',
                withServer(async server => {
                    const formData = new FormData();
                    const response = await server.inject({
                        headers: formData.getHeaders(),
                        method: 'POST',
                        payload: formData.getBuffer(),
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 400);
                })
            );

            it(
                'rejects with invalid input type',
                withServer(async server => {
                    const formData = new FormData();

                    formData.append('background', 'some text');

                    const response = await server.inject({
                        headers: formData.getHeaders(),
                        method: 'POST',
                        payload: formData.getBuffer(),
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 400);
                })
            );

            it(
                'rejects with only one valid input',
                withServer(async server => {
                    const formData = new FormData();

                    formData.append(
                        'background',
                        Fs.createReadStream(
                            Path.join(__dirname, 'fixtures/background.jpeg')
                        ),
                        'background.jpeg'
                    );

                    const response = await server.inject({
                        headers: formData.getHeaders(),
                        method: 'POST',
                        payload: await StreamToPromise(formData),
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 400);
                })
            );

            it(
                'rejects with a non-image input',
                withServer(async server => {
                    const formData = new FormData();

                    formData.append(
                        'background',
                        Fs.createReadStream(
                            Path.join(__dirname, 'fixtures/background.jpeg')
                        ),
                        'background.jpeg'
                    );
                    formData.append(
                        'profile',
                        Fs.createReadStream(
                            Path.join(__dirname, 'fixtures/info.txt')
                        ),
                        'info.txt'
                    );

                    const response = await server.inject({
                        headers: formData.getHeaders(),
                        method: 'POST',
                        payload: await StreamToPromise(formData),
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 400);
                })
            );
        });

        describe('file uploads', () => {
            it(
                'accepts valid input',
                withServer(async server => {
                    const formData = new FormData();

                    formData.append(
                        'background',
                        Fs.createReadStream(
                            Path.join(__dirname, 'fixtures/background.jpeg')
                        ),
                        'background.jpeg'
                    );
                    formData.append(
                        'profile',
                        Fs.createReadStream(
                            Path.join(__dirname, 'fixtures/profile.png')
                        ),
                        'profile.png'
                    );

                    const response = await server.inject({
                        headers: formData.getHeaders(),
                        method: 'POST',
                        payload: await StreamToPromise(formData),
                        url: '/upload',
                    });

                    assert.equal(response.statusCode, 201);
                    assert.deepEqual(JSON.parse(response.payload), {
                        uploaded: ['background.jpeg', 'profile.png'],
                    });

                    assert.equal(stub!.callCount, 2);

                    const calls = stub!.getCalls();

                    assert.isOk(
                        calls.some(({ args: [, url] }) =>
                            url.includes('background.jpeg')
                        )
                    );
                    assert.isOk(
                        calls.some(({ args: [, url] }) =>
                            url.includes('profile.png')
                        )
                    );
                })
            );
        });
    });
});
