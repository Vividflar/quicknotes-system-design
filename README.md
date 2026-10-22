# QuickNotes System Design

QuickNotes is moving from a browser-only app to an online service for 1 million people. This project has two halves. First, a small front-end API client proves that the browser can talk to a server: it loads, creates and deletes notes using the JSONPlaceholder practice API. Second, three design documents describe the real backend that an engineering team would build: the API, the database and the overall architecture.

## The API client

- Load 10 notes from the server with a `GET` request
- Create a note with a `POST` request (the title is required, with a maximum of 100 characters; the body is optional)
- Delete a note with a `DELETE` request
- Loading, success, error and empty states, each with its own style
- Buttons are disabled while a request is running
- All user text is inserted with `textContent`, never `innerHTML`

JSONPlaceholder is a practice API. It answers `POST` with status 201 and id 101, but it does not really save the note. The comments in `api.js` explain how the client handles this when deleting.

## How to run the API client

1. Clone the repository: `git clone https://github.com/your-username/quicknotes-system-design.git`
2. Open the folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server** (or double-click `index.html` to open it in your browser).
4. Click **Load notes**, add a note with the form, and delete a note with its Delete button.

You need an internet connection, because the client calls `https://jsonplaceholder.typicode.com`. There is nothing to install and no build step.

## Design documents

- [API design](docs/api-design.md): the REST endpoints, request and response examples, and error codes
- [Data model](docs/data-model.md): the tables, relationships, SQL, indexes and the SQL versus NoSQL decision
- [Architecture](docs/architecture.md): requirements, load estimate, diagram, components, request flows, trade-offs and single points of failure

## Files

- `index.html`: the page
- `style.css`: the styles
- `api.js`: the API client
- `docs/`: the three design documents

## What I learned

- `fetch` does not throw an error for a 404 or 500 response, so a reusable `request()` function must check `response.ok` and throw its own error.
- A practice API like JSONPlaceholder does not save new data, so the client has to handle that honestly, for example when deleting a note the server never stored.
- A many-to-many relationship, such as notes and tags, needs a join table that stores pairs of ids, and indexes should match the queries the app runs most often.
- A back-of-the-envelope estimate (about 40 reads and 10 writes per second on average) shows what we need to build, which prevents both under-building and over-engineering.
- Every component in an architecture solves one problem and brings a trade-off, and removing single points of failure means running more than one of everything important.