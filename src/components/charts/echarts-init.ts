/**
 * Shared ECharts lazy initialization
 * Used by both HashrateChart and UserHashrateChart to prevent double registration
 */

// Lazy-loaded ECharts modules (shared across all chart components)
let echarts: typeof import('echarts/core') | null = null;
let SvgChart: React.ComponentType<{ ref: React.Ref<unknown> }> | null = null;
let isEchartsRegistered = false;
let initPromise: Promise<typeof import('echarts/core')> | null = null;

export async function initEcharts(): Promise<typeof import('echarts/core')> {
  // Return cached instance if already registered
  if (isEchartsRegistered && echarts) return echarts;

  // Return existing promise if initialization is in progress
  if (initPromise) return initPromise;

  // Start initialization
  initPromise = (async () => {
    const [echartsCore, svgChartModule, lineChartModule, componentsModule] = await Promise.all([
      import('echarts/core'),
      import('@wuba/react-native-echarts/svgChart'),
      import('echarts/charts'),
      import('echarts/components'),
    ]);

    echarts = echartsCore;
    SvgChart = svgChartModule.default;

    echarts.use([
      svgChartModule.SVGRenderer,
      lineChartModule.LineChart,
      componentsModule.GridComponent,
      componentsModule.TooltipComponent,
    ]);

    isEchartsRegistered = true;
    return echarts;
  })();

  return initPromise;
}

export function getEcharts() {
  return echarts;
}

export function getSvgChart() {
  return SvgChart;
}

export function isEchartsReady() {
  return isEchartsRegistered;
}
