/**
 * UserHashrateChart component - Interactive line chart for user hashrate using ECharts
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChartSkeleton } from './ChartSkeleton';
import { formatXAxisLabel } from './chart-utils';
import { initEcharts, getEcharts, getSvgChart, isEchartsReady } from './echarts-init';
import { colors } from '@/constants/colors';
import { formatHashrate } from '@/utils/formatting';
import { useTranslation } from '@/i18n';
import type { UserHistoricalPoint, HistoricalPeriod } from '@/types';

export interface UserHashrateChartProps {
  data: UserHistoricalPoint[];
  period: HistoricalPeriod;
  isLoading?: boolean;
  height?: number;
  onDataPointSelect?: (point: UserHistoricalPoint | null) => void;
  className?: string;
  /**
   * 'embedded' = minimal in-card sparkline (white stroke + gradient, no axes,
   * transparent square container). 'default' = full interactive chart.
   */
  variant?: 'default' | 'embedded';
}

/**
 * Downsample data to a maximum number of points for performance
 * Uses LTTB (Largest Triangle Three Buckets) simplified approach
 */
function downsampleData(data: UserHistoricalPoint[], maxPoints: number): UserHistoricalPoint[] {
  if (data.length <= maxPoints) return data;

  const result: UserHistoricalPoint[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  // Always keep first point
  result.push(data[0]);

  // Sample middle points
  for (let i = 1; i < maxPoints - 1; i++) {
    const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length - 1);

    // Pick the point with max hashrate in each bucket (preserves peaks)
    let maxPoint = data[bucketStart];
    for (let j = bucketStart + 1; j < bucketEnd; j++) {
      if (data[j].hashrate > maxPoint.hashrate) {
        maxPoint = data[j];
      }
    }
    result.push(maxPoint);
  }

  // Always keep last point
  result.push(data[data.length - 1]);

  return result;
}

// Maximum data points to render (for performance)
const MAX_CHART_POINTS = 200;

interface TooltipParam {
  value?: [number, number];
}

export function UserHashrateChart({
  data,
  period,
  isLoading = false,
  height = 200,
  onDataPointSelect,
  className = '',
  variant = 'default',
}: UserHashrateChartProps) {
  const { t } = useTranslation();
  const embedded = variant === 'embedded';
  const chartRef = useRef<unknown>(null);
  const chartInstanceRef = useRef<ReturnType<typeof import('echarts/core').init> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height });
  const [isReady, setIsReady] = useState(isEchartsReady);

  // Initialize ECharts lazily
  useEffect(() => {
    if (!isReady) {
      initEcharts().then(() => setIsReady(true));
    }
  }, [isReady]);

  // Calculate chart data - simplified for user data (single hashrate field)
  // Note: User timestamps are already in milliseconds (converted from ISO string)
  // Downsample if too many points to prevent performance issues
  const sampledData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return downsampleData(data, MAX_CHART_POINTS);
  }, [data]);

  const chartData = useMemo(() => {
    return sampledData.map((point) => [point.timestamp, point.hashrate]);
  }, [sampledData]);

  const hashrateSeriesName = t('home.hashrate');

  // Generate chart options
  const option = useMemo(() => {
    if (chartData.length === 0) return null;

    return {
      backgroundColor: 'transparent',
      grid: embedded
        ? { left: 0, right: 0, top: 6, bottom: 6, containLabel: false }
        : {
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
          show: !embedded,
          color: colors.textMuted,
          fontSize: 10,
          hideOverlap: true,
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
          show: !embedded,
          color: colors.textMuted,
          fontSize: 10,
          formatter: (value: number) => formatHashrate(value),
        },
        splitLine: {
          show: !embedded,
          lineStyle: {
            color: colors.chartGrid,
            type: 'dashed' as const,
          },
        },
      },
      series: [
        {
          name: hashrateSeriesName,
          type: 'line' as const,
          yAxisIndex: 0,
          data: chartData,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color: colors.chartLine,
            width: 1.6,
          },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255, 255, 255, 0.14)' },
                { offset: 1, color: 'rgba(255, 255, 255, 0)' },
              ],
            },
          },
        },
      ],
      tooltip: {
        show: !embedded,
        trigger: 'axis' as const,
        backgroundColor: colors.chartTooltipBg,
        borderColor: colors.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: colors.text,
          fontSize: 12,
        },
        formatter: (params: TooltipParam[]) => {
          if (!params || params.length === 0) return '';
          const firstValue = params.find((param) => param.value)?.value;
          if (!firstValue) return '';
          const [timestamp] = firstValue;
          const date = new Date(timestamp);
          const timeStr = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          const lines = [timeStr];
          for (const param of params) {
            if (!param.value) continue;
            lines.push(`${hashrateSeriesName}: ${formatHashrate(param.value[1])}`);
          }
          return lines.join('\n');
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
  }, [chartData, period, embedded, hashrateSeriesName]);

  // Keep option ref in sync for use in chart creation effect
  const optionRef = useRef(option);
  optionRef.current = option;

  // Initialize chart instance ONCE (only when echarts is ready and we have dimensions)
  useEffect(() => {
    const echarts = getEcharts();
    if (!chartRef.current || !isReady || !echarts) return;

    // Don't create if we already have an instance
    if (chartInstanceRef.current) return;

    const chart = echarts.init(chartRef.current as HTMLElement, 'dark', {
      renderer: 'svg',
      width: dimensions.width,
      height: dimensions.height,
    });

    chartInstanceRef.current = chart;

    // Apply current options from ref (fixes race condition where chart is
    // created but option update effect doesn't run because option unchanged)
    if (optionRef.current) {
      chart.setOption(optionRef.current, true);
    }

    // Cleanup only on unmount
    return () => {
      chart.dispose();
      chartInstanceRef.current = null;
    };
  }, [isReady, dimensions.width, dimensions.height]);

  // Update chart options when data changes (don't recreate the chart)
  useEffect(() => {
    if (!chartInstanceRef.current || !option) return;
    chartInstanceRef.current.setOption(option, true); // true = replace all options
  }, [option]);

  // Handle click events separately
  useEffect(() => {
    const chart = chartInstanceRef.current;
    if (!chart || !onDataPointSelect) return;

    const handleClick = (params: { dataIndex?: number; seriesIndex?: number }) => {
      if (
        params.seriesIndex === 0 &&
        params.dataIndex !== undefined &&
        sampledData[params.dataIndex]
      ) {
        onDataPointSelect?.(sampledData[params.dataIndex]);
      }
    };

    chart.on('click', handleClick);
    return () => {
      chart.off('click', handleClick);
    };
  }, [onDataPointSelect, sampledData]);

  // Update chart on resize
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.resize({
        width: dimensions.width,
        height: dimensions.height,
      });
    }
  }, [dimensions.width, dimensions.height]);

  // Show skeleton when loading or echarts not ready
  if (!isReady || (isLoading && (!data || data.length === 0))) {
    return <ChartSkeleton height={height} className={className} />;
  }

  // Show empty state if no data
  if (!data || data.length === 0) {
    return (
      <View
        className={`${embedded ? '' : 'bg-secondary'} items-center justify-center ${className}`}
        style={{ height }}
      />
    );
  }

  // SvgChart should be loaded by now
  const ChartComponent = getSvgChart();
  if (!ChartComponent) {
    return <ChartSkeleton height={height} className={className} />;
  }

  return (
    <View
      className={`${embedded ? '' : 'bg-secondary'} overflow-hidden ${className}`}
      style={{ height }}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w > 0 && h > 0) {
          setDimensions({ width: w, height: h });
        }
      }}
    >
      <ChartComponent ref={chartRef as React.Ref<unknown>} />
    </View>
  );
}
