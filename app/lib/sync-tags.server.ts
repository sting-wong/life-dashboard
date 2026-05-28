import { db } from "~/db/index.server";
import { tags, noteTags } from "~/db/schema.server";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { parseInlineTags } from "./parse-tags";

/**
 * Sync note_tags for a given note after content change.
 * Creates new tags if they don't exist, then links note to tags.
 */
export function syncNoteTags(noteId: string, content: string) {
  const tagNames = parseInlineTags(content);

  // Remove existing note-tag associations for this note
  db.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();

  for (const tagName of tagNames) {
    // Find or create tag
    let tag = db.select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, tagName))
      .get();

    if (!tag) {
      const tagId = uuid();
      db.insert(tags).values({
        id: tagId,
        name: tagName,
        color: null,
      }).run();
      tag = { id: tagId };
    }

    // Create note-tag association
    db.insert(noteTags).values({
      noteId,
      tagId: tag.id,
    }).run();
  }
}

/**
 * Get all notes for a given tag name.
 */
export function getNotesByTag(tagName: string) {
  const tag = db.select({ id: tags.id }).from(tags).where(eq(tags.name, tagName.toLowerCase())).get();
  if (!tag) return [];

  return db.select({
    id: noteTags.noteId,
    tagId: noteTags.tagId,
  })
    .from(noteTags)
    .where(eq(noteTags.tagId, tag.id))
    .all();
}
