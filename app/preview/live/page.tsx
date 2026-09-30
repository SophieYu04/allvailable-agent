import { notFound } from 'next/navigation';

/** Development-only responsive harness. The iframe runs the actual authenticated app. */
export default function LiveViewportPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <main style={{ padding: 24, background: '#eceee9', minHeight: '100vh' }}>
    <h1 style={{ fontSize: 20 }}>Allvailable · live app at 390px</h1>
    <p>This is the real app, including sign-in and live AI. It is not the synthetic preview.</p>
    <iframe title="Allvailable live mobile viewport" src="/" width={390} height={844} style={{ display: 'block', boxSizing: 'content-box', maxWidth: '100%', border: '1px solid #cdd5ce', borderRadius: 16, background: '#fff' }} />
  </main>;
}
