import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// Filter/sort/page state lives in the URL so results are shareable and survive refresh.
export function useResultParams(listKeys = []) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const obj = Object.fromEntries(params.entries());
    for (const key of listKeys) obj[key] = obj[key] ? obj[key].split(',') : [];
    return obj;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch, { keepPage = false } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
            if (empty) next.delete(key);
            else next.set(key, Array.isArray(value) ? value.join(',') : String(value));
          }
          if (!keepPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [values, update];
}
