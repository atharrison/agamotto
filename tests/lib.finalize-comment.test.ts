/**
 * ATH-42 — map the finalize `comment` payload into banner copy + clipboard body.
 */

import {
  FinalizeBannerTone,
  GITHUB_POST_FAILED_MESSAGE,
  buildFinalizeBanner,
  commentMarkdownFromResult,
  githubCommentPosted,
  githubPostFailedReason,
} from '../src/lib/finalize-comment'

describe('commentMarkdownFromResult', () => {
  it('returns a non-empty body string', () => {
    expect(commentMarkdownFromResult({ body: '## Review\n' })).toBe(
      '## Review\n'
    )
  })

  it('returns undefined for missing or empty bodies', () => {
    expect(commentMarkdownFromResult(null)).toBeUndefined()
    expect(commentMarkdownFromResult({ error: 'nope' })).toBeUndefined()
    expect(commentMarkdownFromResult({ body: '' })).toBeUndefined()
    expect(commentMarkdownFromResult({ body: 1 })).toBeUndefined()
  })
})

describe('githubPostFailedReason', () => {
  it('prefers comment.error', () => {
    expect(
      githubPostFailedReason({
        error: 'GitHub session expired — sign in again',
      })
    ).toBe('GitHub session expired — sign in again')
  })

  it('uses skipped.reason when the post was skipped', () => {
    expect(
      githubPostFailedReason({
        skipped: true,
        reason: 'GITHUB_TOKEN not configured',
      })
    ).toBe('GITHUB_TOKEN not configured')
    expect(githubPostFailedReason({ skipped: true })).toBe(
      'GitHub post was skipped'
    )
    expect(githubPostFailedReason({ skipped: true, reason: '' })).toBe(
      'GitHub post was skipped'
    )
  })

  it('returns undefined for a successful post', () => {
    expect(
      githubPostFailedReason({ id: 1, url: 'https://github.com/x', body: 'ok' })
    ).toBeUndefined()
    expect(githubPostFailedReason(null)).toBeUndefined()
    expect(githubPostFailedReason({ error: '' })).toBeUndefined()
  })
})

describe('githubCommentPosted', () => {
  it('is false when the caller did not ask to post', () => {
    expect(
      githubCommentPosted(false, { id: 1, url: 'https://github.com/c/1' })
    ).toBe(false)
  })

  it('is true when GitHub returned a comment id or url', () => {
    expect(
      githubCommentPosted(true, { id: 99, url: 'https://github.com/c/99' })
    ).toBe(true)
    expect(githubCommentPosted(true, { url: 'https://github.com/c/99' })).toBe(
      true
    )
  })

  it('is true for DRY_RUN', () => {
    expect(githubCommentPosted(true, { dryRun: true, body: 'LGTM!' })).toBe(
      true
    )
  })

  it('is false when the post failed, was skipped, or the payload is empty', () => {
    expect(githubCommentPosted(true, { error: 'session expired' })).toBe(false)
    expect(
      githubCommentPosted(true, { skipped: true, reason: 'no token' })
    ).toBe(false)
    expect(githubCommentPosted(true, null)).toBe(false)
    expect(githubCommentPosted(true, {})).toBe(false)
  })
})

describe('buildFinalizeBanner', () => {
  it('returns an ERROR banner when HTTP failed', () => {
    expect(
      buildFinalizeBanner({
        httpOk: false,
        httpError: 'Review not found or not yet complete.',
        approve: false,
        postComment: true,
        comment: null,
      })
    ).toEqual({
      tone: FinalizeBannerTone.ERROR,
      message: 'Error: Review not found or not yet complete.',
    })
  })

  it('uses a fallback message when HTTP failed with no error string', () => {
    expect(
      buildFinalizeBanner({
        httpOk: false,
        approve: false,
        postComment: true,
        comment: null,
      }).message
    ).toBe('Error: unexpected server response')
  })

  it('warns and offers copy when GitHub post failed but the review was saved', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: false,
        postComment: true,
        comment: {
          error: 'GitHub session expired — sign in again',
          body: '## Review\n',
        },
        accepted: 2,
        rejected: 1,
      })
    ).toEqual({
      tone: FinalizeBannerTone.WARNING,
      message: GITHUB_POST_FAILED_MESSAGE,
      detail: 'GitHub session expired — sign in again',
      copyBody: '## Review\n',
    })
  })

  it('warns when the post was skipped', () => {
    const banner = buildFinalizeBanner({
      httpOk: true,
      approve: true,
      postComment: true,
      comment: {
        skipped: true,
        reason: 'GITHUB_TOKEN not configured',
        body: 'LGTM!',
      },
    })
    expect(banner.tone).toBe(FinalizeBannerTone.WARNING)
    expect(banner.message).toBe(GITHUB_POST_FAILED_MESSAGE)
    expect(banner.detail).toBe('GITHUB_TOKEN not configured')
    expect(banner.copyBody).toBe('LGTM!')
  })

  it('puts HttpError text in detail, not the visible message', () => {
    const banner = buildFinalizeBanner({
      httpOk: true,
      approve: false,
      postComment: true,
      comment: {
        error:
          'HttpError: Resource not accessible by personal access token - https://docs.github.com/rest/issues/comments#create-an-issue-comment',
        body: '## Review\n',
      },
    })
    expect(banner.message).toBe(GITHUB_POST_FAILED_MESSAGE)
    expect(banner.message).not.toMatch(/HttpError|personal access token/)
    expect(banner.detail).toMatch(/personal access token/)
  })

  it('shows the approval success copy and comment body after a post', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: true,
        postComment: true,
        comment: { id: 7, url: 'https://github.com/c/7', body: 'LGTM!' },
      })
    ).toEqual({
      tone: FinalizeBannerTone.SUCCESS,
      message: '✓ Approved — LGTM comment posted to GitHub',
      copyBody: 'LGTM!',
    })
  })

  it('shows marked-as-approved when the user did not post', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: true,
        postComment: false,
        comment: null,
      })
    ).toEqual({
      tone: FinalizeBannerTone.SUCCESS,
      message: '✓ Marked as approved',
    })
  })

  it('shows the submit summary and comment body after a post', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: false,
        postComment: true,
        comment: { id: 9, url: 'https://github.com/c/9', body: '## Review\n' },
        accepted: 3,
        rejected: 1,
      })
    ).toEqual({
      tone: FinalizeBannerTone.SUCCESS,
      message: 'Submitted: 3 accepted, 1 rejected',
      copyBody: '## Review\n',
    })
  })

  it('shows included/excluded counts when saving without posting', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: false,
        postComment: false,
        comment: null,
        accepted: 2,
        rejected: 1,
      })
    ).toEqual({
      tone: FinalizeBannerTone.SUCCESS,
      message: 'Saved: 2 included, 1 excluded',
    })
  })

  it('defaults accepted/rejected to zero when summary counts are omitted', () => {
    expect(
      buildFinalizeBanner({
        httpOk: true,
        approve: false,
        postComment: false,
        comment: null,
      })
    ).toEqual({
      tone: FinalizeBannerTone.SUCCESS,
      message: 'Saved: 0 included, 0 excluded',
    })
  })
})
