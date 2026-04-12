// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Обработка CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Получаем параметры из запроса
    const { action, orderId, orderType } = await req.json();
    console.log('📥 Received:', { action, orderId, orderType });

    if (action !== 'autoAssign') {
      throw new Error('Invalid action');
    }
    if (!orderId || !orderType) {
      throw new Error('Missing orderId or orderType');
    }

    // Инициализируем Supabase клиент с переменными окружения
    const supabaseUrl = 'https://uchithtrlvtawritbxrh.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjaGl0aHRybHZ0YXdyaXRieHJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODM2NzYsImV4cCI6MjA5MTE1OTY3Nn0.60QUNH2WH8X3fGqe3bBhAQgWZHQaMpoASXrj9LHL110';

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing env vars:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
      throw new Error('Supabase credentials not set');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔌 Supabase client created');

    // Проверяем, существует ли заказ
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, weight_kg, fragile, from_address, to_address')
      .eq('id', orderId)
      .single();
    
    if (orderError || !order) {
      console.error('❌ Order not found:', orderId, orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found', details: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('✅ Order found:', order.id);

    // Определяем роль исполнителя
    const role = orderType === 'courier' ? 'courier' : 'collector';
    const { data: workers, error: workersError } = await supabase
      .from('profiles')
      .select('id, full_name, rating, current_load, last_assigned_at')
      .eq('role', role)
      .order('rating', { ascending: false });
    
    if (workersError || !workers || workers.length === 0) {
      console.error(`❌ No ${role}s available:`, workersError);
      return new Response(
        JSON.stringify({ error: `No ${role}s available` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log(`📋 Available ${role}s:`, workers.map(w => w.id));

    // Выбор лучшего исполнителя (сначала пробуем AI, если ключ есть)
    let workerId = workers[0].id;
    const deepseekKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (deepseekKey) {
      const prompt = `Заказ: ${order.id}, вес ${order.weight_kg}кг, хрупкий: ${order.fragile}\nДоступные ${role}:\n${workers.map(w => `ID: ${w.id}, рейтинг ${w.rating || 5}, загрузка ${w.current_load || 0}, последнее назначение ${w.last_assigned_at || 'никогда'}`).join('\n')}\nНазначь лучшего. Ответь JSON: {"worker_id": "uuid"}`;
      try {
        const aiResponse = await callDeepSeek(prompt, deepseekKey);
        const parsed = JSON.parse(aiResponse);
        if (workers.some(w => w.id === parsed.worker_id)) {
          workerId = parsed.worker_id;
          console.log('🤖 AI selected:', workerId);
        } else {
          console.warn('⚠️ AI returned invalid ID, using fallback');
        }
      } catch (e) {
        console.error('❌ AI error, using fallback:', e);
      }
    } else {
      console.log('ℹ️ No DeepSeek API key, using fallback (highest rating)');
    }

    // Назначение
    let assignError = null;
    if (orderType === 'courier') {
      const { error } = await supabase
        .from('orders')
        .update({ courier_id: workerId, status: 'accepted' })
        .eq('id', orderId);
      assignError = error;
    } else {
      const { error } = await supabase
        .from('picking_tasks')
        .insert({ order_id: orderId, collector_id: workerId, status: 'pending' });
      assignError = error;
    }
    if (assignError) {
      console.error('❌ Assignment error:', assignError);
      throw new Error(assignError.message);
    }
    console.log('✅ Assignment successful');

    // Обновляем статистику
    await supabase.rpc('increment_load', { worker_id: workerId });
    await supabase
      .from('profiles')
      .update({ last_assigned_at: new Date().toISOString() })
      .eq('id', workerId);

    return new Response(
      JSON.stringify({ success: true, worker_id: workerId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('🔥 Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function callDeepSeek(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}