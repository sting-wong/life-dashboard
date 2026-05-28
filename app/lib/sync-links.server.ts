import { db } from "~/db/index.server";
import { notes, noteLinks } from "~/db/schema.server";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { parseWikiLinks } from "./parse-links";

/**
 * Sync note_links for a given note after content change.
 * Deletes old links from this source, then inserts new ones.
 */
export function syncNoteLinks(sourceNoteId: string, content: string) {
  // Remove existing links from this source
  db.delete(noteLinks)
    .where(eq(noteLinks.sourceNoteId, sourceNoteId))
    .run();

  const linkTitles = parseWikiLinks(content);

  for (const title of linkTitles) {
    // Find target note by title
    const targetNote = db.select({ id: notes.id })
      .from(notes)
      .where(eq(notes.title, title))
      .get();

    if (targetNote && targetNote.id !== sourceNoteId) {
      db.insert(noteLinks).values({
        id: uuid(),
        sourceNoteId,
        targetNoteId: targetNote.id,
        context: `[[${title}]]`,
      }).run();
    }
  }
}

/**
 * Get backlinks — notes that link TO this note.
 */
export function getBacklinks(noteId: string) {
  return db.select({
    id: noteLinks.id,
    sourceNoteId: noteLinks.sourceNoteId,
    sourceTitle: notes.title,
    context: noteLinks.context,
  })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(eq(noteLinks.targetNoteId, noteId))
    .all();
}

/**
 * Get all links FROM this note.
 */
export function getForwardLinks(noteId: string) {
  return db.select({
    id: noteLinks.id,
    targetNoteId: noteLinks.targetNoteId,
    targetTitle: notes.title,
    context: noteLinks.context,
  })
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.targetNoteId, notes.id))
    .where(eq(noteLinks.sourceNoteId, noteId))
    .all();
}
