/**
 * HashrateChart component - Interactive line chart using ECharts
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SvgChart, SVGRenderer } from '@wuba/react-native-echarts';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
} from 'echarts/components';

import { ChartSkeleton } from './ChartSkeleton';
import { colors } from '@/constants/colors';
import { formatHashrate } from '@/utils/formatting';
import type { PoolHistoricalPoint, HistoricalPeriod } from '@/types';

// Register ECharts components
echarts.use([
  SVGRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
]);

export interface HashrateChartProps {
  data: PoolHistoricalPoint[];
  period: HistoricalPeriod;
  isLoading?: boolean;
  height?: number;
  onDataPointSelect?: (point: PoolHistoricalPoint | null) => void;
  className?: string;
}

/**
 * Get appropriate hashrate field based on period
 */
function getHashrateField(period: HistoricalPeriod): keyof PoolHistoricalPoint {
  switch (period) {
    case '1h':
      return 'hashrate15m';
    case '24h':
      return 'hashrate1hr';
    case '7d':
      return 'hashrate6hr';
    case '30d':
      return 'hashrate1d';
    default:
      return 'hashrate15m';
  }
}

/**
 * Format X-axis label based on period
 */
function formatXAxisLabel(timestamp: number, period: HistoricalPeriod): string {
  const date = new Date(timestamp);

  switch (period) {
    case '1h':
    case '24h':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case '7d':
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    case '30d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    default:
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
}

export function HashrateChart({
  data,
  period,
  isLoading = false,
  height = 200,
  onDataPointSelect,
  className = '',
}: HashrateChartProps) {
  const chartRef = useRef<typeof SvgChart>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height });

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const hashrateField = getHashrateField(period);
    return data.map((point) => [
      point.timestamp * 1000,
      point[hashrateField] as number,
    ]);
  }, [data, period]);

  // Generate chart options
  const option = useMemo(() => {
    if (chartData.length === 0) return null;

    return {
      backgroundColor: 'transparent',
      grid: {
        left: 55,
        right: 15,
        top: 15,
        bottom: 25,
        containLabel: false,
      },
      xAxis: {
        type: 'time' as const,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: colors.textMuted,
          fontSize: 10,
          formatter: (value: number) => formatXAxisLabel(value, period),
        },
        splitLine: {
          show: false,
        },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: colors.textMuted,
          fontSize: 10,
          formatter: (value: number) => formatHashrate(value),
        },
        splitLine: {
          lineStyle: {
            color: colors.chartGrid,
            type: 'dashed' as const,
          },
        },
      },
      series: [
        {
          type: 'line' as const,
          data: chartData,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: colors.chartLine,
            width: 2,
          },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(237, 237, 237, 0.2)' },
                { offset: 1, color: 'rgba(237, 237, 237, 0)' },
              ],
            },
          },
        },
      ],
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: colors.chartTooltipBg,
        borderColor: colors.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: colors.text,
          fontSize: 12,
        },
        formatter: (params: { value: [number, number] }[]) => {
          if (!params || params.length === 0) return '';
          const [timestamp, value] = params[0].value;
          const date = new Date(timestamp);
          const timeStr = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return `${timeStr}<br/><strong>${formatHashrate(value)}</strong>`;
        },
        axisPointer: {
          type: 'line' as const,
          lineStyle: {
            color: colors.chartLineSecondary,
            type: 'dashed' as const,
          },
        },
      },
    };
  }, [chartData, period]);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current || !option) return;

    // @ts-expect-error - accessing ref for echarts init
    const chart = echarts.init(chartRef.current, 'dark', {
      renderer: 'svg',
      width: dimensions.width,
      height: dimensions.height,
    });

    chartInstanceRef.current = chart;
    chart.setOption(option);

    // Handle click events
    if (onDataPointSelect) {
      chart.on('click', (params: { dataIndex?: number }) => {
        if (params.dataIndex !== undefined && data[params.dataIndex]) {
          onDataPointSelect(data[params.dataIndex]);
        }
      });
    }

    return () => {
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [option, dimensions, onDataPointSelect, data]);

  // Update chart on resize
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.resize({
        width: dimensions.width,
        height: dimensions.height,
      });
    }
  }, [dimensions]);

  // Show skeleton when loading with no data
  if (isLoading && (!data || data.length === 0)) {
    return <ChartSkeleton height={height} className={className} />;
  }

  // Show empty state if no data
  if (!data || data.length === 0) {
    return (
      <View
        className={`bg-secondary rounded-xl items-center justify-center ${className}`}
        style={{ height }}
      />
    );
  }

  return (
    <View
      className={`bg-secondary rounded-xl overflow-hidden ${className}`}
      style={{ height }}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      }}
    >
      <SvgChart ref={chartRef} />
    </View>
  );
}
