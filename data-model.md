# QuickNotes Data Model

QuickNotes stores four kinds of thing: **users**, **notes**, **tags** and the links between notes and tags (**note_tags**). The SQL below is written for SQLite, which is the dialect used in this course. PostgreSQL and MySQL would need only small changes.

## Entities

### users

| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL, UNIQUE |
| `password_hash` | TEXT | NOT NULL (a one-way hash, never the plain password) |
| `created_at` | TEXT | Defaults to the current time |

### notes

| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users.id`, NOT NULL |
| `title` | TEXT | NOT NULL, at most 100 characters (CHECK) |
| `body` | TEXT | Optional |
| `category` | TEXT | NOT NULL, one of `personal`, `work`, `study` (CHECK), default `personal` |
| `created_at` | TEXT | Defaults to the current time |
| `updated_at` | TEXT | Defaults to the current time |

### tags

| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users.id`, NOT NULL |
| `name` | TEXT | NOT NULL; a user cannot have two tags with the same name (UNIQUE with `user_id`) |

### note_tags (join table)

| Column | Type | Key / rules |
|--------|------|-------------|
| `note_id` | INTEGER | **Foreign key** to `notes.id`, part of the primary key |
| `tag_id` | INTEGER | **Foreign key** to `tags.id`, part of the primary key |

The primary key is the pair `(note_id, tag_id)`, so the same tag cannot be added to the same note twice.

## Relationships

- **users to notes is one-to-many.** One user has many notes, and each note belongs to exactly one user, so `notes` has the foreign key `user_id`.
- **users to tags is one-to-many.** One user has many tags, and each tag belongs to one user, so `tags` has the foreign key `user_id`. Every user has their own set of tags.
- **notes to tags is many-to-many.** A note can have many tags (for example "exams" and "urgent"), and a tag can be on many notes. A column holds only one value, so neither table can store this link by itself. The join table `note_tags` stores one pair of ids per row, such as `(note 1, tag 10)` and `(note 1, tag 11)`.
- **Deleting:** every foreign key uses `ON DELETE CASCADE`. Deleting a user deletes their notes and tags, and deleting a note or a tag deletes its rows in `note_tags`, so no orphan rows are left behind.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;  -- SQLite only enforces foreign keys when this is on

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  title       TEXT NOT NULL CHECK (length(title) <= 100),
  body        TEXT,
  category    TEXT NOT NULL DEFAULT 'personal'
              CHECK (category IN ('personal', 'work', 'study')),
  created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id       INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL,
  name     TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id  INTEGER NOT NULL,
  tag_id   INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);
```

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes(user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id   ON note_tags(tag_id);
```

- **`idx_notes_user_created`** - `GET /notes` always asks for one user's notes, newest first (`WHERE user_id = ? ORDER BY created_at DESC`). Without an index, the database would read every note of every user. With it, the database jumps straight to that user's notes, already in date order. This is the most important index in the system, because listing notes is the most common request.
- **`idx_note_tags_tag_id`** - the primary key `(note_id, tag_id)` already makes it fast to find the tags of a note, but not the notes of a tag. This index speeds up `GET /notes?tag=exams`, and also the clean-up when a tag is deleted.
- **Trade-off:** indexes make reads faster but make every insert, update and delete slightly slower, and they use extra space. These two are worth it because QuickNotes is read-heavy. `users.email` and every primary key are indexed automatically.

## Example queries

The `?` marks are placeholders. The server passes the values separately, which protects against SQL injection. Each query is the one the server would run for an API endpoint.

```sql
-- 1. GET /notes: one user's notes, newest first, one page at a time
SELECT id, title, category, created_at
FROM notes
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT ? OFFSET ?;

-- 2. JOIN: every note together with its tags (notes with no tags are left out)
SELECT notes.id, notes.title, tags.name AS tag
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags      ON tags.id = note_tags.tag_id
WHERE notes.user_id = ?
ORDER BY notes.id, tags.name;

-- 3. GET /notes?tag=exams: the user's notes that have a given tag
SELECT notes.id, notes.title, notes.category
FROM notes
JOIN note_tags ON note_tags.note_id = notes.id
JOIN tags      ON tags.id = note_tags.tag_id
WHERE notes.user_id = ? AND tags.name = ?
ORDER BY notes.created_at DESC;

-- 4. How many notes the user has in each category
SELECT category, COUNT(*) AS number_of_notes
FROM notes
WHERE user_id = ?
GROUP BY category;

-- 5. Notes that have no tags at all (LEFT JOIN)
SELECT notes.id, notes.title
FROM notes
LEFT JOIN note_tags ON note_tags.note_id = notes.id
WHERE notes.user_id = ? AND note_tags.note_id IS NULL;

-- 6. PATCH /notes/42: change the title (AND user_id = ? means users only change their own notes)
UPDATE notes
SET title = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND user_id = ?;

-- 7. DELETE /notes/42: its rows in note_tags are removed automatically (ON DELETE CASCADE)
DELETE FROM notes
WHERE id = ? AND user_id = ?;
```

## SQL or NoSQL?

I choose **SQL** for QuickNotes. The data is clearly structured: every user, note and tag has the same fixed fields. It is also built on relationships: users own notes and tags, and notes and tags are linked many-to-many, which relational databases handle with foreign keys and `JOIN`. The database enforces the important rules itself (a unique email, a title of at most 100 characters, a valid category, no duplicate tag on a note, no note without an owner), whichever server or person makes the change. A document database such as MongoDB would store each user's notes and tags inside one document, so asking "show every note with the tag exams" or renaming a tag would be awkward, and the data could be duplicated and fall out of sync. At 1 million users the system needs only about 180 GB of new data per year, which one SQL database with read replicas handles comfortably. I would only reconsider NoSQL if notes later became very flexible (images, checklists, drawings) or the system grew far beyond what replicas and sharding can handle.