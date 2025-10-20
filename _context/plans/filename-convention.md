# Recording Filename Convention Plan

## Problem Statement

Currently, each recording generates its own timestamp, making it difficult to:
- Group recordings from the same exam session
- Find all files (presentation + 3 question answers) for a specific student
- Clean up or archive recordings by session
- Link recordings back to Airtable records

**Current format:**
```
2025-10-20T12-34-56_presentation_a1b2c3d4.webm
2025-10-20T12-41-23_question-1_b2c3d4e5.webm  ← Different timestamp!
2025-10-20T12-43-45_question-2_c3d4e5f6.webm
2025-10-20T12-45-12_question-3_d4e5f6g7.webm
```

## Requirements

1. **Group by session** - All 4 recordings from one exam should share a session ID
2. **Include student name** - Easy to find recordings by student
3. **Preserve order** - Clear what recording #1, #2, etc. are
4. **Filesystem safe** - No special characters that break on Windows/Mac/Linux
5. **Sortable** - Chronological ordering by filename
6. **Unique** - No collisions even if two students have same name

---

## ⭐ SELECTED APPROACH: Millisecond Timestamp Session ID

**Format:**
```
{session_id}_{student_name}_{part}.{ext}

Examples:
20251020-123456.789_sarah-johnson_presentation.webm
20251020-123456.789_sarah-johnson_question-1.webm
20251020-123456.789_sarah-johnson_question-2.webm
20251020-123456.789_sarah-johnson_question-3.webm
```

### Session ID Format: `YYYYMMDD-HHMMSS.SSS`

**Inspired by Slack's timestamp format.**

- `YYYYMMDD` - Date (sortable, chronological)
- `HHMMSS` - Time with seconds precision
- `SSS` - Milliseconds for uniqueness
- Total length: 19 characters
- Example: `20251020-123456.789`

### Key Design Decision

**Why milliseconds are sufficient:**
> Since only ONE exam can be in progress at a time per user/device, timestamp collision is physically impossible. The millisecond precision provides more than enough uniqueness even if someone rapidly starts/stops exams.

This is like Slack's approach: each message gets a unique timestamp because they arrive sequentially, not concurrently.

### Advantages

✅ **Easy session grouping:** `ls 20251020-123456.789*` finds all 4 files
✅ **Easy student search:** `ls *sarah-johnson*` finds all their exams
✅ **Chronologically sortable:** Natural filesystem sort = time order
✅ **Human-readable:** Can convert `20251020-123456.789` back to exact datetime
✅ **No collision risk:** Only one recording session at a time per device
✅ **Shorter:** 19 chars vs 23 chars (with random suffix)
✅ **Deterministic:** Same start time = same session ID = predictable
✅ **Works before name extraction:** Use `"unknown"` placeholder initially

### Trade-offs

⚠️ **Future-proofing:** If system ever allows concurrent exams on same device, need additional uniqueness
⚠️ **Client-server coordination:** Must pass session ID from client to server for all 4 recordings

### Example File Listing

```bash
$ ls -1 recordings/

20251020-091234.567_michael-chen_presentation.webm
20251020-091234.567_michael-chen_question-1.webm
20251020-091234.567_michael-chen_question-2.webm
20251020-091234.567_michael-chen_question-3.webm

20251020-103045.123_sarah-johnson_presentation.webm
20251020-103045.123_sarah-johnson_question-1.webm
20251020-103045.123_sarah-johnson_question-2.webm
20251020-103045.123_sarah-johnson_question-3.webm

20251020-114512.890_unknown_presentation.webm
20251020-114512.890_unknown_question-1.webm
20251020-114512.890_unknown_question-2.webm
20251020-114512.890_unknown_question-3.webm
```

**Finding all sessions from Oct 20:**
```bash
ls recordings/20251020*
```

**Finding all files for Sarah:**
```bash
ls recordings/*sarah-johnson*
```

**Finding specific session:**
```bash
ls recordings/20251020-103045.123*
```

---

## Alternative Options (Considered but Not Selected)

### Option 2: Random Suffix Session ID

**Format:** `YYYYMMDD-HHMMSS-{4-byte-hex}_{student_name}_{part}.{ext}`

**Example:** `20251020-123456-a1b2c3d4_sarah-johnson_presentation.webm`

**Why not chosen:**
- ❌ Longer (23 chars vs 19 chars)
- ❌ Random suffix adds no value when collision impossible
- ❌ Less human-readable (what does `a1b2c3d4` mean?)
- ❌ Can't convert back to exact start time

---

### Option 3: First Recording Timestamp

**Format:** `{first_recording_ts}_{student_name}_{part}.{ext}`

**Example:** `20251020-123456_sarah-johnson_question-2.webm`

**Why not chosen:**
- ❌ Still has collision risk without milliseconds
- ❌ Timestamp without milliseconds = less precision
- ❌ Identical to our chosen approach if we add `.SSS`, so this is redundant

---

### Option 4: Student Name First

**Format:** `{student_name}_{date}_{time}_{part}.{ext}`

**Example:** `sarah-johnson_20251020_123456_presentation.webm`

**Why not chosen:**
- ❌ Not sortable by time (student name sorts alphabetically)
- ❌ Harder to group by session (need to look at date + time range)
- ❌ Doesn't work well if student retakes exam on same day

---

### Option 5: UUID Session ID

**Format:** `{uuid}_{part}.{ext}`

**Example:** `550e8400-e29b-41d4-a716-446655440000_presentation.webm`

**Why not chosen:**
- ❌ Not human-readable
- ❌ Can't tell when exam happened from filename
- ❌ Not chronologically sortable
- ❌ Requires separate metadata file/database to find student names

---

## Implementation Plan

### 1. Generate Session ID on Client

```typescript
// In page.tsx, when starting recording
const [sessionId, setSessionId] = useState<string>("");

const startRecording = async () => {
  // Generate session ID: YYYYMMDD-HHMMSS.SSS
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');

  const newSessionId = `${year}${month}${day}-${hours}${minutes}${seconds}.${ms}`;
  setSessionId(newSessionId);

  console.log("Session ID:", newSessionId); // e.g., "20251020-123456.789"

  // ... rest of recording setup
};
```

### 2. Pass Session ID to Server

```typescript
// In persistRecording()
const formData = new FormData();
formData.append("audio", blobToFile(audioBlob, `${context}.webm`));
formData.append("context", context);
formData.append("sessionId", sessionId); // ← Add this
formData.append("studentName", studentName || "unknown"); // ← Add this
```

### 3. Update Server-Side Filename Logic

```typescript
// In /api/recordings/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  const context = formData.get("context")?.toString() ?? "recording";
  const sessionId = formData.get("sessionId")?.toString(); // ← New
  const studentName = formData.get("studentName")?.toString(); // ← New

  const safeStudentName = studentName
    ? sanitizeSegment(studentName)
    : "unknown";

  const ext = detectExtension(audioFile);

  // New format: {sessionId}_{studentName}_{context}.{ext}
  const fileName = sessionId
    ? `${sessionId}_${safeStudentName}_${context}.${ext}`
    : `${new Date().toISOString().replace(/[:.]/g, "-")}_${context}_${randomBytes(4).toString("hex")}.${ext}`;
    // ↑ Fallback to old format if no sessionId (backwards compatible)

  const filePath = path.join(RECORDINGS_DIR, fileName);

  await mkdir(RECORDINGS_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  return NextResponse.json({
    success: true,
    fileName,
    relativePath: path.relative(process.cwd(), filePath),
  });
}
```

### 4. Store Session ID in Airtable

Add `session_id` field to Airtable's **transcripts** table:

```typescript
// In /api/airtable/save
const transcriptData: AirtableTranscript["fields"] = {
  transcript: fullTranscript,
  student_name: studentName,
  cards: cardsString,
  timestamp: new Date().toISOString(),
  final_questions: questionsWithAnswers.map(qa => qa.question).join("\n\n"),
  session_id: sessionId, // ← Add this field
  recording_files: {
    presentation: presentationFile,
    questions: questionFiles,
  }
};
```

**Airtable schema update:**
- Field name: `session_id`
- Field type: Single line text
- Example value: `20251020-123456.789`

### 5. Backwards Compatibility

The implementation includes fallback logic:
- If `sessionId` is provided → use new format
- If not provided → use old format (timestamp + random suffix)
- No breaking changes for existing code

---

## Migration Strategy

### Phase 1: Deploy Server Changes ✅
- Update `/api/recordings/route.ts` with new filename logic
- Support both old and new formats (backwards compatible)
- No client changes yet = existing code still works

### Phase 2: Update Client to Send Session ID ✅
- Generate session ID when recording starts
- Pass `sessionId` and `studentName` in FormData
- Monitor logs to verify new format is being used

### Phase 3: Update Airtable Schema ✅
- Add `session_id` field to transcripts table
- Update `/api/airtable/save` to store session ID
- Test end-to-end flow

### Phase 4: Verify & Monitor 📊
- Check that all new recordings use new format
- Verify old recordings still work (if any exist)
- Monitor for any filename collisions (should be zero)

### Phase 5: Cleanup (Optional) 🧹
- After confirming new format works, remove old format fallback
- Add script to rename old recordings to new format if needed
- Update CLAUDE.md documentation

---

## Edge Cases

### Student name not extracted yet
**Problem:** Recording starts before we extract name from transcript
**Solution:** Use `"unknown"` placeholder, don't rename files later

### Special characters in names
**Handled by:** `sanitizeSegment()` function
**Examples:**
- `O'Brien` → `o-brien`
- `José García` → `jose-garcia`
- `李明 (Li Ming)` → `li-ming`

### Session ID collisions
**Risk:** Extremely low (millisecond precision)
**Reality:** Physically impossible since only one exam runs at a time
**If needed:** Add 2-char random suffix: `20251020-123456.789-a1`

### Student retakes exam
**Scenario:** Same student, same day, multiple exams
**Solution:** Each session gets unique ID (different milliseconds)
**Example:**
```
20251020-091234.567_sarah-johnson_presentation.webm  ← First attempt
20251020-143022.891_sarah-johnson_presentation.webm  ← Second attempt (retake)
```

### Time zones
**Current:** Uses local device time
**Consideration:** If deployed globally, may want UTC
**Impact:** Minimal (session ID still unique and sortable)

### Daylight saving time
**Risk:** Clock jumps backward could cause collision
**Reality:** Milliseconds + sequential operation = still safe
**Mitigation:** If paranoid, add 2-char random suffix

---

## Converting Session ID Back to DateTime

```typescript
// Utility function to parse session ID
function parseSessionId(sessionId: string): Date {
  // sessionId format: "20251020-123456.789"
  const [datePart, timePart] = sessionId.split('-');
  const [time, ms] = timePart.split('.');

  const year = parseInt(datePart.substring(0, 4));
  const month = parseInt(datePart.substring(4, 6)) - 1; // JS months are 0-indexed
  const day = parseInt(datePart.substring(6, 8));
  const hours = parseInt(time.substring(0, 2));
  const minutes = parseInt(time.substring(2, 4));
  const seconds = parseInt(time.substring(4, 6));
  const milliseconds = parseInt(ms);

  return new Date(year, month, day, hours, minutes, seconds, milliseconds);
}

// Example usage
const sessionId = "20251020-123456.789";
const date = parseSessionId(sessionId);
console.log(date.toLocaleString()); // "10/20/2025, 12:34:56 PM"
```

---

## Summary

**Chosen format:** `YYYYMMDD-HHMMSS.SSS_{student_name}_{part}.{ext}`

**Example:** `20251020-123456.789_sarah-johnson_presentation.webm`

**Key benefits:**
1. ✅ Groups all 4 files per session
2. ✅ Human-readable and sortable
3. ✅ No collision risk (sequential operations)
4. ✅ Shorter than alternatives (19 chars)
5. ✅ Convertible back to exact start time

**Implementation:** 3-phase rollout with backwards compatibility

**Result:** Clean, organized recordings directory that's easy to navigate and manage.
