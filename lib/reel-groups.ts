/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A POST, NOT A PILE OF FILES.
 *
 * The bucket holds one object per file, so a five-slide carousel arrives in
 * the library as five separate rows plus a caption — and posting it from a
 * phone means five taps through five share sheets, in the right order, without
 * losing count. That is worse than downloading a zip from GitHub, which is the
 * thing the dashboard existed to replace.
 *
 * The uploader names them `carousel-<stamp>-01.png` … `-05.png` and
 * `carousel-<stamp>-caption.txt`, so the stamp already says which post a file
 * belongs to. This turns that back into posts.
 *
 * Pure, because the ordering is the part with a wrong answer: slide 10 sorting
 * before slide 2 is a carousel that reads in the wrong order, and it would be
 * invisible until somebody posted one.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface StoredFile {
  name: string;
  url?: string | null;
  size?: number | null;
  createdAt?: string | null;
}

export interface PostGroup {
  /** Stable across reloads: used as a React key and as the group's heading. */
  id: string;
  kind: "reel" | "carousel";
  /** What to show as the title. */
  title: string;
  /** In posting order. For a carousel this is slide 1..n. */
  files: StoredFile[];
  /** The caption file, if one was uploaded. Never part of `files`. */
  caption?: StoredFile;
  createdAt?: string | null;
}

/** `carousel-2026-09-06T12-11-03.png` → stamp `2026-09-06T12-11`, slide 3. */
const SLIDE = /^carousel-(.+?)-(\d+)\.(?:png|jpe?g)$/i;

/**
 * `<anything>-caption.txt`, not `carousel-<stamp>-caption.txt`.
 *
 * The reel recorder has written a caption beside every MP4 since the day the
 * caption builder was added, and it reached nobody: the workflow uploaded the
 * film and the subtitles and left the caption on the runner, and this file
 * only knew the carousel spelling. A caption the pipeline writes and then
 * discards is worse than none, because the reason for building it was that
 * the hand-typed step at the end is where things go wrong.
 *
 * One rule for both now — a file is the caption for whatever shares its stem.
 */
const CAPTION = /^(.+)-caption\.txt$/i;
const CAROUSEL = "carousel-";

/**
 * Group stored files into things somebody can post.
 *
 * A reel is one file and stays one row. A carousel is however many slides
 * share a stamp, in numeric order.
 */
export function groupPosts(files: readonly StoredFile[]): PostGroup[] {
  const carousels = new Map<string, PostGroup>();
  /** Reel captions, by the stem they belong to. Attached in a second pass. */
  const captions = new Map<string, StoredFile>();
  const out: PostGroup[] = [];

  for (const file of files) {
    const caption = CAPTION.exec(file.name);
    if (caption) {
      if (!caption[1].toLowerCase().startsWith(CAROUSEL)) {
        // A reel's caption. The film it belongs to may not have been listed
        // yet, so this waits rather than guessing at an order.
        captions.set(caption[1], file);
        continue;
      }
      const id = caption[1];
      const group = carousels.get(id) ?? blank(id, file.createdAt);
      carousels.set(id, group);
      group.caption = file;
      if (!out.includes(group)) out.push(group);
      continue;
    }

    const slide = SLIDE.exec(file.name);
    if (slide) {
      const id = `carousel-${slide[1]}`;
      const group = carousels.get(id) ?? blank(id, file.createdAt);
      carousels.set(id, group);
      group.files.push(file);
      if (!out.includes(group)) out.push(group);
      continue;
    }

    out.push({
      id: file.name,
      kind: "reel",
      title: file.name,
      files: [file],
      createdAt: file.createdAt,
    });
  }

  /**
   * NUMERIC, NOT ALPHABETICAL. "10" sorts before "2" as text, so a ten-slide
   * carousel would read 1, 10, 2, 3 — and nothing downstream could tell,
   * because every slide is present and the order looks deliberate.
   */
  for (const group of carousels.values()) {
    group.files.sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
    group.title = `Carousel · ${group.files.length} slide${group.files.length === 1 ? "" : "s"}`;
  }

  /**
   * The reel captions, onto the films that share their stem.
   *
   * A caption whose film is not in the listing is DROPPED rather than shown as
   * a row of its own. There is nothing to post without the video, and a row
   * that is a text file pretending to be a reel is a worse answer than a reel
   * that is missing — which the absence of its row already says.
   */
  for (const group of out) {
    if (group.kind !== "reel" || group.caption) continue;
    const stem = group.files[0]?.name.replace(/\.[^.]+$/, "");
    const caption = stem ? captions.get(stem) : undefined;
    if (caption) group.caption = caption;
  }

  return out;
}

function blank(id: string, createdAt?: string | null): PostGroup {
  return { id, kind: "carousel", title: "Carousel", files: [], createdAt };
}

function slideNumber(name: string): number {
  const m = SLIDE.exec(name);
  return m ? Number(m[2]) : 0;
}
