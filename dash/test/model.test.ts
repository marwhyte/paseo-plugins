import { describe, expect, it } from "vitest";
import { classify, reReviewPrompt, type PullRequestSummary } from "../shared/model";

const pr = (overrides: Partial<PullRequestSummary> = {}): PullRequestSummary => ({
  number: 8007,
  url: "https://github.com/acme/app/pull/8007",
  state: "OPEN",
  isDraft: false,
  mine: false,
  checks: "passed",
  reviewDecision: null,
  newCommits: 0,
  newComments: 0,
  reviewedByMe: true,
  ...overrides,
});

describe("classify", () => {
  it("puts a reviewed PR with new commits in Re-look", () => {
    expect(classify("done", pr({ newCommits: 3, newComments: 1 }))).toEqual({
      group: "relook",
      detail: "#8007 · 3 new commits, 1 new comment since you looked",
    });
  });

  it("waits on the author when nothing changed", () => {
    expect(classify("done", pr())).toEqual({
      group: "waiting",
      detail: "#8007 · waiting on author",
    });
  });

  it("shows your own PR's blocker instead", () => {
    expect(classify("done", pr({ mine: true, checks: "failed" }))?.detail).toBe(
      "#8007 · checks failing",
    );
  });

  it("hides someone else's draft, even when they push to it, until it's ready", () => {
    expect(classify("done", pr({ isDraft: true }))).toBeNull();
    expect(classify("done", pr({ isDraft: true, newCommits: 4 }))).toBeNull();
    expect(classify("done", pr({ newCommits: 4 }))?.group).toBe("relook");
  });

  it("keeps a draft visible while its chat needs you, works, or has unread results, and keeps your own drafts", () => {
    expect(classify("running", pr({ isDraft: true }))?.group).toBe("working");
    expect(classify("attention", pr({ isDraft: true }))?.group).toBe("unread");
    expect(classify("done", pr({ isDraft: true, mine: true }))).toEqual({
      group: "waiting",
      detail: "#8007 · draft",
    });
  });

  it("marks merged and closed PRs done, even with activity after the last look", () => {
    expect(classify("done", pr({ state: "MERGED", newCommits: 2 }))).toEqual({
      group: "done",
      detail: "#8007 · merged",
    });
  });

  it("lets live chat state win over PR state", () => {
    expect(classify("running", pr({ newCommits: 2 }))?.group).toBe("working");
    expect(classify("needs_input", pr())?.group).toBe("needs-you");
  });

  it("files a finished chat without a PR under Unread until seen, then Done", () => {
    expect(classify("attention", null)).toEqual({ group: "unread", detail: "finished" });
    expect(classify("done", null)).toEqual({ group: "done", detail: "finished" });
  });
});

describe("reReviewPrompt", () => {
  it("asks whether earlier points were addressed once you've reviewed", () => {
    expect(reReviewPrompt(pr({ newCommits: 2 }))).toContain("whether your earlier points were addressed");
  });

  it("asks for a first review when the chat looked but never reviewed", () => {
    const prompt = reReviewPrompt(pr({ newComments: 1, reviewedByMe: false }));
    expect(prompt).toContain("/pr-review 8007");
    expect(prompt).not.toContain("earlier points");
  });

  it("asks to triage feedback on your own PR", () => {
    const prompt = reReviewPrompt(pr({ mine: true, reviewedByMe: false, newComments: 3 }));
    expect(prompt).toBe("PR #8007 has 3 new comments since you last looked. Go through the new feedback and tell me which points need changes.");
  });
});
