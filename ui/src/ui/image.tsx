import * as React from 'react';

import { cn } from '../lib/utils';

type ImageProps = React.ComponentPropsWithoutRef<'img'>;

export const Image = ({ className, alt, ...props }: ImageProps) => (
  <img
    className={cn('block h-full w-full object-cover', className)}
    alt={alt ?? ''}
    {...props}
  />
);
