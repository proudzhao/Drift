type FilterSettingsProps = {
  draftBlockedWords: string;
  onBlockedWordsChange: (value: string) => void;
  onSaveBlockedWords: () => void;
};

export function FilterSettings({
  draftBlockedWords,
  onBlockedWordsChange,
  onSaveBlockedWords,
}: FilterSettingsProps) {
  return (
    <div className="settings-page filter-settings">
      <label className="textarea-row">
        <span>屏蔽词</span>
        <textarea
          onBlur={onSaveBlockedWords}
          onChange={(event) => onBlockedWordsChange(event.currentTarget.value)}
          placeholder="每行一个词"
          rows={12}
          value={draftBlockedWords}
        />
      </label>
      <div className="settings-actions single-action">
        <button onClick={onSaveBlockedWords} type="button">
          保存屏蔽词
        </button>
      </div>
    </div>
  );
}
