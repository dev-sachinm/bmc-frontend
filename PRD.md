# Product Requirements Document: BMC Backend

Bulk Milk Cooler telemetry ingest, tank volume conversion, and operator authentication.

This document describes the application as implemented in this repository. Firmware, dashboards, and alert delivery are outside this service.

## 1. Product summary

Village and dairy-collection Bulk Milk Coolers (BMCs) report milk temperature and a level-sensor distance. This backend accepts those readings over HTTPS, converts the distance in centimeters into liters using a formula stored for that tank, and appends the reading to a TimescaleDB hypertable.

Operators register controllers and dashboard users from the server. Controllers authenticate with a long-lived device token. People authenticate with a username and password and receive a JWT. Those two credentials are not interchangeable.

## 2. Users

| Actor | What they do | Credential |
|---|---|---|
| Tank controller | Posts temperature and level distance | Per-device bearer token, shown once at registration |
| `systemadmin` | Creates and maintains users, sees every tank, and assigns tank roles | Username `systemadmin` and a password, then a JWT. The account is created with the user CLI |
| Tank user | Creates tanks, configures tanks they may change, and monitors tanks they may read | Username and password, then a JWT |

There is no public signup and no device login. A device token cannot call user or tank routes. A user JWT cannot call ingest. The username `systemadmin` is reserved. That account is the only one that can call the user APIs or replace tank assignments.

A tank user can monitor, configure, and manage tanks they created. `systemadmin` can grant the same tank to other users with one role:

| Role | List and read the tank | Replace the volume formula | Delete the tank |
|---|---|---|---|
| `monitor` | Yes | No | No |
| `configure` | Yes | Yes | No |
| `manage` | Yes | Yes | Yes |

`manage` includes configure and monitor. The user who created the tank has `manage` on it even when they also have a weaker assignment. `systemadmin` has `manage` on every tank. A user with no ownership and no assignment receives the same not-found response as a missing tank.

## 3. Scope

### In this application

- Register a controller against a tank and print its bearer token once.
- Ingest telemetry and store it in a TimescaleDB hypertable.
- Treat the ingest JSON key `volume_liters` as `volume_distance`, a level-sensor distance in centimeters. The key name stays `volume_liters` on the HTTP API.
- Store a centimeter-to-liter formula per tank, chosen from dairy BMC models.
- On ingest, write the request distance to `volume_distance` and the calculated liters to `volume_liters`.
- Register, list, delete, and change passwords for users from the CLI, including the `systemadmin` account.
- Let `systemadmin` create, read, update, delete, and change passwords for users over HTTP.
- Issue a JWT from username and password.
- Let any user create a tank. The creator is stored on the formula and can monitor, configure, and manage that tank.
- Let `systemadmin` assign other users to a tank as `monitor`, `configure`, or `manage`.
- List and read only the tanks the caller owns or is assigned, except `systemadmin`, who sees every tank and its assignees.
- Protect formula configuration with the user JWT and the caller's tank role.
- List stored tanks with each formula and the latest distance, liters, and temperature.
- Delete a stored tank formula when the caller has `manage`. Device mappings and telemetry stay.
- Return one tank's temperature and volume readings for a time window. The default window is the last hour.
- Paginate every list: tanks, BMC models, users, and readings.

### Outside this repository

- Controller firmware and sensor hardware.
- MQTT, Mosquitto, and any broker in the application path. If a site still speaks MQTT, an edge gateway must call this HTTPS API.
- Farms, temperature threshold rules, and outbound alerts. Those appear in the architecture notes and are not implemented. Per-tank roles are implemented.
- Mutual TLS. Device auth is a bearer token.
- Rotating or deactivating a device token. Registration rejects a `device_id` that already exists. There is no revoke command yet.

## 4. Tech stack

| Area | Choice |
|---|---|
| Language | Python 3.11+ |
| HTTP | FastAPI, async routes, Pydantic v2 at the boundary |
| Server | Uvicorn |
| Architecture | Cosmic Python (ports and adapters), adapted for async FastAPI |
| Database | PostgreSQL with the TimescaleDB extension, one database |
| Access | SQLAlchemy 2 async with `asyncpg` |
| Migrations | Alembic. Applied revisions under `alembic/versions/` are not edited |
| Device tokens | SHA-256 hash only. The raw token is never stored |
| User passwords | bcrypt hash only |
| User sessions | JWT (PyJWT), HS256, signed with `JWT_SECRET` |
| Tests | pytest and pytest-asyncio. Domain and service tests use fakes |
| Packaging | Poetry |
| Runtime config | `.env` via pydantic-settings |
| Hosting | Docker Compose runs the API. TimescaleDB is provisioned separately. Nginx, when used, terminates TLS in front of the app |

Dependencies declared in `pyproject.toml`: FastAPI, Uvicorn, SQLAlchemy, asyncpg, Alembic, pydantic-settings, PyJWT, bcrypt.

## 5. Architecture

The service is Layer 3 (API and processing) and Layer 4 (database). Layer 1 is the controller, which is out of scope. Layer 2 is HTTPS in front of FastAPI (Nginx or a load balancer). There is no message broker in this process.

```text
Controller                         Nginx                         FastAPI                         PostgreSQL + TimescaleDB
sample distance + temperature
JSON + device bearer token
        | HTTPS
        +--------------------------> TLS, forward header + body --> hash token
                                                                    match device_id
                                                                    convert cm with tank formula
                                                                    append telemetry -----------> hypertable
        <----------------------------------------------------------- 201 or 4xx

Operator browser / script
username + password ---------------> POST /api/v1/auth/login -------> bcrypt check
                                                                    issue JWT
JWT --------------------------------> formula routes ---------------> tank_volume_formulas
```

### Request path

1. Routers in `app/api/v1/` validate HTTP with Pydantic schemas and map status codes. They call use cases. They do not query the database.
2. Services in `app/services/` are stateless use cases. They return domain objects. They do not import FastAPI or raise `HTTPException`.
3. Domain code in `app/domain/` is plain Python: devices, readings, users, BMC catalog, and the centimeter-to-liter formulas.
4. Repositories in `app/repositories/` are the only database access. A unit of work holds one `AsyncSession` for the request and commits or rolls back at the edge.
5. SQLAlchemy tables live in `app/models/`.

One `AsyncSession` is created per request through FastAPI `Depends`. A failed request rolls the session back.

### Repository layout

| Path | Role |
|---|---|
| `app/api/v1/` | Routers: auth, telemetry, tanks |
| `app/api/deps.py` | Database session and bearer-token dependencies |
| `app/schemas/` | Pydantic request and response models |
| `app/services/` | Use cases |
| `app/domain/` | Entities, password hashing, JWT encode/decode, volume math, BMC catalog |
| `app/repositories/` | Repository ports and the SQLAlchemy unit of work |
| `app/models/` | SQLAlchemy models |
| `app/cli/` | Operator commands |
| `alembic/versions/` | Schema revisions |
| `docker-compose.yml` | API container |

## 6. Configuration

Copy `.env.example` to `.env`.

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL URL. A `postgresql://` URL is rewritten to `postgresql+asyncpg://` |
| `JWT_SECRET` | Yes for login and formula routes | HMAC secret for access tokens. Use a long random value |
| `JWT_TTL_SECONDS` | No | Access-token lifetime. Default is 43200 (12 hours) |

Start locally:

```bash
poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API listens on port 8000. Interactive docs are served by FastAPI at `/docs`.

## 7. Data model

### `devices`

| Column | Type | Notes |
|---|---|---|
| `device_id` | string, primary key | Controller id, max 128 characters |
| `token_hash` | string, unique | SHA-256 hex of the bearer token |
| `is_active` | boolean | Inactive tokens are rejected. New registrations are active. No deactivate command yet |

### `device_tanks`

One row per controller. This is the only place a `device_id` is tied to a `tank_id`.

| Column | Type | Notes |
|---|---|---|
| `device_id` | string, primary key | References `devices.device_id` |
| `tank_id` | string | Tank this controller reports for. Not a foreign key. Several controllers may share one tank |

Registration writes the device row and this mapping together. Ingest and `GET /api/v1/tanks` use this table to choose the tank formula and the latest reading.

### `telemetry`

TimescaleDB hypertable on `recorded_at`. Primary key is (`device_id`, `recorded_at`). `device_id` references `devices.device_id`.

| Column | Type | Notes |
|---|---|---|
| `device_id` | string | |
| `recorded_at` | timestamptz | Stored in UTC |
| `volume_liters` | float | Liters after conversion |
| `temperature_celsius` | float | As sent by the controller |
| `volume_distance` | float, nullable | Original sensor distance in centimeters. The device sends this number in the JSON key `volume_liters`. Null on rows written before this column existed |

The same `device_id` and `recorded_at` sent again does not update the row.

### `tank_volume_formulas`

One row per tank. `tank_id` is the primary key.

| Column | Type | Notes |
|---|---|---|
| `tank_id` | string | |
| `tank_name` | string | Display name, 1–128 characters |
| `model_code` | string | A code from the BMC catalog |
| `rated_capacity_liters` | integer | Nameplate capacity of that model |
| `shape` | string | `rectangular`, `vertical_circular`, `horizontal_circular`, or `horizontal_elliptical` |
| `inner_length_cm` | float | Inner vessel length |
| `inner_width_cm` | float | Inner width. For a vertical circular tank this is the diameter. For a horizontal circular tank it equals the height |
| `inner_height_cm` | float | Inner height. For a horizontal circular tank this is the diameter |
| `empty_distance_cm` | float | Sensor reading when the tank is empty. Must be at least `inner_height_cm` |
| `expression` | string | Human-readable formula with the stored dimensions filled in |
| `created_by` | string, nullable | Username that created the tank. Null when that user is deleted, or on rows written before ownership existed. Null rows are visible to `systemadmin` and to users assigned on `tank_assignments` |

Rated capacity labels the model. Liters are computed from the inner dimensions, not scaled to the nameplate. Replacing a formula keeps `created_by`.

### `tank_assignments`

One row per user granted access to a tank they did not need to create. Primary key is (`tank_id`, `username`).

| Column | Type | Notes |
|---|---|---|
| `tank_id` | string | References `tank_volume_formulas.tank_id`. Deleted with the formula |
| `username` | string | References `users.username`. Deleted with the user |
| `role` | string | `monitor`, `configure`, or `manage` |

`systemadmin` is not stored here. That account already has every tank. Assigning the creator is allowed; their effective role stays `manage` because they own the tank. The assignment row still records the role `systemadmin` set.

### `users`

| Column | Type | Notes |
|---|---|---|
| `username` | string, primary key | Stored lowercase |
| `first_name` | string | 1–100 characters |
| `last_name` | string | 1–100 characters |
| `mobile_number` | string, unique | 10–15 digits, optional leading `+` |
| `password_hash` | string | bcrypt. The password is never stored or returned |

## 8. Volume conversion

The controller sends `volume_distance` in centimeters. On the wire that value is still the JSON key `volume_liters`. In the domain, the database, and this document it is `volume_distance`. Milk height is:

```text
fill_height_cm = clamp(empty_distance_cm - volume_distance, 0, inner_height_cm)
```

A distance of 0 is a full tank when the sensor sits at the inner top. A distance equal to `empty_distance_cm` is an empty tank. Values above the empty reading stay at 0 liters. Values that would exceed the inner height stay at the full-tank volume.

| Shape | Liters |
|---|---|
| `rectangular` | `fill_height_cm * inner_length_cm * inner_width_cm / 1000` |
| `vertical_circular` | `pi * (inner_width_cm / 2)^2 * fill_height_cm / 1000` |
| `horizontal_circular` | Circular segment area of a cylinder of diameter `inner_height_cm`, times `inner_length_cm / 1000` |
| `horizontal_elliptical` | That circular segment, multiplied by `inner_width_cm / inner_height_cm` |

`inner_width_cm` must equal `inner_height_cm` for `horizontal_circular`.

Ingest stores the computed liters in `volume_liters` and the original distance in `volume_distance`. If the device's tank has no formula, ingest returns `400` and writes nothing.

### BMC catalog

`GET /api/v1/bmc-models` returns these codes. Dimensions are not in the catalog. The operator supplies the inner vessel size for the installed cooler.

| Code | Rated liters | Shape |
|---|---|---|
| `bmc-500-rectangular` | 500 | rectangular |
| `bmc-500-vertical-circular` | 500 | vertical_circular |
| `bmc-1000-rectangular` | 1000 | rectangular |
| `bmc-1000-vertical-circular` | 1000 | vertical_circular |
| `bmc-1500-rectangular` | 1500 | rectangular |
| `bmc-1500-vertical-circular` | 1500 | vertical_circular |
| `bmc-2000-rectangular` | 2000 | rectangular |
| `bmc-2000-vertical-circular` | 2000 | vertical_circular |
| `bmc-3000-horizontal-circular` | 3000 | horizontal_circular |
| `bmc-3000-horizontal-elliptical` | 3000 | horizontal_elliptical |
| `bmc-5000-horizontal-circular` | 5000 | horizontal_circular |
| `bmc-5000-horizontal-elliptical` | 5000 | horizontal_elliptical |
| `bmc-10000-horizontal-circular` | 10000 | horizontal_circular |
| `bmc-10000-horizontal-elliptical` | 10000 | horizontal_elliptical |

Open tanks up to 2000 L follow the NDDB rectangular or vertical circular shapes. Closed tanks above 2000 L follow the NDDB horizontal circular or elliptical shapes.

## 9. Authentication

### Device token

- Created by `python -m app.cli.register_device`.
- Sent as `Authorization: Bearer <device_token>` on `POST /api/v1/telemetry` only.
- The database stores `SHA-256(token)`.
- Missing, unknown, or inactive token: `401`.
- Token is valid but the body `device_id` is different: `403`.
- A JWT presented to ingest does not match a device hash and returns `401`.

### User JWT

- Created by `POST /api/v1/auth/login`.
- Header: `Authorization: Bearer <access_token>`.
- Algorithm HS256. Claim `sub` is the username. Lifetime is `JWT_TTL_SECONDS`.
- Required on every `/api/v1` route except `POST /api/v1/auth/login` and `POST /api/v1/telemetry`.
- Missing, expired, malformed, or signed with the wrong secret: `401` with detail `Invalid or expired access token`.
- `JWT_SECRET` unset: `500` with detail `JWT_SECRET is not set`.
- A device token presented to a formula route returns `401`.
- Deleting a user makes that user's existing tokens fail the user lookup with `401`.

## 10. HTTP API

Base path: `/api/v1`.

Malformed JSON or a body that fails Pydantic validation returns `400`. The body is `{"detail": <pydantic error list>}`. Extra fields are rejected (`extra=forbid`) on request models.

Successful JSON uses the response models below. Error details from domain rules are strings: `{"detail": "..."}`.

### `POST /api/v1/auth/login`

No authentication header.

Request:

```json
{
  "username": "asha",
  "password": "choose-a-long-secret"
}
```

`username` is 1–64 characters. `password` is 1–72 characters. Login compares the normalized username (trimmed, lowercased). Unknown user and wrong password return the same `401`.

Response `200`:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 43200
}
```

| Status | When |
|---|---|
| 200 | Username and password match |
| 400 | Body fails validation |
| 401 | Unknown user or wrong password. Detail: `Invalid username or password` |
| 500 | `JWT_SECRET` is empty |

### `POST /api/v1/telemetry`

Header: `Authorization: Bearer <device_token>`.

Request:

```json
{
  "device_id": "ctrl-1",
  "recorded_at": "2026-10-10T08:30:00Z",
  "volume_liters": 40,
  "temperature_celsius": 4.2
}
```

| Field | Rule |
|---|---|
| `device_id` | Required, trimmed, 1–128 characters. Must equal the device bound to the token |
| `recorded_at` | ISO 8601 timestamp with a timezone. Stored in UTC |
| `volume_liters` | Finite number, `>= 0`. HTTP name only. The value is `volume_distance` in centimeters, not liters |
| `temperature_celsius` | Finite number |

Response `201` when the reading is new, `200` when the same device and timestamp were already stored. The retry returns the original row and does not apply a later formula or a later distance.

```json
{
  "device_id": "ctrl-1",
  "recorded_at": "2026-10-10T08:30:00Z",
  "volume_distance": 40,
  "volume_liters": 500,
  "temperature_celsius": 4.2
}
```

`volume_liters` in the response is the converted volume. `volume_distance` is the sensor distance from the request key `volume_liters`. The example number `500` depends on the formula stored for that tank.

| Status | When |
|---|---|
| 201 | Reading stored |
| 200 | Duplicate `device_id` and `recorded_at`. Original reading returned |
| 400 | Malformed body, or no volume formula for the device's tank. Detail: `No volume formula is stored for this tank` |
| 401 | Missing header, bad scheme, unknown token, inactive token, or a user JWT |
| 403 | Token is valid and the body names another `device_id`. Detail: `Token does not match device_id` |

The controller should not retry a `400` unchanged. It may retry the same reading after a timeout or `5xx`. It should treat `401` and `403` as authentication failures and not substitute another device id.

### `GET /api/v1/bmc-models`

Header: user JWT.

Response `200`: array of `{code, rated_capacity_liters, shape, description}`. See the catalog table above.

`401` when the user token is missing or invalid.

### `PUT /api/v1/tanks/{tank_id}/volume-formula`

Header: user JWT. Any authenticated user may create a tank id that has no formula yet, and becomes `created_by`. Replacing an existing formula requires `configure` or `manage` on that tank. A caller who cannot see the tank receives `404`. A caller who can only monitor it receives `403`.

Request:

```json
{
  "tank_name": "North cooler",
  "model_code": "bmc-2000-rectangular",
  "inner_length_cm": 200,
  "inner_width_cm": 100,
  "inner_height_cm": 90,
  "empty_distance_cm": 95
}
```

`tank_name` is required, trimmed, and 1–128 characters. The response fields `tank_id`, `tank_name`, `rated_capacity_liters`, `shape`, and `expression` may be sent as well. `tank_id`, when present, must match the URL. Rated capacity, shape, and the expression are still taken from the BMC model and the inner dimensions, so sending the stored response back replaces the same single row.

All dimensions must be finite and greater than 0. `empty_distance_cm` must be greater than or equal to `inner_height_cm`.

Response `201` the first time that tank is saved, `200` when the row is replaced. Body:

```json
{
  "tank_id": "tank-1",
  "tank_name": "North cooler",
  "model_code": "bmc-2000-rectangular",
  "rated_capacity_liters": 2000,
  "shape": "rectangular",
  "inner_length_cm": 200,
  "inner_width_cm": 100,
  "inner_height_cm": 90,
  "empty_distance_cm": 95,
  "expression": "liters = clamp(95 - volume_distance, 0, 90) * 200 * 100 / 1000"
}
```

| Status | When |
|---|---|
| 201 | Formula created |
| 200 | Formula replaced |
| 400 | Unknown `model_code`, dimensions that cannot define a formula, or a body `tank_id` that differs from the URL |
| 401 | Missing or invalid user token |

Unknown model detail: `Unknown bulk milk cooler model`.

### `GET /api/v1/tanks/{tank_id}/volume-formula`

Header: user JWT.

Response `200` is the same object as the PUT response. The caller must be able to monitor the tank. `404` when that tank has no row or the caller cannot see it. Detail: `No volume formula is stored for this tank`. `401` when the user token is missing or invalid.

### `GET /api/v1/tanks`

Header: user JWT.

Optional query `search` is a case-insensitive substring matched against `tank_id` or `tank_name`. A blank `search` returns every tank the caller can see. The value is at most 128 characters.

`page` defaults to 1. `page_size` defaults to 20 and must be from 1 to 100. The list is ordered by `tank_id`. `systemadmin` receives every matching tank. Any other user receives tanks they created and tanks assigned to them.

```bash
curl "http://localhost:8000/api/v1/tanks?search=north" \
  -H "Authorization: Bearer <access_token>"

curl "http://localhost:8000/api/v1/tanks?search=tank-1" \
  -H "Authorization: Bearer <access_token>"
```

`search=north` matches `tank_name` `North cooler`. `search=tank-1` matches `tank_id`. A term that matches neither returns `items: []` and `total: 0`.

Response `200`: a page of matching volume formulas. A tank with no telemetry has `latest_reading` set to `null`. When several controllers report the same tank, `latest_reading` is the row with the newest `recorded_at`. `created_by` is the username that created the tank, or `null`.

```json
{
  "items": [
    {
      "tank_id": "tank-1",
      "tank_name": "North cooler",
      "created_by": "asha",
      "formula": {
        "tank_id": "tank-1",
        "tank_name": "North cooler",
        "model_code": "bmc-2000-rectangular",
        "rated_capacity_liters": 2000,
        "shape": "rectangular",
        "inner_length_cm": 200,
        "inner_width_cm": 100,
        "inner_height_cm": 90,
        "empty_distance_cm": 95,
        "expression": "liters = clamp(95 - volume_distance, 0, 90) * 200 * 100 / 1000"
      },
      "latest_reading": {
        "volume_distance": 40,
        "volume_liters": 1100,
        "temperature_celsius": 4.2
      }
    }
  ],
  "page": 1,
  "page_size": 20,
  "total": 1
}
```

`volume_distance` is the sensor distance in centimeters. `volume_liters` is the stored converted volume. `temperature_celsius` is the temperature from that same reading. `401` when the user token is missing or invalid.

### `DELETE /api/v1/tanks/{tank_id}`

Header: user JWT.

Removes the volume-formula row and that tank's assignments. Controllers mapped to that tank, and their telemetry, stay. The caller must have `manage` on the tank: the creator, an assignee with `manage`, or `systemadmin`. `204` with an empty body when the formula is deleted. `403` when the caller can read the tank but cannot manage it. Detail: `You do not have permission for this tank`. `404` when that tank has no formula, or when the caller cannot see it. Detail: `No volume formula is stored for this tank`.

### `GET /api/v1/tanks/{tank_id}/readings`

Header: user JWT.

Returns temperature and computed volume points for a chart. Plot `temperature_celsius` and `volume_liters` against `recorded_at`. Points are ordered oldest first and include every controller mapped to the tank.

Query `from` and `to` are inclusive ISO-8601 timestamps. Omit both to use the last hour ending when the request is handled. Set both, or neither. `from` must be earlier than or equal to `to`. `page` defaults to 1 and `page_size` defaults to 20 (maximum 100). Points stay oldest first, and the page is taken from that order. `total` is the number of points in the window. The caller must be able to monitor the tank.

```bash
curl "http://localhost:8000/api/v1/tanks/tank-1/readings" \
  -H "Authorization: Bearer <access_token>"

curl "http://localhost:8000/api/v1/tanks/tank-1/readings?from=2026-10-17T08:00:00Z&to=2026-10-17T09:00:00Z" \
  -H "Authorization: Bearer <access_token>"
```

Response `200`:

```json
{
  "tank_id": "tank-1",
  "tank_name": "North cooler",
  "from": "2026-10-17T11:00:00Z",
  "to": "2026-10-17T12:00:00Z",
  "page": 1,
  "page_size": 20,
  "total": 1,
  "readings": [
    {
      "recorded_at": "2026-10-17T11:40:00Z",
      "temperature_celsius": 4.2,
      "volume_liters": 1100
    }
  ]
}
```

`readings` is `[]` when the tank has no point in the window or the requested page is past the end. `404` when the tank has no formula or the caller cannot see it. `403` is not used on this route: a caller who can see the tank can read its history. `400` when only one of `from` and `to` is set, or when `from` is later than `to`.

### `GET /api/v1/tanks/{tank_id}`

Header: user JWT. The caller must be able to monitor the tank.

Response `200` has the same fields as one item from `GET /api/v1/tanks`, plus `assigned_users`. For `systemadmin`, `assigned_users` is the current assignment list (username, first name, last name, and role), ordered by username. It is `[]` when nobody else is assigned. For every other caller, `assigned_users` is `null`.

`404` when the tank has no formula or the caller cannot see it.

### `PUT /api/v1/tanks/{tank_id}/assignments`

Header: user JWT for `systemadmin`. Replaces the assignment list for one tank. An empty `users` array clears every assignment. The creator and `systemadmin` keep their access without a row.

```json
{ "users": [{ "username": "ravi", "role": "monitor" }] }
```

`role` is `monitor`, `configure`, or `manage`. Response `200` is `{ "users": [ ... ] }` with the stored assignees and their names. `403` when the caller is not `systemadmin`. `404` when the tank has no formula, or when a username is not registered. `400` when `systemadmin` is in the list, when the same username appears twice, or when `role` is not one of the three values.

### User administration

These routes require the `systemadmin` JWT. Any other user receives `403` with detail `Only systemadmin can manage users`. The password hash is never returned.

`GET /api/v1/users` is paginated with `page`, `page_size`, and optional `search`. `search` matches username, first name, last name, or mobile number. The page envelope is `items`, `page`, `page_size`, and `total`.

`POST /api/v1/users` creates a user. Body: `username`, `first_name`, `last_name`, `mobile_number`, `password`. `201` returns the user without the password. `409` when the username or mobile number is already registered. `400` when a field fails the same rules as the CLI.

`GET /api/v1/users/{username}` returns that user. `404` when the username is not registered.

`PATCH /api/v1/users/{username}` changes `first_name`, `last_name`, and `mobile_number`. At least one field is required. `409` when the mobile number belongs to someone else.

`PUT /api/v1/users/{username}/password` body is `{ "password": "..." }`. `204` with an empty body. The old password is not required. `404` when the username is not registered.

`DELETE /api/v1/users/{username}` returns `204`. Assignments for that user are removed. Tanks they created stay, with `created_by` set to null, and then only `systemadmin` and remaining assignees can see them. `403` when the username is `systemadmin`. Detail: `The systemadmin user cannot be deleted`.

### `GET /api/v1/bmc-models`

The catalog response is a page: `items`, `page`, `page_size`, and `total`. `page` defaults to 1. `page_size` defaults to 20 and must be from 1 to 100. The catalog currently has 14 models, so the default page returns all of them.

## 11. CLI

Run commands with `poetry run python -m ...` from the repository root. They use `DATABASE_URL` from `.env`. They are operator commands on the server, not HTTP endpoints.

### Register a controller

```bash
poetry run python -m app.cli.register_device --device-id ctrl-1 --tank-id tank-1
```

Prints the raw bearer token once on stdout. Writes `devices` and one `device_tanks` row. Exit code 1 and a stderr message when `device_id` is already registered, or when either id is blank. Put the token on the controller. It cannot be retrieved later.

### Users

```bash
poetry run python -m app.cli.users register \
  --first-name Asha \
  --last-name Patil \
  --mobile 9876543210 \
  --username asha \
  --password 'choose-a-long-secret'

poetry run python -m app.cli.users change-password --username asha --password 'another-long-secret'

poetry run python -m app.cli.users delete --username asha

poetry run python -m app.cli.users list
```

| Command | Required flags | Behavior |
|---|---|---|
| `register` | `--first-name`, `--last-name`, `--mobile`, `--username` | Creates the user. Prints `registered <username>` |
| `change-password` | `--username` | Replaces the password hash. Does not ask for the old password. Prints `password updated for <username>` |
| `delete` | `--username` | Deletes that user. Prints `deleted <username>`. Refuses `systemadmin` |
| `list` | none | Prints `username`, first name, last name, and mobile, tab-separated. Does not print the password hash |

`--password` is optional. When it is omitted, the command prompts twice and exits 1 if the two entries differ. Prefer the prompt so the password is not stored in shell history.

Username rules, applied by the command:

- Trimmed and stored lowercase.
- 3–64 characters.
- Starts with a letter or digit, then letters, digits, `.`, `_`, or `-`.

Mobile rules:

- Spaces and hyphens are removed.
- 10–15 digits, optional leading `+`.
- Unique across users.

Password rules:

- At least 8 characters.
- At most 72 bytes, which is the bcrypt limit.

Stderr messages and exit code 1:

| Message | Cause |
|---|---|
| `username is already registered` | Duplicate username |
| `mobile number is already registered` | Duplicate mobile |
| `username is not registered` | Change password or delete of an unknown user |
| `passwords do not match` | The two prompts differ |
| The validation sentence | Name, username, mobile, or password failed the rules above |

## 12. Operational sequence

1. Set `DATABASE_URL` and `JWT_SECRET`. Run `poetry run alembic upgrade head`.
2. Register `systemadmin` with `app.cli.users register --username systemadmin`, then register any other bootstrap user the same way.
3. Log in with `POST /api/v1/auth/login` and keep the access token. Further users are created with `POST /api/v1/users` as `systemadmin`.
4. `PUT` the volume formula for the tank, using a model code and the cooler's inner dimensions. The caller becomes `created_by`.
5. Register the controller with `app.cli.register_device` and install the printed token on the device.
6. The controller `POST`s telemetry. The API converts centimeters with that tank's formula and appends the reading.

## 13. Security rules

- Store only the SHA-256 of a device token and the bcrypt hash of a password.
- Do not log raw tokens or passwords.
- Device credentials and user credentials stay on their own routes.
- Formula changes require a user JWT and `configure` or `manage` on that tank. Creating a tank requires only a user JWT. Reading a tank requires `monitor` or stronger. Deleting a tank requires `manage`.
- User create, read, update, delete, and password change over HTTP require the `systemadmin` JWT. The CLI remains available on the server for bootstrap, including the first `systemadmin` user. The CLI also refuses to delete `systemadmin`.
- TLS is terminated in front of the process. The application itself does not terminate certificates.
- Committed Alembic revisions are immutable. Schema changes are new revisions.

## 14. Web dashboard

This repository contains the React dashboard served alongside the API.

### Actors in the dashboard

| Actor | What they can do |
|---|---|
| Any signed-in user | View and search their tanks, create tanks, view history charts |
| Tank creator (`created_by`) | Update and delete their own tanks |
| `systemadmin` | Everything a tank creator can do, on every tank. Manage users (create, edit, change password, delete). View and edit tank assignment lists |

`systemadmin` is detected in the browser by decoding the `sub` claim of the stored JWT. The API enforces every permission; the decoded claim drives only navigation and button visibility, and is never trusted for data access.

### Screens

| Route | Visible to | Purpose |
|---|---|---|
| `/login` | Everyone | Username and password sign-in |
| `/` | All signed-in users | Paginated, searchable tank list with live readings |
| `/tanks/new` | All signed-in users | Create a new tank formula |
| `/tanks/:tankId` | Users who can monitor the tank | Tank formula, history chart, assigned users (`systemadmin` only), Update and Delete (`systemadmin` and creator only) |
| `/tanks/:tankId/edit` | Tank creator and `systemadmin` | Edit the stored volume formula |
| `/users` | `systemadmin` only | Paginated, searchable user list |
| `/users/new` | `systemadmin` only | Create a user (username, name, mobile, password) |
| `/users/:username` | `systemadmin` only | Edit name and mobile, set a new password, delete the user (not for `systemadmin` itself) |

Non-admin users who navigate to `/users` or any sub-route are redirected to `/`.

### Navigation shell

- **Tanks** and **New tank** links are visible to every signed-in user.
- A **Users** link appears in the sidebar only when the signed-in user is `systemadmin`.
- The signed-in username is shown near the Log out button.

### Tank list

- Search by tank id or tank name (case-insensitive substring, matched by the API).
- Paginated: previous / next controls, "page N of M" label. Default page size is 20.
- Each card shows the tank name, latest temperature and volume, fill bar, rated capacity, and the username that created the tank (`created_by`).
- The list refreshes every 5 seconds when showing the default page.

### Tank detail

- Shows the formula fields, an interactive history chart, and the `created_by` username.
- **Update tank** and **Delete tank** buttons render only for `systemadmin` and the tank creator.
- For `systemadmin`, the page also shows the assignment list: each assigned user's username, full name, and role (`monitor`, `configure`, or `manage`). An inline editor allows adding users (search by username from the user list) with a role, and removing existing entries. Saving calls `PUT /tanks/{tank_id}/assignments` with the full replacement list. `systemadmin` cannot be added; the creator is shown separately as the permanent owner.

### User management (systemadmin only)

- **User list**: paginated (page size 20), searchable by username, first name, last name, or mobile number.
- **Create user**: username, first name, last name, mobile number, and password in one form. Returns `201`.
- **Edit user**: change first name, last name, and mobile number via `PATCH`. At least one field is required.
- **Set password**: a separate form on the user detail page. Calls `PUT /users/{username}/password`. The current password is not required.
- **Delete user**: confirmation dialog before calling `DELETE /users/{username}`. The delete option is hidden for the `systemadmin` user itself.

### Pagination

Every list the dashboard calls supports `page` and `page_size` query parameters. The dashboard uses a shared pager component (previous / next, "page N of M"). Changing the search term resets to page 1. Tank readings for the chart are fetched at up to 100 points per page and accumulated across pages to cover the full selected window; the chart has no page controls.

### Roles and the dashboard

Assigned roles (`monitor`, `configure`, `manage`) are stored by the API and displayed in the assignment list on the tank detail page for `systemadmin`. The dashboard does not expose Update or Delete to users assigned with `configure` or `manage`. Role enforcement for formula changes and tank deletion is handled exclusively by the API.
