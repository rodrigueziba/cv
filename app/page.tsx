import Section1 from '@/app/components/Section1';
import DebugMenu from '@/app/components/DebugMenu';
import { SceneControlsProvider } from '@/app/lib/SceneControlsContext';

export default function Home() {
  return (
    <SceneControlsProvider>
      <main>
        <Section1 />
        <DebugMenu />
      </main>
    </SceneControlsProvider>
  );
}