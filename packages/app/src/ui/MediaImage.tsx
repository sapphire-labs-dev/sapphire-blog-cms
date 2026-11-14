import { useEffect, useState, type ImgHTMLAttributes } from 'react';

import { useCms } from './context';

/** Shows a site image, fetching it from the repository if it is not published yet. */
export function MediaImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const { media } = useCms();
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let active = true;

    void media.resolve(src).then((resolved) => active && setUrl(resolved));

    return () => {
      active = false;
    };
  }, [src, media]);

  return url ? <img src={url} loading="lazy" {...props} /> : null;
}
