import { Metadata } from 'next';
import BothWorkspace from './BothWorkspace';

export const metadata: Metadata = {
  title: "Workspace | DiagramKit - Real-time Collaborative Hub",
  description: "Access your collaborative workspace to create diagrams, flowcharts, and system designs in real-time with your team.",
};

export default function BothPage() {
  return (
    <main style={{ width: '100dvw', height: '100dvh', minHeight: '100vh', overflow: 'hidden' }}>
      <BothWorkspace />
    </main>
  );
}

