# File Uploads and [hapi](https://hapi.dev/)

This repository demonstrates strategies for handling file uploads with
[hapi](https://hapi.dev/).

## Strategies

hapi (version 18.x.x) offers a few ways to handle file uploads. This project
examines three, breaking them into standalone modules:

* **Annotated ([src/upload-annotated.ts](./src/upload-annotated.ts)):** hapi
  buffers the contents of each uploaded file into memory, similar to the `data`
  configuration for
  [`route.options.payload.output`](https://hapi.dev/api/?v=18.3.2#route.options.payload.output).
  The route handler is called with the file's contents and some additional
  metadata, such as the user-supplied file name.
* **File ([src/upload-file.ts](./src/upload-file.ts)):** hapi streams each
  uploaded file to the temporary directory, then calls the route handler with
  the temporary files' paths.
* **Stream ([src/upload-stream.ts](./src/upload-stream.ts)):** hapi passes the
  raw request to the route handler, which transforms the multi-part files into
  streams.

Each file contains extensive commenting explaining how to approach each
strategy.

**Note:** This project's source code is written in
[TypeScript](https://www.typescriptlang.org), but it doesn't rely extensively
on types for its functionality. See [TypeScript in 5
minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
for a quick guide on the language.

## Further reading

* [hapi's `route.options.payload.output` documentation](https://hapi.dev/api/?v=18.3.2#route.options.payload.output)
* [hapi's `route.options.payload.multipart` documentation](https://hapi.dev/api/?v=18.3.2#route.options.payload.multipart)
* [Subtext](https://github.com/hapijs/subtext), the package that handles
  multi-part form parsing
* [_Handling File Uploads with Hapi.js_ on scotch.io](https://scotch.io/bar-talk/handling-file-uploads-with-hapi-js#toc-filter-file-type)

## Prerequisites

Make sure you have the following installed:

* [Node.js](https://nodejs.org/en/) v12.9 or greater (I recommend installing
  [nvm](https://github.com/nvm-sh/nvm/) to manage Node.js versions)
* [yarn](https://yarnpkg.com/lang/en/)

## Running the Project

1. Install dependencies with yarn:

    ```shell
    yarn
    ```
2. Build the project:

    ```shell
    yarn build
    ```
3. Start the server

    ```shell
    # Choose one module:
    node src/upload-annotated.js
    node src/upload-file.js
    node src/upload-stream.js
    ```

    Each module's server honors the `PORT` environment variable. Configure the
    port by setting it, for example:

    ```shell
    # Run the stream upload server on 4000:
    PORT=4000 node src/upload-stream.js
    ```

You can now test functionality by submitting forms to `localhost:3000/upload`.
An example using curl might look like:

```shell
curl -F background=@test/fixtures/background.jpeg \
  -F profile=@test/fixtures/profile.png \
  localhost:3000/upload
```

You can also use the included web form, visible at
[localhost:3000](http://localhost:3000) by default.

## Tests

No project is complete without tests! This project uses
[Mocha](https://mochajs.org), [Chai](https://www.chaijs.com),
[Sinon.JS](https://sinonjs.org), and hapi's
[`server.inject`](https://hapi.dev/api/?v=18.3.2#server.inject()) to test all
the source modules at [test/upload.ts](./test/upload.ts). To run:

```shell
# Build the project:
yarn build

# Run the tests:
yarn test
```

The output should look similar to this:

```
  Upload annotated
    errors
      ✓ rejects with JSON payload
      ✓ rejects with empty form payload
      ✓ rejects with invalid input type
      ✓ rejects with only one valid input
      ✓ rejects with a non-image input
    file uploads
      ✓ accepts valid input

  Upload file
    errors
      ✓ rejects with JSON payload
      ✓ rejects with empty form payload
      ✓ rejects with invalid input type
      ✓ rejects with only one valid input
      ✓ rejects with a non-image input
    file uploads
      ✓ accepts valid input

  Upload stream
    errors
      ✓ rejects with JSON payload
      ✓ rejects with empty form payload
      ✓ rejects with invalid input type
      ✓ rejects with only one valid input
      ✓ rejects with a non-image input
    file uploads
      ✓ accepts valid input


  18 passing (174ms)
```

