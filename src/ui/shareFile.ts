export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Offers a file to the Android share sheet (WhatsApp, email, Drive) with the Web Share API, or
 * downloads it where sharing that file is not supported (AGENT.md section 4).
 */
export async function shareOrDownload(file: File): Promise<ShareOutcome> {
  if ('canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Any other refusal falls back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
