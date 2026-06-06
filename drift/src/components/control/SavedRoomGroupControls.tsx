import { useState } from "react";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  type SavedRoomGroup,
} from "../../types/config";

type SavedRoomGroupControlsProps = {
  groups: SavedRoomGroup[];
  onCreateGroup: (name: string) => Promise<boolean>;
  onDeleteGroup: (groupId: string) => Promise<boolean>;
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>;
  onSearchQueryChange: (query: string) => void;
  onSelectedGroupChange: (groupId: string) => void;
  searchQuery: string;
  selectedGroupId: string;
};

export function SavedRoomGroupControls({
  groups,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onSearchQueryChange,
  onSelectedGroupChange,
  searchQuery,
  selectedGroupId,
}: SavedRoomGroupControlsProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingDeleteGroup, setPendingDeleteGroup] =
    useState<SavedRoomGroup | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const selectedGroup =
    selectedGroupId === ALL_SAVED_ROOM_GROUP_ID
      ? null
      : groups.find((group) => group.id === selectedGroupId) ?? null;

  async function createGroup() {
    const created = await onCreateGroup(newGroupName);
    if (created) {
      setNewGroupName("");
      setIsCreatingGroup(false);
    }
  }

  function startCreate() {
    setIsCreatingGroup((current) => !current);
    setRenamingGroupId(null);
    setPendingDeleteGroup(null);
  }

  function startRename(group: SavedRoomGroup) {
    setRenamingGroupId(group.id);
    setRenameDraft(group.name);
    setPendingDeleteGroup(null);
    setIsCreatingGroup(false);
  }

  async function saveRename() {
    if (!renamingGroupId) {
      return;
    }
    const renamed = await onRenameGroup(renamingGroupId, renameDraft);
    if (renamed) {
      setRenamingGroupId(null);
      setRenameDraft("");
    }
  }

  function requestDelete(group: SavedRoomGroup) {
    setRenamingGroupId(null);
    setIsCreatingGroup(false);
    setPendingDeleteGroup(group);
  }

  async function confirmDelete() {
    if (!pendingDeleteGroup) {
      return;
    }
    const deleted = await onDeleteGroup(pendingDeleteGroup.id);
    if (deleted) {
      setPendingDeleteGroup(null);
    }
  }

  return (
    <div className="saved-room-group-controls">
      <div className="saved-room-command-row">
        <input
          aria-label="搜索常用直播间"
          className="saved-room-search-input"
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          placeholder="搜索房间号、名称、主播"
          type="search"
          value={searchQuery}
        />
        <div className="saved-room-inline-actions">
          <button
            className={isCreatingGroup ? "is-active" : ""}
            onClick={startCreate}
            type="button"
          >
            新建
          </button>
          {selectedGroup ? (
            <>
              <button
                className={
                  renamingGroupId === selectedGroup.id ? "is-active" : ""
                }
                onClick={() => startRename(selectedGroup)}
                type="button"
              >
                改名
              </button>
              <button
                disabled={groups.length <= 1}
                onClick={() => requestDelete(selectedGroup)}
                type="button"
              >
                删除
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="saved-room-group-tabs" role="tablist">
        <button
          className={
            selectedGroupId === ALL_SAVED_ROOM_GROUP_ID ? "is-active" : ""
          }
          onClick={() => onSelectedGroupChange(ALL_SAVED_ROOM_GROUP_ID)}
          type="button"
        >
          全部
        </button>
        {groups.map((group) => (
          <button
            className={selectedGroupId === group.id ? "is-active" : ""}
            key={group.id}
            onClick={() => onSelectedGroupChange(group.id)}
            type="button"
          >
            {group.name}
          </button>
        ))}
      </div>

      {isCreatingGroup ||
      (selectedGroup && renamingGroupId === selectedGroup.id) ? (
        <div className="saved-room-group-editor">
          {isCreatingGroup ? (
            <div className="saved-room-group-edit-row">
              <input
                aria-label="新分组名称"
                onChange={(event) => setNewGroupName(event.currentTarget.value)}
                placeholder="新分组"
                value={newGroupName}
              />
              <button
                disabled={!newGroupName.trim()}
                onClick={createGroup}
                type="button"
              >
                添加
              </button>
              <button
                onClick={() => {
                  setIsCreatingGroup(false);
                  setNewGroupName("");
                }}
                type="button"
              >
                取消
              </button>
            </div>
          ) : null}

          {selectedGroup && renamingGroupId === selectedGroup.id ? (
            <div className="saved-room-group-edit-row">
              <input
                aria-label="重命名分组"
                onChange={(event) => setRenameDraft(event.currentTarget.value)}
                value={renameDraft}
              />
              <button
                disabled={!renameDraft.trim()}
                onClick={saveRename}
                type="button"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setRenamingGroupId(null);
                  setRenameDraft("");
                }}
                type="button"
              >
                取消
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {pendingDeleteGroup ? (
        <div className="saved-room-confirm-backdrop" role="presentation">
          <div
            aria-labelledby="saved-room-delete-title"
            aria-modal="true"
            className="saved-room-confirm-dialog"
            role="dialog"
          >
            <strong id="saved-room-delete-title">删除分组</strong>
            <p>
              确认删除“{pendingDeleteGroup.name}”？该分组下的常用直播间将变为未分组，只在“全部”中显示。
            </p>
            <div className="saved-room-confirm-actions">
              <button onClick={confirmDelete} type="button">
                确认
              </button>
              <button
                onClick={() => setPendingDeleteGroup(null)}
                type="button"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
