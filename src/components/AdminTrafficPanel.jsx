/**
 * Visitor traffic, day by day.
 *
 * The dashboard could say how many orders and accounts existed but never how
 * many people had actually been to the site, which is the first question asked
 * after a launch. The chart is plain SVG rather than a charting library — one
 * series of thirty bars does not justify the download.
 */

const CHART_WIDTH = 720
const CHART_HEIGHT = 160
const CHART_PADDING = { top: 8, right: 4, bottom: 20, left: 28 }

function formatDayLabel(isoDate) {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

function formatFullDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function VisitsChart({ daily }) {
  const peak = Math.max(1, ...daily.map((day) => day.visitors))
  const plotWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const plotHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const slot = plotWidth / Math.max(1, daily.length)
  const barWidth = Math.max(3, slot * 0.62)

  // Whole numbers only — half a visit is not a thing, so a peak of 3 gets
  // gridlines at 0/2/3 rather than 0/1.5/3.
  const midline = Math.max(1, Math.round(peak / 2))

  return (
    <svg
      className="traffic-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`Visitors per day over the last ${daily.length} days, peaking at ${peak}`}
    >
      {[0, midline, peak].map((value) => {
        const y = CHART_PADDING.top + plotHeight - (value / peak) * plotHeight
        return (
          <g key={`grid-${value}`}>
            <line
              className="traffic-chart-grid"
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={y}
              y2={y}
            />
            <text className="traffic-chart-axis" x={CHART_PADDING.left - 6} y={y + 3.5}>
              {value}
            </text>
          </g>
        )
      })}

      {daily.map((day, index) => {
        const height = (day.visitors / peak) * plotHeight
        const x = CHART_PADDING.left + index * slot + (slot - barWidth) / 2
        const y = CHART_PADDING.top + plotHeight - height
        const isLabelled = index % 5 === 0 || index === daily.length - 1

        return (
          <g key={day.date}>
            <rect
              className={day.visitors > 0 ? 'traffic-chart-bar' : 'traffic-chart-bar is-empty'}
              x={x}
              y={day.visitors > 0 ? y : CHART_PADDING.top + plotHeight - 1}
              width={barWidth}
              height={day.visitors > 0 ? Math.max(2, height) : 1}
              rx="1.5"
            >
              <title>{`${formatFullDate(day.date)} — ${day.visitors} visitor${day.visitors === 1 ? '' : 's'}`}</title>
            </rect>
            {isLabelled ? (
              <text
                className="traffic-chart-axis"
                x={x + barWidth / 2}
                y={CHART_HEIGHT - 6}
                textAnchor="middle"
              >
                {formatDayLabel(day.date)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function BreakdownList({ title, items, emptyLabel }) {
  return (
    <div className="traffic-breakdown">
      <h4>{title}</h4>
      <div className="dashboard-daily-list">
        {items.length > 0 ? (
          items.map((item) => (
            <p key={`${title}-${item.label}`}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </p>
          ))
        ) : (
          <p>
            <span>{emptyLabel}</span>
            <strong>0</strong>
          </p>
        )}
      </div>
    </div>
  )
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) {
    return '--'
  }
  if (seconds < 60) {
    return `${seconds}s`
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function AdminTrafficPanel({ traffic }) {
  const daily = Array.isArray(traffic?.daily) ? traffic.daily : []
  const totals = traffic?.totals || {}
  const funnel = Array.isArray(traffic?.funnel) ? traffic.funnel : []
  const visits = funnel[0]?.count || 0

  return (
    <>
      <section className="order-detail-card dashboard-daily-orders">
        <h3>Visitors</h3>
        <p className="dashboard-table-note">
          A visitor is one browser, counted once no matter how often they come back — so
          &ldquo;new&rdquo; means someone the site had never seen before. Signing in is not
          required to be counted. Browsers opened once with <code>?analytics=off</code> are
          left out, so studio testing never shows up here.
        </p>

        <div className="stats-grid traffic-stats">
          <article className="stat-card">
            <p>New Today</p>
            <strong>{totals.new_today ?? 0}</strong>
          </article>
          <article className="stat-card">
            <p>New This Week</p>
            <strong>{totals.new_7d ?? 0}</strong>
          </article>
          <article className="stat-card">
            <p>Active ({traffic?.window_days ?? 30}d)</p>
            <strong>{totals.active_window ?? 0}</strong>
          </article>
          <article className="stat-card">
            <p>Came Back ({traffic?.window_days ?? 30}d)</p>
            <strong>{totals.returning_window ?? 0}</strong>
          </article>
          <article className="stat-card">
            <p>Visitors Ever</p>
            <strong>{totals.visitors_all_time ?? 0}</strong>
          </article>
        </div>

        {daily.length > 0 ? (
          <VisitsChart daily={daily} />
        ) : (
          <p className="dashboard-table-note">No visitors recorded yet.</p>
        )}
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>Where New Visitors Came From</h3>
        <p className="dashboard-table-note">
          Recorded on a visitor&rsquo;s first arrival only, so this is what brought people to
          the site rather than where they happened to be last.
        </p>
        <div className="traffic-breakdown-grid">
          <BreakdownList
            title="Source"
            items={traffic?.referrers || []}
            emptyLabel="No referrers recorded yet."
          />
          <BreakdownList
            title="First page seen"
            items={traffic?.landing_pages || []}
            emptyLabel="No landing pages recorded yet."
          />
          <BreakdownList
            title="Device"
            items={traffic?.devices || []}
            emptyLabel="No devices recorded yet."
          />
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>What They Looked At</h3>
        <div className="traffic-breakdown-grid">
          <BreakdownList
            title="Most viewed"
            items={(traffic?.top_artwork_ids || []).map((item) => ({
              label: item.title,
              count: item.count,
            }))}
            emptyLabel="No pieces viewed yet."
          />
          <BreakdownList
            title="Most previewed on a wall"
            items={(traffic?.top_ar_previews || []).map((item) => ({
              label: item.title,
              count: item.count,
            }))}
            emptyLabel="No wall previews yet."
          />
          <div className="traffic-breakdown">
            <h4>How far down the store</h4>
            <div className="dashboard-daily-list">
              {(traffic?.scroll_depth || []).length > 0 ? (
                traffic.scroll_depth.map((item) => (
                  <p key={`scroll-${item.label}`}>
                    <span>Reached {item.label}</span>
                    <strong>{item.count}</strong>
                  </p>
                ))
              ) : (
                <p>
                  <span>No scroll data yet.</span>
                  <strong>0</strong>
                </p>
              )}
              <p>
                <span>Median time to first piece</span>
                <strong>{formatDuration(traffic?.seconds_to_first_view)}</strong>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>Searches That Found Nothing</h3>
        <p className="dashboard-table-note">
          Someone said exactly what they wanted and the studio did not have it. The clearest
          list there is of what to paint next.
        </p>
        <div className="dashboard-daily-list">
          {(traffic?.failed_searches || []).length > 0 ? (
            traffic.failed_searches.map((item) => (
              <p key={`miss-${item.label}`}>
                <span>&ldquo;{item.label}&rdquo;</span>
                <strong>{item.count}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>Every search has found something so far.</span>
              <strong>0</strong>
            </p>
          )}
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>How Far Visitors Got</h3>
        <p className="dashboard-table-note">
          Each step counts the visitors who reached it, over the last{' '}
          {traffic?.window_days ?? 30} days. Where the drop between two steps is largest is
          where the site is losing people.
        </p>
        <div className="traffic-funnel">
          {funnel.map((step) => {
            const share = visits > 0 ? Math.round((step.count / visits) * 100) : 0
            return (
              <div key={step.stage} className="traffic-funnel-step">
                <span className="traffic-funnel-label">{step.stage}</span>
                <span className="traffic-funnel-track">
                  <span className="traffic-funnel-fill" style={{ width: `${share}%` }} />
                </span>
                <strong className="traffic-funnel-value">
                  {step.count}
                  <span>{share}%</span>
                </strong>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

export default AdminTrafficPanel
