'use client';

import NextError from 'next/error';
import { useEffect } from 'react';
import { getPostHogClient } from '../lib/posthog';
import { redactError } from '../lib/posthog-redact';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    getPostHogClient()?.captureException(redactError(error), { digest: error.digest });
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
