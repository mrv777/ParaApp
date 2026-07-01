/**
 * HashrateChart component - Interactive line chart using ECharts
 */

import { useRef, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChartSkeleton } from './ChartSkeleton';
import { formatXAxisLabel } from './chart-utils';
import { initEcharts, getEcharts, getSvgChart, isEchartsReady } from './echarts-init';
import { colors } from '@/constants/colors';
import { formatHashrate } from '@/utils/formatting';
import type { PoolHistoricalPoint, HistoricalPeriod } from '@/types';

export interface HashrateChartProps {
  data: PoolHistoricalPoint[];
  period: HistoricalPeriod;
  isLoading?: boolean;
  height?: number;
  onDataPointSelect?: (point: PoolHistoricalPoint | null) => void;
  className?: string;
  /**
   * 'default' = full interactive chart on its own dark surface (used in the
   * full-screen modal). 'card' = terminal/brutalist in-card style: transparent
   * background, 4 faint dashed gridlines, 4 compact y-axis labels (bare scaled
   * numbers, e.g. 180 / 120 / 60 / 0), white 1.6px line + gradient. No rounded
   * corners; the surrounding card provides the border/fill.
   */
  variant?: 'default' | 'card';
}

/**
 * Divisor that scales H/s into the same unit `formatHashrate` would pick for
 * `maxValue` (e.g. 1e15 for PH/s). Lets the y-axis render bare numbers that
 * share the unit shown on the hashrate value above the chart.
 */
function unitDivisorFor(maxValue: number): number {
  let divisor = 1;
  let value = maxValue;
  while (value >= 1000 && divisor < 1e18) {
    value /= 1000;
    divisor *= 1000;
  }
  return divisor;
}

/** Trim a scaled axis value to a short label (e.g. 180, 12.5, 0). */
function trimAxisNumber(value: number): string {
  if (value === 0) return '0';
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return (Math.round(value * 10) / 10).toString();
  return (Math.round(value * 100) / 100).toString();
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

export function HashrateChart({
  data,
  period,
  isLoading = false,
  height = 200,
  onDataPointSelect,
  className = '',
  variant = 'default',
}: HashrateChartProps) {
  const card = variant === 'card';
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

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const hashrateField = getHashrateField(period);
    return data.map((point) => [
      point.timestamp * 1000,
      point[hashrateField] as number,
    ]);
  }, [data, period]);

  // Largest value in view — drives the compact card y-axis unit + labels.
  const maxValue = useMemo(
    () => chartData.reduce((m, [, v]) => (v > m ? v : m), 0),
    [chartData]
  );

  // Generate chart options
  const option = useMemo(() => {
    if (chartData.length === 0) return null;

    const divisor = unitDivisorFor(maxValue);

    return {
      backgroundColor: 'transparent',
      grid: card
        ? { left: 34, right: 6, top: 8, bottom: 22, containLabel: false }
        : { left: 55, right: 15, top: 15, bottom: 25, containLabel: false },
      xAxis: {
        type: 'time' as const,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: card ? colors.textFaint : colors.textMuted,
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
        // Fixed 0-based range with 3 intervals → exactly 4 labels (e.g. 180/120/60/0).
        ...(card ? { min: 0, splitNumber: 3 } : {}),
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: card ? colors.textFaint : colors.textMuted,
          fontSize: card ? 9 : 10,
          formatter: (value: number) =>
            card ? trimAxisNumber(value / divisor) : formatHashrate(value),
        },
        splitLine: {
          lineStyle: {
            color: card ? 'rgba(255,255,255,0.06)' : colors.chartGrid,
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
            width: card ? 1.6 : 2,
          },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: card
                ? [
                    { offset: 0, color: 'rgba(255, 255, 255, 0.14)' },
                    { offset: 1, color: 'rgba(255, 255, 255, 0)' },
                  ]
                : [
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
          return `${timeStr}\n${formatHashrate(value)}`;
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
  }, [chartData, period, card, maxValue]);

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

    const handleClick = (params: { dataIndex?: number }) => {
      if (params.dataIndex !== undefined && data[params.dataIndex]) {
        onDataPointSelect(data[params.dataIndex]);
      }
    };

    chart.on('click', handleClick);
    return () => {
      chart.off('click', handleClick);
    };
  }, [onDataPointSelect, data]);

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
    return <ChartSkeleton height={height} className={className} square={card} />;
  }

  // Show empty state if no data
  if (!data || data.length === 0) {
    return (
      <View
        className={`items-center justify-center ${card ? '' : 'bg-secondary rounded-xl'} ${className}`}
        style={{ height }}
      />
    );
  }

  // SvgChart should be loaded by now
  const ChartComponent = getSvgChart();
  if (!ChartComponent) {
    return <ChartSkeleton height={height} className={className} square={card} />;
  }

  return (
    <View
      className={`overflow-hidden ${card ? '' : 'bg-secondary rounded-xl'} ${className}`}
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
