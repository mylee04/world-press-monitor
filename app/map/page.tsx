import { Suspense } from 'react';
import { MapView } from '@/components/map-view';

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapView />
    </Suspense>
  );
}
