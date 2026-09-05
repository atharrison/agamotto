export enum FinalizeBannerTone {
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export type FinalizeBanner = {
  tone: FinalizeBannerTone
  message: string
  copyBody?: string
  /** Raw GitHub / skip reason — shown on hover, not in the banner body. */
  detail?: string
}

export const GITHUB_POST_FAILED_MESSAGE =
  'Review saved, but posting to GitHub failed. Copy the comment and paste it on the PR.'

export function commentMarkdownFromResult(
  comment: unknown
): string | undefined {
  if (!comment || typeof comment !== 'object') return undefined
  const body = (comment as { body?: unknown }).body
  return typeof body === 'string' && body.length > 0 ? body : undefined
}

export function githubPostFailedReason(comment: unknown): string | undefined {
  if (!comment || typeof comment !== 'object') return undefined
  const rec = comment as {
    error?: unknown
    skipped?: unknown
    reason?: unknown
  }
  if (typeof rec.error === 'string' && rec.error.length > 0) return rec.error
  if (rec.skipped === true) {
    return typeof rec.reason === 'string' && rec.reason.length > 0
      ? rec.reason
      : 'GitHub post was skipped'
  }
  return undefined
}

export function buildFinalizeBanner(opts: {
  httpOk: boolean
  httpError?: string
  approve: boolean
  postComment: boolean
  comment: unknown
  accepted?: number
  rejected?: number
}): FinalizeBanner {
  if (!opts.httpOk) {
    return {
      tone: FinalizeBannerTone.ERROR,
      message: `Error: ${opts.httpError ?? 'unexpected server response'}`,
    }
  }

  const copyBody = commentMarkdownFromResult(opts.comment)
  const failReason = githubPostFailedReason(opts.comment)
  if (failReason) {
    return {
      tone: FinalizeBannerTone.WARNING,
      message: GITHUB_POST_FAILED_MESSAGE,
      detail: failReason,
      copyBody,
    }
  }

  if (opts.approve) {
    return {
      tone: FinalizeBannerTone.SUCCESS,
      message: opts.postComment
        ? '✓ Approved — LGTM comment posted to GitHub'
        : '✓ Marked as approved',
      copyBody: opts.postComment ? copyBody : undefined,
    }
  }

  const accepted = opts.accepted ?? 0
  const rejected = opts.rejected ?? 0
  return {
    tone: FinalizeBannerTone.SUCCESS,
    message: opts.postComment
      ? `Submitted: ${accepted} accepted, ${rejected} rejected`
      : `Saved: ${accepted} included, ${rejected} excluded`,
    copyBody: opts.postComment ? copyBody : undefined,
  }
}
