# XCM Monitoring Server

The XCM Monitoring Server is a software application designed to monitor Cross-Consensus Message Format (XCM)
program executions across consensus systems. Users can configure specific blockchain networks for observation and create subscriptions based on origin and destination chains, as well as sender addresses through a web API. The server delivers real-time notifications to the endpoints specified in the subscriptions, providing timely updates about relevant interactions.

**Key Features**

- **Execution Monitoring:** The server tracks XCM program executions across various networks.
- **Subscription Management:** The server offers a flexible subscription API for users to define specific criteria for notifications. Customizable parameters include origin, senders, destinations, and notification methods.
- **Dynamic Subscription Updates:** The subscription API allows users to modify subscription parameters, such as list of senders and destinations. The monitor seamlessly updates its matching criteria in real-time, without need for restarts.
- **Light client support:** The server supports connecting to chains through smoldot, in addition to RPC endpoints, thereby reducing infrastructure needs by eliminating the necessity of running full nodes or relying on RPC providers.
- **Resilience and Reliability:** The server ensures uninterrupted operation with persistent data storage between restarts. It supports graceful shutdowns, retries employing truncated exponential backoff, reliable webhook delivery, continuous block tip catch-up, and efficient caching for light clients.

## Server Configuration

The server configuration uses the environment variables described in the table below.

| Variable                      | Description                                    | Default   |
| ----------------------------- | ---------------------------------------------- | --------- |
| XCMON_HOST                    | The host to bind to.                           | localhost |
| XCMON_PORT                    | The TCP port number to listen on.              | 3000      |
| XCMON_CONFIG_FILE             | The service configuration file.                | -         |
| XCMON_DB_DIR                  | The database directory.                        | ./db      |
| XCMON_DB_SCHEDULER_ENABLE     | Enables or disables the task scheduler.        | true      |
| XCMON_DB_SCHEDULER_FREQUENCY  | Milliseconds to wait before each tick.         | 5000      |
| XCMON_DB_JANITOR_SWEEP_EXPIRY | Milliseconds before a task is swept.           | 1500000   |
| XCMON_CLOSE_GRACE_DELAY       | Milliseconds for the graceful close to finish. | 500       |
| XCMON_SECRET                  | Secret passphrase for administration.          | -         |
| XCMON_MAX_BLOCK_DIST          | Maximum distance in blocks for the catch-up.   | 150       |

## Network Configuration

To configure network connections, you need to provide a configuration file in TOML format. The accepted configuration fields are as follows:

| Field    | Description                                                                                        | Optional   |
| ---------| -------------------------------------------------------------------------------------------------- | ---------- |
| name     | The name of the network.                                                                           | No      |
| id       | The ID of the network.                                                                             | No      |
| relay    | For parachains, the name of the relay chain it connects to.                                        | Yes       |
| throttle | The throttle interval, in milliseconds, for requesting historic headers during chain tip catch-up. | Yes       |
| provider | Provider configuration, detailed below.                                                            | No      |

Provider configuration fields:

| Field    | Description                                         |
| ---------| --------------------------------------------------- |
| type     | Network type, either `rpc` or `smoldot`.            |
| url      | WebSocket endpoint URL, applicable when type=`rpc`. |
| spec     | Path to the chain specs, used when type=`smoldot`.  |

Example configurations are available in the `config/` directory of this repository for reference.

## Running the Server

### Running with Docker

TBD

### Running with NPX

Install and build:

```shell
➜ npm i

➜ npm run build
```

Run:

```shell
➜ npx xcm-mon --help

Usage: xcm-mon [options]

XCM Monitoring Server

Options:
  -V, --version                         output the version number
  -h, --host <address>                  host to bind to (default: "localhost", env: XCMON_HOST)
  -p, --port <number>                   port number to listen on (default: 3000, env: XCMON_PORT)
  -c, --config <file>                   service configuration file (env: XCMON_CONFIG_FILE)
  -d, --db <dir>                        database directory (default: "./db", env: XCMON_DB_DIR)
  --scheduler <boolean>                 enables or disables the task scheduler (default: true, env: XCMON_DB_SCHEDULER_ENABLE)
  --scheduler-frequency <milliseconds>  milliseconds to wait before each tick (default: 5000, env: XCMON_DB_SCHEDULER_FREQUENCY)
  --sweep-expiry <milliseconds>         milliseconds before a task is swept (default: 1500000, env: XCMON_DB_JANITOR_SWEEP_EXPIRY)
  -g, --grace                           milliseconds for the graceful close to finish (env: XCMON_CLOSE_GRACE_DELAY)
  --help                                display help for command
```

### Running in Development Mode

Uses nodemon to automatically restart the application on file changes.

```shell
➜ npm run dev
```

## Web APIs

Interact with the server using the exposed APIs.

Explore the `guides/postman` directory for Postman collections.

## Subscription API

You can find the OpenAPI documentation at
[http://{{your_host}}/documentation](http://localhost:3000/documentation).

## Administration API

The server provides an API for administration, enabling reading and purging of cached data, pending XCM messages, and scheduled tasks.
Additionally, it allows consultation of the current chain tip of a network.

## Healthcheck

The server exposes a healthchek endpoint at
[http://{{your_host}}/health](http://localhost:3000/health).

## Testing

To run unit tests:

```
npm run test
```

For end-to-end testing with either local networks or public networks, please refer to our [testing guide](https://github.com/sodazone/xcm-monitoring/blob/main/guides/TESTING.md)
