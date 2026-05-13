// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_BOT_TOKEN = '8739036271:AAEZXR5CXDB7kJo4ZiMJabQ8s94DvHTf6qw';
const SUPABASE_URL = 'https://uchithtrlvtawritbxrh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjaGl0aHRybHZ0YXdyaXRieHJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU4MzY3NiwiZXhwIjoyMDkxMTU5Njc2fQ.ZkV1Y7ZYX0GQ4XoZ-H2b7G5y4zH-N4wqfJ7zQ8Wn6Fc';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: dispatchers, error: dispError } = await supabase
      .from('profiles')
      .select('id, full_name, telegram_chat_id')
      .eq('role', 'dispatcher')
      .not('telegram_chat_id', 'is', null);
    if (dispError) throw dispError;

    const { data: lowStock, error: stockError } = await supabase
      .from('low_stock_alert')
      .select('*');
    if (stockError) throw stockError;

    if (!lowStock || lowStock.length === 0) {
      return new Response(JSON.stringify({ message: 'No low stock items' }), { status: 200, headers: corsHeaders });
    }

    const message = `⚠️ *ВНИМАНИЕ: заканчиваются товары на складах!*\n\n${lowStock.map(item => 
      `🏭 *${item.warehouse_name}*\n📦 ${item.product_name}: осталось *${item.quantity}* шт.\n`
    ).join('\n')}\n_Пожалуйста, пополните запасы._`;

    let sentCount = 0;
    for (const dispatcher of dispatchers) {
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: dispatcher.telegram_chat_id,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
      const result = await response.json();
      if (result.ok) sentCount++;
      else console.error(`Failed to send to ${dispatcher.full_name}:`, result);
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
