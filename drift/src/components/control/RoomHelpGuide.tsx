import phoneScreenshot from "/phone.png";

type RoomHelpGuideProps = {
  onClose: () => void;
};

export function RoomHelpGuide({ onClose }: RoomHelpGuideProps) {
  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <header className="help-card-header">
          <strong>如何获取房间号</strong>
          <button onClick={onClose} type="button">×</button>
        </header>
        <div className="help-card-body">
          <section>
            <h2>PC 端（浏览器）</h2>
            <p>打开任意直播间，浏览器地址栏中的数字即为房间号：</p>
            <pre>https://live.bilibili.com/1234{"\n"}                          ^^^^{"\n"}                          房间号</pre>
          </section>
          <section>
            <h2>手机端（B 站 App）</h2>
            <ol>
              <li>进入任意直播间</li>
              <li>点击直播间左上角的<strong>主播头像</strong>会弹出主播主页</li>
              <li>在主播主页（头像下方），可看到<strong>房间号</strong>，通常为一串数字</li>
            </ol>
            <img alt="手机端查看房间号示意" className="help-phone-img" src={phoneScreenshot} />
          </section>
          <p className="help-hint">房间号是纯数字，如 <code>1234</code>，不是主播名或房间标题。</p>
        </div>
      </div>
    </div>
  );
}
