import { Whiteboard } from '@/components/Whiteboard';

export default function CanvasPage() {
  return (
    <main style={{ width: '100dvw', height: '100dvh', minHeight: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
      <Whiteboard />
    </main>
  );
}

