import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  threshold?: number
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  threshold = 100
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const setLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return

    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    if (node && hasMore) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore && !loading) {
            onLoadMore()
          }
        },
        {
          rootMargin: `${threshold}px`
        }
      )
      observerRef.current.observe(node)
    }

    loadMoreRef.current = node
  }, [hasMore, loading, onLoadMore, threshold])

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  return { setLoadMoreRef }
}