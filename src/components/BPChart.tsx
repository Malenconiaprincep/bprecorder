"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Record {
  id: number;
  systolic: number;
  diastolic: number;
  pulse: number;
  recorded_at: string;
}

interface BPChartProps {
  records: Record[];
}

export default function BPChart({ records }: BPChartProps) {
  const data = {
    labels: records.map(r => new Date(r.recorded_at).toLocaleDateString()),
    datasets: [
      {
        label: '收缩压 (高压)',
        data: records.map(r => r.systolic),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.3
      },
      {
        label: '舒张压 (低压)',
        data: records.map(r => r.diastolic),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        tension: 0.3
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '近期血压趋势',
      },
    },
    scales: {
        y: {
            min: 40,
            max: 200,
        }
    }
  };

  return <Line options={options} data={data} />;
}

