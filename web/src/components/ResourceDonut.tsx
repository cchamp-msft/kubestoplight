import { memo, useMemo } from 'react';
import { DonutChart } from '@carbon/charts-react';
import type { DonutChartOptions } from '@carbon/charts-react';

interface Props {
  title: string;
  total: number;
  statusCounts: Record<string, number>;
  colorMap: Record<string, string>;
}

const ResourceDonut = memo(function ResourceDonut({ title, total, statusCounts, colorMap }: Props) {
  const data = useMemo(
    () =>
      Object.entries(statusCounts ?? {})
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({ group: status, value: count })),
    [statusCounts],
  );

  const options = useMemo<DonutChartOptions>(
    () => ({
      theme: 'g100',
      height: '92px',
      resizable: false,
      legend: { enabled: false },
      toolbar: { enabled: false },
      tooltip: { enabled: true },
      pie: { labels: { enabled: false } },
      donut: {
        center: {
          label: title,
          number: total,
          numberFontSize: () => 18,
          titleFontSize: () => 11,
        },
        alignment: 'center',
      },
      color: { scale: colorMap },
    }),
    [title, total, colorMap],
  );

  if (total === 0) {
    return (
      <div className="ksl-donut ksl-donut--empty">
        <span>No {title.toLowerCase()}</span>
      </div>
    );
  }

  return (
    <div className="ksl-donut">
      <DonutChart data={data} options={options} />
    </div>
  );
});

export default ResourceDonut;
