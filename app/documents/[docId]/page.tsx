import DocumentEditor from './DocumentEditor';

export default function DocumentPage({ params }: { params: { docId: string } }) {
  const { docId } = params;
  return (
    <main style={{ width: '100dvw', height: '100dvh', minHeight: '100vh', overflow: 'hidden' }}>
      <DocumentEditor key={docId} docId={docId} />
    </main>
  );
}
