type MockDanmakuPanelProps = {
  active: boolean;
  rate: number;
  totalGenerated: number;
  onStart: () => void;
  onStop: () => void;
  onRateChange: (rate: number) => void;
  onBurst: () => void;
};

export function MockDanmakuPanel({
  active,
  rate,
  totalGenerated,
  onStart,
  onStop,
  onRateChange,
  onBurst,
}: MockDanmakuPanelProps) {
  return (
    <section className="mock-panel" aria-label="Mock danmaku controls">
      <header>
        <strong>Mock 弹幕</strong>
      </header>

      <div className="mock-buttons">
        {active ? (
          <button onClick={onStop} type="button">
            停止
          </button>
        ) : (
          <button onClick={onStart} type="button">
            启动
          </button>
        )}
        <button onClick={onBurst} type="button">
          模拟爆发
        </button>
      </div>

      <label className="mock-slider">
        <span>速率</span>
        <input
          max="200"
          min="5"
          onChange={(event) => onRateChange(Number(event.target.value))}
          step="5"
          type="range"
          value={rate}
        />
        <strong>{rate} 条/秒</strong>
      </label>

      <footer className="mock-status">
        <span className={`mock-dot${active ? " is-active" : ""}`} />
        <span>{active ? "运行中" : "已停止"}</span>
        <span className="mock-count">已生成 {totalGenerated.toLocaleString()} 条</span>
      </footer>
    </section>
  );
}
