/**
 * UserFullScreenChart component - Full-screen modal for user hashrate chart
 */

import { FullScreenChartModal } from './FullScreenChartModal';
import { UserHashrateChart } from './UserHashrateChart';
import type { UserHistoricalPoint, HistoricalPeriod } from '@/types';

export interface UserFullScreenChartProps {
  visible: boolean;
  onClose: () => void;
  data: UserHistoricalPoint[];
  currentHashrate?: number;
  period: HistoricalPeriod;
  onPeriodChange: (period: HistoricalPeriod) => void;
  isLoading?: boolean;
}

export function UserFullScreenChart(props: UserFullScreenChartProps) {
  return (
    <FullScreenChartModal
      {...props}
      title="Your Hashrate"
      renderChart={({ data, height }) => (
        <UserHashrateChart
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
