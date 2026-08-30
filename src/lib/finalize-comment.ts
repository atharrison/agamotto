export enum FinalizeBannerTone {
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export type FinalizeBanner = {
  tone: FinalizeBannerTone
  message: string
  copyBody?: string
}

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
      message: `Review saved, but posting to GitHub failed — ${failReason}. You can copy the comment manually.`,
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

  return {
    tone: FinalizeBannerTone.SUCCESS,
    message: `Submitted: ${opts.accepted ?? 0} accepted, ${opts.rejected ?? 0} rejected`,
    copyBody: opts.postComment ? copyBody : undefined,
  }
}
