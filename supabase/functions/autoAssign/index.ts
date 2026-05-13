// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('PROJECT_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, orderId, orderType } = await req.json();
    if (action !== 'autoAssign') throw new Error('Invalid action');
    if (!orderId || !orderType) throw new Error('Missing orderId or orderType');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Получаем заказ
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, weight_kg, fragile, from_address, to_address, requires_large_vehicle')
      .eq('id', orderId)
      .single();
    if (orderError || !order) {
      console.error('Order not found:', orderId);
      return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
    }

    // 2. Получаем исполнителей (курьеров или сборщиков) с учётом типа машины
    if (orderType === 'courier') {
      let query = supabase
        .from('profiles')
        .select('id, full_name, rating, current_load, last_assigned_at, vehicle_type')
        .eq('role', 'courier');
      
      // Фильтр по типу машины, если требуется большая
      if (order.requires_large_vehicle) {
        query = query.eq('vehicle_type', 'large');
      }
      
      const { data: couriers, error: workersError } = await query.order('rating', { ascending: false });
      if (workersError || !couriers || couriers.length === 0) {
        return new Response(JSON.stringify({ error: 'No suitable couriers available' }), { status: 404, headers: corsHeaders });
      }
      
      // AI выбор
      let workerId = couriers[0].id;
      if (DEEPSEEK_API_KEY) {
        const prompt = `Заказ: ${order.id}, вес ${order.weight_kg}кг, хрупкий: ${order.fragile}, требуется большегруз: ${order.requires_large_vehicle ? 'да' : 'нет'}\nДоступные курьеры:\n${couriers.map(w => `ID: ${w.id}, Имя: ${w.full_name}, Рейтинг: ${w.rating || 5}, Загрузка: ${w.current_load || 0}, Тип машины: ${w.vehicle_type}`).join('\n')}\nНазначь лучшего. Ответь JSON: {"worker_id": "uuid"}`;
        try {
          const aiResponse = await callDeepSeek(prompt, DEEPSEEK_API_KEY);
          const parsed = JSON.parse(aiResponse);
          if (couriers.some(w => w.id === parsed.worker_id)) workerId = parsed.worker_id;
        } catch (e) { console.error('AI error, using fallback'); }
      }
      
      // Назначение
      const { error } = await supabase
        .from('orders')
        .update({ courier_id: workerId, status: 'accepted' })
        .eq('id', orderId);
      if (error) throw new Error(error.message);
      
      // Обновляем статистику
      await supabase.rpc('increment_load', { worker_id: workerId });
      await supabase.from('profiles').update({ last_assigned_at: new Date().toISOString() }).eq('id', workerId);
      
      return new Response(JSON.stringify({ success: true, worker_id: workerId }), { status: 200, headers: corsHeaders });
      
    } else { // orderType === 'collector' – без изменений
      const { data: collectors, error: workersError } = await supabase
        .from('profiles')
        .select('id, full_name, rating, current_load, last_assigned_at')
        .eq('role', 'collector')
        .order('rating', { ascending: false });
      if (workersError || !collectors || collectors.length === 0) {
        return new Response(JSON.stringify({ error: 'No collectors available' }), { status: 404, headers: corsHeaders });
      }
      
      let workerId = collectors[0].id;
      if (DEEPSEEK_API_KEY) {
        const prompt = `Заказ: ${order.id}, вес ${order.weight_kg}кг, хрупкий: ${order.fragile}\nДоступные сборщики:\n${collectors.map(w => `ID: ${w.id}, Имя: ${w.full_name}, Рейтинг: ${w.rating || 5}, Загрузка: ${w.current_load || 0}`).join('\n')}\nНазначь лучшего. Ответь JSON: {"worker_id": "uuid"}`;
        try {
          const aiResponse = await callDeepSeek(prompt, DEEPSEEK_API_KEY);
          const parsed = JSON.parse(aiResponse);
          if (collectors.some(w => w.id === parsed.worker_id)) workerId = parsed.worker_id;
        } catch (e) { console.error('AI error, using fallback'); }
      }
      
      const { error } = await supabase
        .from('picking_tasks')
        .insert({ order_id: orderId, collector_id: workerId, status: 'pending' });
      if (error) throw new Error(error.message);
      
      await supabase.rpc('increment_load', { worker_id: workerId });
      await supabase.from('profiles').update({ last_assigned_at: new Date().toISOString() }).eq('id', workerId);
      
      return new Response(JSON.stringify({ success: true, worker_id: workerId }), { status: 200, headers: corsHeaders });
    }
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

async function callDeepSeek(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}