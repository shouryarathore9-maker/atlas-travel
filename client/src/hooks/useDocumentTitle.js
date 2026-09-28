import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Atlas` : 'Atlas — Travel, thoughtfully';
  }, [title]);
}
