import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface Container {
  id: string;
  container_number: string;
  size_category: string;
  is_loaded: boolean;
  owner: string;
}

interface Zone {
  id: string;
  name: string;
}

export default function CraneTasks() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const { data: containersData } = await supabase
      .from('containers')
      .select('id, container_number, size_category, is_loaded, owner')
      .eq('status', 'awaiting');
    if (containersData) setContainers(containersData);
    const { data: zonesData } = await supabase.from('zones').select('id, name');
    if (zonesData) setZones(zonesData);
  };

  useEffect(() => {
    loadData();
  }, []);

  const placeContainer = async (containerId: string, zoneId: string) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('containers')
      .update({
        status: 'placed',
        placed_by: user?.id,
        placed_zone_id: zoneId,
        placed_at: new Date().toISOString(),
      })
      .eq('id', containerId);
    if (error) alert('Ошибка: ' + error.message);
    else {
      alert('Контейнер размещён');
      loadData();
    }
    setLoading(false);
  };

  return (
    <div>
      <h1>Размещение контейнеров</h1>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {containers.map(container => (
          <div key={container.id} className="card">
            <p><strong>Контейнер #{container.container_number}</strong></p>
            <p>Размер: {container.size_category}' | {container.is_loaded ? 'Груженый' : 'Порожний'} | Собственник: {container.owner}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {zones.map(zone => (
                <button key={zone.id} onClick={() => placeContainer(container.id, zone.id)} disabled={loading} className="btn-primary">
                  📦 Разместить в {zone.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {containers.length === 0 && <p>Нет контейнеров, ожидающих размещения</p>}
      </div>
    </div>
  );
}