import DocumentEditor from './DocumentEditor';

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  return (
    <main style={{ width: '100dvw', height: '100dvh', minHeight: '100vh', overflow: 'hidden' }}>
      <DocumentEditor key={docId} docId={docId} />
    </main>
  );
}
