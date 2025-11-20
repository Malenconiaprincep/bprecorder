import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // RLS will automatically filter records for the logged-in user
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('Supabase fetch error:', error);
      throw error;
    }

    return NextResponse.json((data || []).reverse());
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { systolic, diastolic, pulse, recorded_at } = body;

    if (!systolic || !diastolic || !pulse) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('records')
      .insert([
        {
          systolic,
          diastolic,
          pulse,
          recorded_at: recorded_at || new Date().toISOString(),
          user_id: user.id
        }
      ])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error saving record:', error);
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 });
  }
}
