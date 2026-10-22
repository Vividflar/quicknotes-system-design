# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service used by 1 million people. This document sets out the requirements, estimates the load, and describes an architecture that can carry it.

## 1. Requirements

### Functional requirements

- A user can register and log in.
- A user can create, view, edit and delete their own notes.
- A note has a title (up to 100 characters), an optional body and a category (personal, work or study).
- A user can add tags to notes and filter notes by category, tag or search text.
- Notes are saved on the server, so a user sees the same notes on every device.
- Slow extras, such as exporting all notes to a PDF, run in the background.

### Non-functional requirements

- **Performance:** 95% of `GET /notes` requests finish in under 200 ms.
- **Availability:** 99.9% uptime (about 8.8 hours of downtime per year at most), with no single point of failure.
- **Scalability:** handle 1 million registered users, and grow by adding servers rather than rewriting the system.
- **Durability:** a saved note is never lost. The database is backed up every night and restores are tested.
- **Security:** all traffic uses HTTPS, passwords are stored only as hashes, and users can only reach their own notes.
- **Consistency:** a user sees their own change straight away. Another device may be up to a second behind.
- **Protection:** rate limiting stops one user or script from overloading the system.

## 2. Load estimate for 1 million users

### Assumptions

- 1,000,000 registered users.
- 20% of them use the app on a given day, so there are **200,000 daily active users (DAU)**.
- Each active user creates 5 notes per day.
- Each active user loads their notes 20 times per day.
- An average note, including its extra fields, is about 500 bytes.
- Busy hours have about 5× the average traffic.
- For easy maths, 1 day ≈ 100,000 seconds (the real figure is 86,400).

### Calculation

```text
Writes (new notes):  200,000 users × 5 notes    = 1,000,000 per day
                     1,000,000 ÷ 100,000        ≈ 10 writes per second
Reads (load notes):  200,000 users × 20 loads   = 4,000,000 per day
                     4,000,000 ÷ 100,000        ≈ 40 reads per second
Peak traffic (× 5):  ≈ 50 writes per second and ≈ 200 reads per second

Storage per year:    1,000,000 notes/day × 500 bytes = 500 MB per day
                     500 MB × 365                     ≈ 180 GB per year
```

### What this tells us

- QuickNotes is **read-heavy**: there are 4 times more reads than writes, so caching reads will help a lot.
- If the cache answers 80–90% of reads, only about 20–40 reads per second reach the database at peak.
- 200 requests per second at peak is manageable for a few ordinary app servers, and 180 GB per year fits comfortably in one well-configured database.
- The design does not need to be enormous. Over-engineering is also a mistake, so there is no sharding yet.

## 3. Architecture diagram

```text
                          ┌─────────┐
          ┌──────────────>│   DNS   │  (quicknotes.com -> IP addresses)
          │               └─────────┘
┌─────────┴─────┐  static files  ┌──────────────────────┐
│ Browser /     │ ─────────────> │ CDN (HTML, CSS, JS)  │
│ mobile client │                └──────────────────────┘
└─────────┬─────┘
          │ API calls (HTTPS, JSON)
          v
   ┌───────────────┐
   │ Load balancer │
   └──────┬────────┘
     ┌────┴─────┬──────────┐
     v          v          v
 ┌───────┐  ┌───────┐  ┌───────┐        ┌───────────────┐
 │ App 1 │  │ App 2 │  │ App 3 │ ─────> │ Cache (Redis) │
 └───┬───┘  └───┬───┘  └───┬───┘        └───────────────┘
     │ writes   │ reads      │ jobs
     v          v            v
 ┌─────────┐  ┌──────────┐  ┌───────┐   ┌────────┐
 │ Primary │─>│ Read     │  │ Queue │──>│ Worker │  (exports, emails)
 │   DB    │  │ replica  │  └───────┘   └────────┘
 └─────────┘  └──────────┘
   writes go to the primary, then it copies each change to the replica
```

Read the diagram from top to bottom, the way a request travels. The browser uses DNS to find the service and gets the static front end from the CDN. API calls go to the load balancer, which spreads them over identical, stateless app servers. Every app server uses the same cache. Writes go to the primary database, reads go to the replica (after checking the cache), and slow jobs go to the queue for the worker.

## 4. What each component does

- **Client (browser or mobile app):** shows the notes to the user and sends API requests, so the user never talks to the database directly.
- **DNS:** turns the name `quicknotes.com` into the IP addresses of the system, so users do not need to know where the servers are.
- **CDN:** keeps copies of the static files (HTML, CSS, JavaScript) on edge servers near users, so the app loads faster and our own servers carry less traffic.
- **Load balancer:** spreads requests across the app servers and stops sending traffic to any server that fails its health check, so no server is overloaded and one failure does not take the service down.
- **App servers:** run the QuickNotes API code and, because they are stateless, we can add more of them as traffic grows.
- **Cache (Redis):** keeps recently read note lists in memory (for example under `notes:user:1`), so most reads never reach the database and answer in about 1 ms.
- **Primary database:** stores the one true copy of all users, notes and tags, and is the only place that accepts writes, which keeps the data consistent.
- **Read replica:** holds a copy of the primary's data and answers read queries, so reading does not slow down writing and the primary is not overloaded.
- **Queue:** holds background jobs such as "export notes for user 7", so the app server can reply to the user at once and bursts of jobs wait in line instead of overloading the system.
- **Worker:** takes jobs from the queue and does the slow work in the background, so a slow export or email never delays a normal request.

## 5. Request flows

### `GET /notes` (load the user's notes)

1. The client sends `GET /notes` with its token in the `Authorization` header.
2. The request reaches the **load balancer**, which picks a healthy app server (about 1 ms).
3. The **app server** checks the token and finds out which user it is, for example user 1 (1–2 ms).
4. It asks the **cache** for the key `notes:user:1`.
5. **Cache hit:** the notes come back in about 1 ms and the server goes to step 8.
6. **Cache miss:** the server runs `SELECT ... FROM notes WHERE user_id = 1 ORDER BY created_at DESC` on the **read replica**. The index `idx_notes_user_created` makes this take about 5–20 ms.
7. The server saves the result in the cache with a time to live (TTL) of about 5 minutes, so the next request will be a hit.
8. The server turns the rows into JSON and replies with `200 OK`.

### `POST /notes` (create a note)

1. The client sends `POST /notes` with its token and the JSON body `{ "title": "...", "body": "...", "category": "study" }`.
2. The **load balancer** forwards the request to any healthy app server.
3. The **app server** checks the token to find the user.
4. It validates the data: the title is required and at most 100 characters, and the category is valid. If not, it replies `400 Bad Request`.
5. It writes the note to the **primary database** with the user's id (about 5–10 ms). Only the primary accepts writes.
6. It deletes the key `notes:user:1` from the **cache**, so a stale list is never served.
7. It replies `201 Created` with the new note and a `Location` header.
8. Within a few milliseconds, the primary copies the new row to the **read replica**.

## 6. Trade-offs

- **Speed versus freshness.** The cache and the read replica make reads very fast, but data in them can be slightly out of date: a cached list stays until it is deleted or expires, and the replica can lag behind the primary by a few milliseconds. I accept this because a note list that is one second old does no harm, and I reduce the problem by deleting the cache key on every write and by returning the new note in the `POST` response so the user sees it immediately.
- **Simplicity versus scalability.** I use one primary database with a replica and one organised application (a monolith), and I do not use sharding or microservices. This is much easier to build, debug and run, and it is enough for about 200 requests per second and 180 GB per year. The cost is that the primary could become the bottleneck if QuickNotes grew far beyond 1 million users, and then sharding would be needed.
- **Cost versus reliability.** Extra app servers, a replica and a hot standby cost money, but they give the uptime promised in the requirements. I choose three app servers (so one can fail or be updated while two keep working) rather than the cheapest single server.
- **Consistency versus availability.** If the primary database is unreachable, the system keeps serving reads from the cache and replicas (which may be slightly out of date) and rejects writes with `503 Service Unavailable` until a replica is promoted. I prefer this to taking the whole service offline, because for notes, an old list is better than no list.

## 7. Avoiding single points of failure

A single point of failure is a part that takes the whole system down if it breaks. For each component:

- **DNS:** use a provider with several name servers in different places.
- **CDN:** it has many edge servers, so if one fails users are served from another. If the CDN itself is unavailable, files can still be fetched from our origin.
- **Load balancer:** use a managed, redundant load balancer (or an active and a standby pair) spread over more than one data centre zone.
- **App servers:** run at least three identical, stateless servers. The load balancer's health checks remove a failed one within seconds, and no data is lost because the servers keep nothing important in memory.
- **Cache:** run Redis with a replica. If the cache fails, the app servers read from the database directly, which is slower but still works (graceful degradation).
- **Primary database:** keep at least one replica that can be promoted to primary automatically (failover), take nightly backups, and test restoring them.
- **Read replica:** use two or more replicas. If they are all down, reads fall back to the primary.
- **Queue:** use a managed, replicated queue that stores jobs on disk, so jobs survive a crash and are retried.
- **Worker:** run more than one worker. If one stops, the others continue taking jobs from the queue.

To protect the system further, we add rate limiting (`429 Too Many Requests`), timeouts on every call to the database or cache, retries with back-off (waiting 1, 2, then 4 seconds), and monitoring with alerts on error rate, latency, CPU and cache hit rate, so engineers find problems before users do.