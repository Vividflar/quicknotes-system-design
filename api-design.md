# QuickNotes API Design

This document describes the real QuickNotes API that the backend team should build. It is not the JSONPlaceholder practice API used by the front-end client in this repository.

## Conventions

- **Base URL:** `https://api.quicknotes.com/v1` (the `v1` is the API version). Paths below are relative to it.
- **Resources are plural nouns:** `/notes`, `/tags`, `/users`. A single item is addressed by its id, for example `/notes/42`. The HTTP method says what to do, so there is no `/createNote`.
- **Format:** every request body and response body is JSON (`Content-Type: application/json`). Times use ISO 8601, for example `2026-10-22T09:15:00Z`.
- **Authentication:** every endpoint except registering and logging in needs the header `Authorization: Bearer <token>`. The server finds the user from the token, so the client never sends a `userId`.
- **Stateless:** each request carries everything the server needs, including the token, so any app server can answer it.
- **Ownership:** a user can only see and change their own notes and tags.
- **Query parameters** (after the `?`, joined with `&`) are used for filtering, searching and paging.
- **Rate limit:** 100 requests per minute per user. Extra requests get `429 Too Many Requests`.

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/users` | Register a new account (name, email, password). | `201 Created` |
| 2 | POST | `/sessions` | Log in with email and password and receive a token. | `200 OK` |
| 3 | GET | `/notes` | List the logged-in user's notes, newest first. | `200 OK` |
| 4 | GET | `/notes/42` | Get note 42. | `200 OK` |
| 5 | POST | `/notes` | Create a note. | `201 Created` |
| 6 | PATCH | `/notes/42` | Update some fields of note 42. | `200 OK` |
| 7 | DELETE | `/notes/42` | Delete note 42. | `204 No Content` |
| 8 | GET | `/tags` | List the user's tags. | `200 OK` |
| 9 | PUT | `/notes/42/tags/7` | Add tag 7 to note 42. | `204 No Content` |
| 10 | DELETE | `/notes/42/tags/7` | Remove tag 7 from note 42. | `204 No Content` |

### Query parameters for `GET /notes`

- `category` - only notes in this category (`personal`, `work` or `study`), for example `?category=work`.
- `tag` - only notes with this tag name, for example `?tag=exams`.
- `search` - only notes whose title or body contains this text, for example `?search=report`.
- `limit` and `page` - paging, for example `?limit=20&page=2`. The default limit is 20 and the maximum is 100.

Example: `GET /notes?category=work&search=report&limit=10`

## Request and response examples

### Create a note: `POST /notes`

Request:

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Revise HTTP methods",
  "body": "GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes.",
  "category": "study"
}
```

- `title` is required and has at most 100 characters.
- `body` is optional.
- `category` is optional and defaults to `personal`.

Response: `201 Created`, with the header `Location: /v1/notes/42`.

```json
{
  "id": 42,
  "title": "Revise HTTP methods",
  "body": "GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes.",
  "category": "study",
  "tags": [],
  "createdAt": "2026-10-22T09:15:00Z",
  "updatedAt": "2026-10-22T09:15:00Z"
}
```

### List notes: `GET /notes?category=study&limit=2&page=1`

Request:

```http
GET /v1/notes?category=study&limit=2&page=1
Authorization: Bearer eyJhbGciOi...
```

Response: `200 OK`

```json
{
  "data": [
    {
      "id": 42,
      "title": "Revise HTTP methods",
      "body": "GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes.",
      "category": "study",
      "tags": [{ "id": 7, "name": "exams" }],
      "createdAt": "2026-10-22T09:15:00Z",
      "updatedAt": "2026-10-22T09:15:00Z"
    },
    {
      "id": 31,
      "title": "Read the SQL chapter",
      "body": null,
      "category": "study",
      "tags": [],
      "createdAt": "2026-10-20T16:40:00Z",
      "updatedAt": "2026-10-20T16:40:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 5
}
```

### Update a note: `PATCH /notes/42`

Request body (only the fields that change):

```json
{ "title": "Revise HTTP status codes" }
```

Response: `200 OK` with the full updated note.

### Delete a note: `DELETE /notes/42`

No request body. Response: `204 No Content` with an empty body.

## Error codes

Every error uses the same JSON shape, with a machine-readable `code` and a human-readable `message`:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "A sentence explaining what went wrong."
  }
}
```

### 400 Bad Request

The request is invalid.

- **Example:** `POST /notes` with an empty title, or a title of 101 characters, or `"category": "hobby"`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The title is required and must be 100 characters or fewer.",
    "details": [{ "field": "title", "problem": "required" }]
  }
}
```

### 401 Unauthorized

The user is not logged in, or the token is missing, invalid or expired.

- **Example:** `GET /notes` with no `Authorization` header, or with a token that expired yesterday.

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "You must be logged in. Your token is missing or has expired."
  }
}
```

### 403 Forbidden

The user is logged in but is not allowed to do this.

- **Example:** user 1 sends `DELETE /notes/99`, but note 99 belongs to user 2.

```json
{
  "error": {
    "code": "NOT_YOUR_NOTE",
    "message": "You do not have permission to change this note."
  }
}
```

### 404 Not Found

The note, tag or URL does not exist.

- **Example:** `GET /notes/9999` when no note has id 9999, or `DELETE /notes/42` after note 42 was already deleted.

```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "No note with id 9999 exists."
  }
}
```

### 500 Internal Server Error

Something broke on the server. It is not the client's fault, and the message never reveals internal details.

- **Example:** the database connection fails while `GET /notes` is running.

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later."
  }
}
```

### Also used

- `429 Too Many Requests` when a user goes over 100 requests per minute (the response includes a `Retry-After` header).
- `503 Service Unavailable` when the service is overloaded or down for maintenance.