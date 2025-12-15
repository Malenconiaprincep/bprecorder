import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface ImportRecord {
  date: string;        // 日期 YYYY-MM-DD
  time?: string;       // 时间 HH:mm (可选，默认 00:00)
  systolic: number;    // 收缩压
  diastolic: number;   // 舒张压
  pulse: number;       // 脉搏
  hand?: string;       // 左右手 (可选)
  note?: string;       // 备注 (可选)
}

// 解析 CSV 文本
function parseCSV(csvText: string): ImportRecord[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV 文件至少需要包含标题行和一行数据');
  }

  // 解析标题行，支持多种格式
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map(h => h.trim());

  // 标题映射（支持中英文）
  const headerMap: Record<string, string> = {
    '日期': 'date',
    'date': 'date',
    '时间': 'time',
    'time': 'time',
    '收缩压': 'systolic',
    '高压': 'systolic',
    'systolic': 'systolic',
    'sys': 'systolic',
    '舒张压': 'diastolic',
    '低压': 'diastolic',
    'diastolic': 'diastolic',
    'dia': 'diastolic',
    '脉搏': 'pulse',
    '心率': 'pulse',
    'pulse': 'pulse',
    'heart_rate': 'pulse',
    'hr': 'pulse',
    '左右手': 'hand',
    '手': 'hand',
    'hand': 'hand',
    '备注': 'note',
    'note': 'note',
    'notes': 'note',
    'memo': 'note',
  };

  // 建立列索引映射
  const columnMap: Record<string, number> = {};
  headers.forEach((header, index) => {
    const mappedName = headerMap[header];
    if (mappedName) {
      columnMap[mappedName] = index;
    }
  });

  // 检查必需列
  if (columnMap.date === undefined) {
    throw new Error('CSV 缺少日期列（date/日期）');
  }
  if (columnMap.systolic === undefined) {
    throw new Error('CSV 缺少收缩压列（systolic/收缩压/高压）');
  }
  if (columnMap.diastolic === undefined) {
    throw new Error('CSV 缺少舒张压列（diastolic/舒张压/低压）');
  }
  if (columnMap.pulse === undefined) {
    throw new Error('CSV 缺少脉搏列（pulse/脉搏/心率）');
  }

  const records: ImportRecord[] = [];

  // 解析数据行
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 跳过空行

    const values = parseCSVLine(line);

    try {
      const record: ImportRecord = {
        date: values[columnMap.date]?.trim() || '',
        time: columnMap.time !== undefined ? values[columnMap.time]?.trim() : undefined,
        systolic: parseInt(values[columnMap.systolic], 10),
        diastolic: parseInt(values[columnMap.diastolic], 10),
        pulse: parseInt(values[columnMap.pulse], 10),
        hand: columnMap.hand !== undefined ? values[columnMap.hand]?.trim() : undefined,
        note: columnMap.note !== undefined ? values[columnMap.note]?.trim() : undefined,
      };

      // 验证数据
      if (!record.date) {
        throw new Error(`第 ${i + 1} 行：日期不能为空`);
      }
      if (isNaN(record.systolic) || record.systolic < 50 || record.systolic > 300) {
        throw new Error(`第 ${i + 1} 行：收缩压无效 (${values[columnMap.systolic]})`);
      }
      if (isNaN(record.diastolic) || record.diastolic < 30 || record.diastolic > 200) {
        throw new Error(`第 ${i + 1} 行：舒张压无效 (${values[columnMap.diastolic]})`);
      }
      if (isNaN(record.pulse) || record.pulse < 30 || record.pulse > 250) {
        throw new Error(`第 ${i + 1} 行：脉搏无效 (${values[columnMap.pulse]})`);
      }

      records.push(record);
    } catch (error: any) {
      throw new Error(error.message || `解析第 ${i + 1} 行时出错`);
    }
  }

  return records;
}

// 解析单行 CSV（处理引号内的逗号）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// 标准化左右手值
function normalizeHand(hand?: string): 'left' | 'right' | undefined {
  if (!hand) return undefined;
  const normalized = hand.toLowerCase().trim();
  if (normalized === 'left' || normalized === '左' || normalized === '左手') {
    return 'left';
  }
  if (normalized === 'right' || normalized === '右' || normalized === '右手') {
    return 'right';
  }
  return undefined;
}

// 解析日期时间
function parseDateTime(date: string, time?: string): string {
  // 尝试多种日期格式
  let dateStr = date.trim();

  // 处理 YYYY/MM/DD 或 YYYY-MM-DD
  dateStr = dateStr.replace(/\//g, '-');

  // 处理 DD-MM-YYYY 或 MM-DD-YYYY（如果年份在最后）
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    // 如果第一部分长度是4，则是 YYYY-MM-DD
    if (parts[0].length === 4) {
      dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY 或 MM-DD-YYYY
      // 假设是 DD-MM-YYYY（更常见）
      dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  // 时间默认为中午12点
  const timeStr = time?.trim() || '12:00';

  // 构建 ISO 格式
  const isoString = `${dateStr}T${timeStr}:00`;

  // 验证日期是否有效
  const testDate = new Date(isoString);
  if (isNaN(testDate.getTime())) {
    throw new Error(`无法解析日期: ${date} ${time || ''}`);
  }

  return testDate.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 获取 openid (通过 header 传递)
    const openid = req.headers.get('x-openid');
    if (!openid) {
      return NextResponse.json({ error: '缺少用户标识' }, { status: 401 });
    }

    const body = await req.json();
    const { csv } = body;

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: '缺少 CSV 数据' }, { status: 400 });
    }

    // 解析 CSV
    let importRecords: ImportRecord[];
    try {
      importRecords = parseCSV(csv);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (importRecords.length === 0) {
      return NextResponse.json({ error: 'CSV 中没有有效数据' }, { status: 400 });
    }

    // 转换为数据库格式
    const dbRecords = importRecords.map(record => ({
      user_id: openid,
      systolic: record.systolic,
      diastolic: record.diastolic,
      pulse: record.pulse,
      hand: normalizeHand(record.hand),
      note: record.note || null,
      recorded_at: parseDateTime(record.date, record.time),
    }));

    // 批量插入
    const { data, error } = await supabase
      .from('bp_records')
      .insert(dbRecords)
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: '导入失败: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imported: data?.length || 0,
      message: `成功导入 ${data?.length || 0} 条记录`
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message || '导入失败' }, { status: 500 });
  }
}

