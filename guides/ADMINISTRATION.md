# Administration Guide

This guide provides an overview of the XCM Monitoring Server administration.

## Storage

The server stores its data in the filesystem using LevelDB. The location of the database is configured through a command line argument or an environment variable.

## HTTP API

The server exposes administration functionality through an HTTP API. Generally, you won't need to use this API under normal circumstances.

### Authorization

The administration API uses bearer token authorization. You must configure the secret value using the `XCMON_SECRET` environment variable; it will be used to verify the hash-based signature of the auth token.

To authenticate with the `admin/` endpoints, you should pass an HTTP authorization header with a valid JWT token signed with the configured secret; the payload of the token is not considered.

Example using the default secret:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.TUkHePbst2jnFffIGHbn-fFnZz36DfBjxsfptqFypaA
```

### Caches

You can list the cached items, blocks, and messages by making a GET request to `/admin/cache/:numeric_chain_id`.
You can clear a cache with a DELETE request to the same endpoint.
The chain tips, i.e. the latest known block header, can be listed using `/admin/cache/tips` and can also be deleted.

### Scheduler

Some operations require expiration for cached entries, such as cached messages. To achieve this, the system supports persistent scheduled tasks.
You can list the scheduled tasks by making a GET request to `/admin/sched`, which will return all the keys of the current scheduled tasks.
You can retrieve the content of a scheduled task using GET `/admin/sched/:key` and remove it using the DELETE operation.

### Pending Messages

You can list all the pending messages to be matched making a GET request to `/admin/xcm`.

