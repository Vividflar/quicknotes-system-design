// ---------- Setup ----------
const API_URL = "https://jsonplaceholder.typicode.com/posts";

const MAX_TITLE = 100;

const loadBtn = document.querySelector("#load-btn");
const form = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");
const statusEl = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");

// The notes currently shown on the page
let notes = [];

// ---------- Status messages ----------
// type is "loading", "success" or "error" (each has its own style in style.css)
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

// Disable the buttons while a request is running
function setBusy(busy) {
  loadBtn.disabled = busy;
  submitBtn.disabled = busy;
  for (const button of document.querySelectorAll(".delete-btn")) {
    button.disabled = busy;
  }
}

// ---------- API functions ----------
// One reusable function for every request: it calls fetch, checks response.ok
// and throws an error when the server answers with an error status.
async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`Server responded with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  return { status: response.status, data };
}

// GET: load 10 notes
async function getNotes() {
  const { data } = await request(`${API_URL}?_limit=10`);
  return data;
}

// ---------- Rendering (user text is inserted with textContent only) ----------
function createNoteElement(note) {
  const li = document.createElement("li");
  li.classList.add("note");

  const title = document.createElement("h3");
  title.textContent = note.title;
  li.appendChild(title);

  if (note.body) {
    const body = document.createElement("p");
    body.textContent = note.body;
    li.appendChild(body);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.classList.add("delete-btn");
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => handleDelete(note));
  li.appendChild(deleteBtn);

  return li;
}

function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.classList.add("empty-message");
    empty.textContent = "No notes to show.";
    notesList.appendChild(empty);
    return;
  }

  for (const note of notes) {
    notesList.appendChild(createNoteElement(note));
  }
}

// ---------- Load notes ----------
async function handleLoad() {
  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    notes = await getNotes();
    renderNotes();
    const word = notes.length === 1 ? "note" : "notes";
    setStatus(`Loaded ${notes.length} ${word} from the server.`, "success");
  } catch (error) {
    setStatus(
      `Sorry, we could not load your notes. Please check your connection and try again. (${error.message})`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ---------- Create a note ----------
// The title is required and may have at most 100 characters; the body is optional.
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title for your note.";
  }
  if (title.length > MAX_TITLE) {
    return `The title must be ${MAX_TITLE} characters or fewer (it has ${title.length}).`;
  }
  return "";
}

async function handleSubmit(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Creating note...", "loading");

  try {
    const { status, data } = await createNote({ title, body, userId: 1 });
    // local: true marks a note created in this session (see handleDelete)
    notes.unshift({ title, body, userId: 1, ...data, local: true });
    renderNotes();
    form.reset();
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    setStatus(`Sorry, the note could not be created. Please try again. (${error.message})`, "error");
  } finally {
    setBusy(false);
  }
}

// ---------- Delete a note ----------
// JSONPlaceholder is a practice API: it ACCEPTS our POST and answers 201 with
// id 101, but it does NOT really save the note. So a later DELETE /posts/101 is
// about a note the server never stored, and it may answer 404 Not Found.
// My approach:
//   - Notes loaded from the server are deleted with a real DELETE request, and
//     are only removed from the page after the server says OK.
//   - A note created in this session (note.local) is also sent to the server,
//     but if the server says 404 we still remove it from the page, because
//     "not found" means it is already gone. We tell the user what happened.
//   - Every new note gets the same id (101), so notes are removed by object
//     (not by id), otherwise one click could remove several notes.
async function handleDelete(note) {
  setBusy(true);
  setStatus("Deleting note...", "loading");

  try {
    await deleteNoteById(note.id);
    removeNote(note);
    setStatus(`Note ${note.id} deleted.`, "success");
  } catch (error) {
    if (note.local && error.status === 404) {
      removeNote(note);
      setStatus(
        "Note removed from your list. (The practice server never stored it, so there was nothing to delete there.)",
        "success"
      );
    } else {
      setStatus(`Sorry, the note could not be deleted. Please try again. (${error.message})`, "error");
    }
  } finally {
    setBusy(false);
  }
}

function removeNote(note) {
  notes = notes.filter((item) => item !== note);
  renderNotes();
}

loadBtn.addEventListener("click", handleLoad);
form.addEventListener("submit", handleSubmit);