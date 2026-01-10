/**
 * FullScreenChart component - Full-screen modal for pool hashrate chart
 */

import { FullScreenChartModal } from './FullScreenChartModal';
import { HashrateChart } from './HashrateChart';
import type { PoolHistoricalPoint, HistoricalPeriod } from '@/types';

export interface FullScreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: PoolHistoricalPoint[];
  currentHashrate?: number;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoading?: boolean;
}

export function FullScreenChart(props: FullScreenChartProps) {
  return (
    <FullScreenChartModal
      {...props}
      title="Pool Hashrate"
      renderChart={({ data, height }) => (
        <HashrateChart
          data={data}
          period={props.period}
          isLoading={props.isLoading}
          height={height}
          className="flex-1"
        />
      )}
    />
  );
}
