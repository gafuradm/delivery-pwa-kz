import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function LowStockAlert() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data } = await supabase.from('low_stock_alert').select('*');
      if (data) setAlerts(data);
    };
    fetchAlerts();
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="card" style={{ background: '#fee2e2', marginBottom: 20 }}>
      <h3>⚠️ Внимание: заканчиваются товары</h3>
      {alerts.map(alert => (
        <div key={alert.qr_code} style={{ marginBottom: 5 }}>
          📦 {alert.warehouse_name} – {alert.product_name}: осталось {alert.quantity} шт.
        </div>
      ))}
    </div>
  );
}