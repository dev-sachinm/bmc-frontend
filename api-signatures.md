# API signatures

Base path: `/api/v1`. Request and response bodies are JSON. Unknown JSON fields are rejected (`extra="forbid"`) on every request body below.

Malformed JSON, missing required fields, and constraint failures return **400** with `{"detail": [<validation errors>]}`. That replaces FastAPI's default 422.

`volume_liters` on `POST /telemetry` is the live sensor distance in centimeters. The stored and returned `volume_liters` is the computed milk volume.

## Authentication

| Route group | Header | Token |
| --- | --- | --- |
| `POST /auth/login` | none | none |
| `POST /telemetry` | `Authorization: Bearer <device_token>` | Long-lived per-device token issued at registration |
| `/bmc-models`, `/tanks`, `/tanks/{tank_id}`, `/tanks/{tank_id}/readings`, `/tanks/{tank_id}/volume-formula` | `Authorization: Bearer <access_token>` | User JWT from login. Tank routes also require ownership or an assignment, except `systemadmin`, who can see every tank |
| `/users`, `/users/{username}`, `/users/{username}/password`, `/tanks/{tank_id}/assignments` | `Authorization: Bearer <access_token>` | User JWT for username `systemadmin` |

A missing bearer token on a protected route returns **401** `{"detail": "Missing bearer token"}`.

---

## POST /api/v1/auth/login

Exchange a username and password for a user access token. No bearer token.

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `username` | string | required, length 1–64 |
| `password` | string | required, length 1–72 |

### Responses

**200**

| Field | Type | Notes |
| --- | --- | --- |
| `access_token` | string | JWT |
| `token_type` | string | always `"bearer"` |
| `expires_in` | integer | seconds; default 43200 (12 hours), from `JWT_TTL_SECONDS` |

**401** `{"detail": "Invalid username or password"}`

**500** `{"detail": "JWT_SECRET is not set"}`

---

## POST /api/v1/telemetry

Append one sensor reading. Requires a device bearer token. The token's device must match `device_id`.

A new timestamp is stored with **201**. The same `device_id` and `recorded_at` sent again returns **200** and the stored row.

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `device_id` | string | required, length 1–128 after trim; blank after trim is rejected |
| `recorded_at` | string | required, timezone-aware ISO 8601 datetime |
| `volume_liters` | number | required, `>= 0`, finite. Wire name only: this is `volume_distance` in centimeters |
| `temperature_celsius` | number | required, finite |

### Responses

**201** or **200**

| Field | Type | Notes |
| --- | --- | --- |
| `device_id` | string | |
| `recorded_at` | string | timezone-aware datetime |
| `volume_distance` | number or null | centimeters from the sensor to the milk surface |
| `volume_liters` | number | computed milk volume in liters |
| `temperature_celsius` | number | |

**400** `{"detail": "No tank is mapped for this device"}`

**400** `{"detail": "No volume formula is stored for this tank"}`

**401** `{"detail": "Invalid or inactive device token"}`

**403** `{"detail": "Token does not match device_id"}`

---

## GET /api/v1/bmc-models

List catalogued bulk milk cooler models. Requires a user access token.

### Query parameters

| Name | Type | Constraints |
| --- | --- | --- |
| `page` | integer | optional, default `1`, minimum `1` |
| `page_size` | integer | optional, default `20`, minimum `1`, maximum `100` |

### Responses

**200**

| Field | Type | Notes |
| --- | --- | --- |
| `items` | array | model objects below |
| `page` | integer | |
| `page_size` | integer | |
| `total` | integer | number of models in the catalog |

Each item:

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | model code, for example `bmc-1000-rectangular` |
| `rated_capacity_liters` | integer | |
| `shape` | string | `rectangular`, `vertical_circular`, `horizontal_circular`, or `horizontal_elliptical` |
| `description` | string | |

**401** `{"detail": "Invalid or expired access token"}`

**500** `{"detail": "JWT_SECRET is not set"}`

---

## GET /api/v1/tanks

List tanks that have a stored volume formula, with each tank's latest reading. Requires a user access token. `systemadmin` sees every tank. Other users see tanks they created and tanks assigned to them.

### Query parameters

| Name | Type | Constraints |
| --- | --- | --- |
| `search` | string | optional, default `""`, max length 128. Matches tank id or tank name |
| `page` | integer | optional, default `1`, minimum `1` |
| `page_size` | integer | optional, default `20`, minimum `1`, maximum `100` |

### Responses

**200**

| Field | Type | Notes |
| --- | --- | --- |
| `items` | array | tank objects below, ordered by `tank_id` |
| `page` | integer | |
| `page_size` | integer | |
| `total` | integer | matching tanks the caller can see |

Each item:

| Field | Type | Notes |
| --- | --- | --- |
| `tank_id` | string | |
| `tank_name` | string | |
| `created_by` | string or null | username that created the tank |
| `formula` | object | `TankVolumeFormula` below |
| `latest_reading` | object or null | `TankLatestReading` below; null when the tank has no reading |

**TankVolumeFormula**

| Field | Type |
| --- | --- |
| `tank_id` | string |
| `tank_name` | string |
| `model_code` | string |
| `rated_capacity_liters` | integer |
| `shape` | string |
| `inner_length_cm` | number |
| `inner_width_cm` | number |
| `inner_height_cm` | number |
| `empty_distance_cm` | number |
| `expression` | string |

**TankLatestReading**

| Field | Type | Notes |
| --- | --- | --- |
| `volume_distance` | number or null | centimeters |
| `volume_liters` | number | computed liters |
| `temperature_celsius` | number | |

**401** and **500** match `GET /bmc-models`.

---

## PUT /api/v1/tanks/{tank_id}/volume-formula

Create or replace the centimeter-to-liter formula for one tank. Requires a user access token. A new tank returns **201** and records the caller as `created_by`. An existing formula returns **200** and keeps `created_by`. Replacing a formula requires `configure` or `manage`.

Rated capacity, shape, and expression are taken from the catalog model. The optional body copies of those fields are ignored.

### Path parameters

| Name | Type | Notes |
| --- | --- | --- |
| `tank_id` | string | tank identifier |

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `tank_name` | string | required, length 1–128 after trim |
| `model_code` | string | required, length 1–64 after trim; must be a catalog code |
| `inner_length_cm` | number | required, `> 0`, finite |
| `inner_width_cm` | number | required, `> 0`, finite |
| `inner_height_cm` | number | required, `> 0`, finite |
| `empty_distance_cm` | number | required, `> 0`, finite. Sensor distance when the tank is empty |
| `tank_id` | string or null | optional. When set, must equal the path `tank_id` after trim |
| `rated_capacity_liters` | integer or null | optional, ignored |
| `shape` | string or null | optional, ignored |
| `expression` | string or null | optional, ignored |

### Responses

**201** or **200**: `TankVolumeFormula` (see `GET /tanks`).

**400** `{"detail": "tank_id does not match the URL"}`

**400** `{"detail": "Unknown bulk milk cooler model"}`

**400** `{"detail": "<formula validation message>"}` when dimensions cannot define a formula.

**403** `{"detail": "You do not have permission for this tank"}` when the caller can see the tank but cannot configure it.

**404** `{"detail": "No volume formula is stored for this tank"}` when a formula exists and the caller cannot see it. A tank id with no formula is created.

**401** and **500** match `GET /bmc-models`.

---

## GET /api/v1/tanks/{tank_id}

Tank detail for a caller who can monitor the tank. Requires a user access token.

### Path parameters

| Name | Type |
| --- | --- |
| `tank_id` | string |

### Responses

**200** the tank item from `GET /tanks`, plus:

| Field | Type | Notes |
| --- | --- | --- |
| `assigned_users` | array or null | For `systemadmin`, assignees ordered by username. Each item has `username`, `first_name`, `last_name`, and `role` (`monitor`, `configure`, or `manage`). `null` for every other caller |

**404** `{"detail": "No volume formula is stored for this tank"}`

**401** and **500** match `GET /bmc-models`.

---

## PUT /api/v1/tanks/{tank_id}/assignments

Replace the users assigned to one tank. Requires the `systemadmin` access token. An empty `users` array removes every assignment. Ownership and `systemadmin` access are not stored in this list.

### Path parameters

| Name | Type |
| --- | --- |
| `tank_id` | string |

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `users` | array | required. Each item is `{ "username": string, "role": "monitor" \| "configure" \| "manage" }` |

### Responses

**200**

| Field | Type |
| --- | --- |
| `users` | array of `{ username, first_name, last_name, role }` |

**400** `{"detail": "systemadmin already has access to every tank"}`

**400** `{"detail": "a user can be assigned to a tank only once"}`

**403** `{"detail": "Only systemadmin can assign tanks"}`

**404** `{"detail": "No volume formula is stored for this tank"}`

**404** `{"detail": "username is not registered"}`

**401** and **500** match `GET /bmc-models`.

---

## DELETE /api/v1/tanks/{tank_id}

Delete the stored volume formula and its assignments for one tank. Requires a user access token and `manage` on the tank. Device mappings and telemetry rows are left in place.

### Path parameters

| Name | Type |
| --- | --- |
| `tank_id` | string |

### Responses

**204** empty body.

**403** `{"detail": "You do not have permission for this tank"}`

**404** `{"detail": "No volume formula is stored for this tank"}`

**401** and **500** match `GET /bmc-models`.

---

## GET /api/v1/tanks/{tank_id}/readings

Temperature and volume points for one tank, ordered by `recorded_at` ascending. A chart plots `temperature_celsius` and `volume_liters` against `recorded_at`. Requires a user access token.

When `from` and `to` are both omitted, the window is the last hour ending at the request time. Readings from every controller mapped to the tank are included. Bounds are inclusive.

### Path parameters

| Name | Type |
| --- | --- |
| `tank_id` | string |

### Query parameters

| Name | Type | Constraints |
| --- | --- | --- |
| `from` | string | optional ISO-8601 timestamp. Required when `to` is set |
| `to` | string | optional ISO-8601 timestamp. Required when `from` is set. Must be greater than or equal to `from` |
| `page` | integer | optional, default `1`, minimum `1` |
| `page_size` | integer | optional, default `20`, minimum `1`, maximum `100` |

### Responses

**200**

| Field | Type | Notes |
| --- | --- | --- |
| `tank_id` | string | |
| `tank_name` | string | |
| `from` | string | window start, UTC |
| `to` | string | window end, UTC |
| `page` | integer | |
| `page_size` | integer | |
| `total` | integer | points in the window before paging |
| `readings` | array | `TankHistoryPoint` below, oldest first, for this page |

**TankHistoryPoint**

| Field | Type | Notes |
| --- | --- | --- |
| `recorded_at` | string | UTC timestamp |
| `temperature_celsius` | number | |
| `volume_liters` | number | computed milk volume |

**400** `{"detail": "from and to must both be set"}`

**400** `{"detail": "from must be earlier than or equal to to"}`

**404** `{"detail": "No volume formula is stored for this tank"}`

**401** and **500** match `GET /bmc-models`.

---

## GET /api/v1/tanks/{tank_id}/volume-formula

Return the stored formula for one tank. Requires a user access token and monitor access to the tank.

### Path parameters

| Name | Type |
| --- | --- |
| `tank_id` | string |

### Responses

**200**: `TankVolumeFormula` (see `GET /tanks`).

**404** `{"detail": "No volume formula is stored for this tank"}`

**401** and **500** match `GET /bmc-models`.

---

## GET /api/v1/users

List users. Requires the `systemadmin` access token. The password hash is not returned.

### Query parameters

| Name | Type | Constraints |
| --- | --- | --- |
| `search` | string | optional, default `""`, max length 128. Matches username, first name, last name, or mobile number |
| `page` | integer | optional, default `1`, minimum `1` |
| `page_size` | integer | optional, default `20`, minimum `1`, maximum `100` |

### Responses

**200**

| Field | Type |
| --- | --- |
| `items` | array of `User` |
| `page` | integer |
| `page_size` | integer |
| `total` | integer |

**User**

| Field | Type |
| --- | --- |
| `username` | string |
| `first_name` | string |
| `last_name` | string |
| `mobile_number` | string |

**403** `{"detail": "Only systemadmin can manage users"}`

**401** and **500** match `GET /bmc-models`.

---

## POST /api/v1/users

Create a user. Requires the `systemadmin` access token.

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `username` | string | required, length 1–64. Stored lowercase. Domain rules: 3–64 characters, starting with a letter or digit |
| `first_name` | string | required, length 1–100 |
| `last_name` | string | required, length 1–100 |
| `mobile_number` | string | required, length 1–20. Stored as 10–15 digits with an optional leading `+` |
| `password` | string | required, length 8–72 |

### Responses

**201** `User` (see `GET /users`).

**400** `{"detail": "<validation message>"}`

**403** `{"detail": "Only systemadmin can manage users"}`

**409** `{"detail": "username is already registered"}`

**409** `{"detail": "mobile number is already registered"}`

**401** and **500** match `GET /bmc-models`.

---

## GET /api/v1/users/{username}

Return one user. Requires the `systemadmin` access token.

### Responses

**200** `User`.

**403** `{"detail": "Only systemadmin can manage users"}`

**404** `{"detail": "username is not registered"}`

**401** and **500** match `GET /bmc-models`.

---

## PATCH /api/v1/users/{username}

Update a user's name or mobile number. Requires the `systemadmin` access token. At least one field is required.

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `first_name` | string or null | optional, length 1–100 |
| `last_name` | string or null | optional, length 1–100 |
| `mobile_number` | string or null | optional, length 1–20 |

### Responses

**200** `User`.

**400** `{"detail": "at least one of first_name, last_name, or mobile_number is required"}`

**403** `{"detail": "Only systemadmin can manage users"}`

**404** `{"detail": "username is not registered"}`

**409** `{"detail": "mobile number is already registered"}`

**401** and **500** match `GET /bmc-models`.

---

## PUT /api/v1/users/{username}/password

Replace a user's password. Requires the `systemadmin` access token. The current password is not required.

### Request body

| Field | Type | Constraints |
| --- | --- | --- |
| `password` | string | required, length 8–72 |

### Responses

**204** empty body.

**400** `{"detail": "<validation message>"}`

**403** `{"detail": "Only systemadmin can manage users"}`

**404** `{"detail": "username is not registered"}`

**401** and **500** match `GET /bmc-models`.

---

## DELETE /api/v1/users/{username}

Delete a user, their tank assignments, and their ownership mark on tanks they created. The tanks remain. Requires the `systemadmin` access token. `systemadmin` cannot be deleted.

### Responses

**204** empty body.

**403** `{"detail": "Only systemadmin can manage users"}`

**403** `{"detail": "The systemadmin user cannot be deleted"}`

**404** `{"detail": "username is not registered"}`

**401** and **500** match `GET /bmc-models`.
