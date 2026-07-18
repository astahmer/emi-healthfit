# Database schema

The Drizzle definitions in `apps/api/src/db/schema.ts` are the source of truth. Tables are not renamed here: a physical rename needs a generated Drizzle migration and a data-compatibility decision.

```mermaid
erDiagram
  CONVERSATIONS ||--o{ MESSAGES : contains
  CONVERSATIONS ||--o{ THREADS : has
  MESSAGES ||--o{ THREADS : anchors
  THREADS ||--o{ THREAD_MESSAGES : includes
  MESSAGES ||--o{ THREAD_MESSAGES : appears_in
  CONVERSATIONS ||--o{ CHAT_GENERATIONS : runs
  CHAT_GENERATIONS ||--o{ CHAT_GENERATION_CHUNKS : persists
  CONVERSATIONS ||--o{ CHAT_EVENTS : records
  CHAT_GENERATIONS ||--o{ CHAT_EVENTS : emits
  HEVY_SESSIONS ||--o{ HEVY_SETS : contains

  CONVERSATIONS {
    text id PK
    text user_id
    text status
    integer pinned
  }
  MESSAGES {
    text id PK
    text user_id
    text conversation_id FK
    text parent_id
    text role
    text parts
  }
  THREADS {
    text id PK
    text user_id
    text conversation_id FK
    text anchor_message_id FK
    text status
  }
  THREAD_MESSAGES {
    text user_id PK
    text thread_id PK, FK
    text message_id PK, FK
  }
  CHAT_GENERATIONS {
    text id PK
    text user_id
    text conversation_id FK
    text status
    text request_id
    text trace_id
  }
  CHAT_GENERATION_CHUNKS {
    text user_id PK
    text generation_id PK, FK
    integer sequence PK
    text chunk
  }
  CHAT_EVENTS {
    text id PK
    text user_id
    text conversation_id FK
    text generation_id FK
    text type
    text payload
  }
  HEVY_SESSIONS {
    text user_id PK
    text session_id PK
    text start_time
  }
  HEVY_SETS {
    integer id PK
    text user_id FK
    text session_id FK
    text exercise_title
    integer set_index
  }
```

All health, chat, suggestions, memory, notes, and privacy rows are owner-scoped by `user_id`. The ownership column is intentionally shown even where the database has no declared foreign key to the Better Auth tables.

| Area             | Tables                                                                                |
| ---------------- | ------------------------------------------------------------------------------------- |
| Health import    | `daily_activity`, `health_workouts`, `sleep_sessions`, `body_metrics`, `sync_cursors` |
| Strength import  | `hevy_sessions`, `hevy_sets`                                                          |
| Conversation     | `conversations`, `messages`, `threads`, `thread_messages`                             |
| Chat reliability | `chat_generations`, `chat_generation_chunks`, `chat_events`                           |
| User data        | `suggestions`, `memories`, `notes`, `privacy_preferences`                             |
