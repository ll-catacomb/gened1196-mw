# Plan: Persisting User Audio Recordings

## 1. Goals
- Allow users to keep copies of their recordings during local development.
- Prepare the app to store recordings when client and server run on different machines.
- Minimize rework by defining a swappable storage adapter.

## 2. Immediate Local Workflow
1. Keep using `AudioRecorder.stop()` to return a `Blob` and wrap it with `blobToFile(...)` before upload.
2. Add a browser UX choice:
   - Default: POST the file to a new `/api/recordings` route.
   - Optional: trigger `URL.createObjectURL` + download for users who want local copies.
3. Implement `_context/server/recordings/localDisk.ts`:
   - Ensure a `recordings/` folder exists at startup.
   - Write uploaded files via `fs.promises.writeFile`.
   - Persist metadata (filename, user/session, createdAt, duration) in a lightweight JSON or SQLite store.
4. Extend the existing transcription route (or create a dedicated handler) to save the raw audio before downstream processing so the API surface stays small.

## 3. Browser Persistence Enhancements
- Use IndexedDB (via `idb-keyval`) for in-browser caching of recent recordings to survive refreshes/offline use.
- Expose a “Manage recordings” panel backed by IndexedDB so users can replay or delete before upload.
- For Chrome/Edge, optionally offer the File System Access API to stream chunks directly to user-chosen directories, with download fallback elsewhere.

## 4. Storage Abstraction
1. Define `StorageProvider` interface with `save`, `getUrl`, `delete`, `listByOwner`.
2. Create `LocalDiskProvider` (step 2) and wire it through dependency injection (e.g., context provider or simple factory using `process.env.STORAGE_BACKEND`).
3. Store only object keys + metadata in the primary DB layer to keep storage implementation decoupled.

## 5. Production-Ready Path
1. Introduce `S3Provider` (compatible with DigitalOcean Spaces, GCS via S3 API).
   - Use signed URLs for direct browser uploads when the backend is serverless.
   - Configure lifecycle policies (retention window, archival) and server-side encryption.
2. If server execution environment has ephemeral disks (Vercel/Netlify), move all writes to object storage immediately within the API route.
3. Update infrastructure docs with required IAM policy + environment variables (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`).

## 6. Security & Compliance Considerations
- Gate uploads behind authenticated sessions; include ownership checks on read/delete routes.
- Encrypt data at rest (S3 SSE) and enforce HTTPS-only access.
- Configure retention/deletion policies aligned with privacy requirements; expose a user-facing “delete recording” control.

## 7. Verification & Rollout
1. Add integration tests for the new API route with a mock storage provider.
2. Implement logging + alerting when a storage write fails.
3. Run manual QA:
   - Local disk write succeeds and entries appear in metadata store.
   - IndexedDB retains files across reloads.
   - S3 upload via signed URL works from a staging environment.
4. Document operational runbooks (clearing local cache, rotating S3 keys).
